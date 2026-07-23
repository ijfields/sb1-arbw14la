import { supabase } from '../lib/supabase';
import { adminPost } from './adminApi';
import { fetchExecutiveOrders, transformFederalRegisterData } from '../api/federalRegister';
import type { ExecutiveOrder, TitleMatch } from '../types';

interface OrderBatchResult {
  inserted: number;
  updated: number;
  errors: Array<{ id?: string; number?: string; error: string }>;
}

// Safety bound: 20 pages x 100 per page covers the ~1,550 executive orders
// the Federal Register currently exposes, with headroom.
const MAX_PAGES = 20;
const PAGE_DELAY_MS = 150;

// Map API status to database enum
function mapStatusToVerificationStatus(apiStatus: string): 'pending' | 'verified' | 'superseded' | 'revoked' {
  switch (apiStatus) {
    case 'active':
      return 'verified';
    case 'superseded':
      return 'superseded';
    case 'revoked':
      return 'revoked';
    default:
      return 'pending';
  }
}

function buildOrderData(order: ExecutiveOrder, whMatch: TitleMatch | undefined) {
  return {
    number: order.number,
    title: order.title,
    federal_register_id: order.document_number,
    federal_register_url: order.html_url,
    signing_date: order.signing_date || order.date,
    publication_date: order.date,
    pdf_url: order.pdf_url,
    summary: order.summary,
    category: order.category,
    status: mapStatusToVerificationStatus(order.status),
    // Add White House data if available
    whitehouse_title: whMatch?.whitehouse_title || null,
    whitehouse_date: whMatch?.whitehouse_date || null,
    whitehouse_url: whMatch?.whitehouse_url || null
  };
}

export async function syncOrders() {
  try {
    console.log('Starting order sync process...');

    // Fetch the latest White House matches once, up front
    const { data: whMatches, error: whError } = await supabase
      .from('title_matches')
      .select('*')
      .order('created_at', { ascending: false });

    if (whError) {
      console.error('Error fetching White House matches:', whError);
    } else {
      console.log(`Fetched ${whMatches?.length || 0} White House matches`);
    }

    let successCount = 0;
    let errorCount = 0;
    let fetchedTotal = 0;

    // Walk Federal Register pages (newest orders first)
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= MAX_PAGES) {
      const frResponse = await fetchExecutiveOrders(page);
      totalPages = frResponse.total_pages;

      const orders = frResponse.results
        .map(transformFederalRegisterData)
        .filter(order => {
          if (!order.number || order.number === 'N/A') {
            console.log('Skipping order with no number:', order.title);
            return false;
          }
          return true;
        });

      fetchedTotal += orders.length;
      console.log(`Processing page ${page}/${Math.min(totalPages, MAX_PAGES)} (${orders.length} orders)`);

      // One lookup per page instead of a per-order .or() built from
      // unescaped values: fetch existing rows by id list.
      const docNumbers = orders
        .map(order => order.document_number)
        .filter((value): value is string => Boolean(value));
      const numbers = orders.map(order => order.number);

      const [byDocResult, byNumResult] = await Promise.all([
        docNumbers.length
          ? supabase
              .from('executive_orders')
              .select('id, number, federal_register_id')
              .in('federal_register_id', docNumbers)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('executive_orders')
          .select('id, number, federal_register_id')
          .in('number', numbers)
      ]);

      if (byDocResult.error) throw byDocResult.error;
      if (byNumResult.error) throw byNumResult.error;

      const existingByDoc = new Map(
        (byDocResult.data || []).map(row => [row.federal_register_id, row])
      );
      const existingByNum = new Map(
        (byNumResult.data || []).map(row => [row.number, row])
      );

      const inserts: ReturnType<typeof buildOrderData>[] = [];
      const updates: { id: string; data: ReturnType<typeof buildOrderData> }[] = [];

      for (const order of orders) {
        const whMatch = whMatches?.find(match =>
          match.federal_register_id === order.document_number
        );
        const orderData = buildOrderData(order, whMatch);

        const existingOrder =
          (order.document_number && existingByDoc.get(order.document_number)) ||
          existingByNum.get(order.number);

        if (existingOrder) {
          // Only refresh existing rows on the first page (the most recent
          // orders, where status/disposition changes actually happen) so a
          // routine sync doesn't rewrite the entire history every time.
          if (page === 1) {
            updates.push({ id: existingOrder.id, data: orderData });
          }
        } else {
          inserts.push(orderData);
        }
      }

      // One server-side batch call per page: the admin endpoint performs the
      // bulk insert (with per-row fallback) and per-row updates using the
      // service-role key. Writes no longer use the public anon key.
      if (inserts.length > 0 || updates.length > 0) {
        const result = await adminPost<OrderBatchResult>('/orders/batch', {
          inserts,
          updates
        });
        successCount += result.inserted + result.updated;
        errorCount += result.errors.length;
        for (const e of result.errors) {
          console.error('Error writing order:', e);
        }
      }

      // Beyond the first page, a page with nothing new means the older
      // history below it is already synced — stop walking.
      if (page > 1 && inserts.length === 0) {
        console.log('No new orders on this page; older history already synced.');
        break;
      }

      page++;
      if (page <= totalPages && page <= MAX_PAGES) {
        await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
      }
    }

    if (totalPages > MAX_PAGES) {
      console.warn(`Sync stopped at page cap: fetched ${MAX_PAGES} of ${totalPages} pages`);
    }

    // Process any White House matches that don't have a Federal Register match yet
    if (whMatches) {
      const pendingInserts: Array<Record<string, string | null>> = [];

      for (const whMatch of whMatches) {
        if (!whMatch.federal_register_id) {
          try {
            // Check if an order with this White House URL already exists (SELECT
            // stays client-side).
            const { data: existingOrder } = await supabase
              .from('executive_orders')
              .select('id')
              .eq('whitehouse_url', whMatch.whitehouse_url)
              .maybeSingle();

            if (!existingOrder) {
              pendingInserts.push({
                number: `PENDING-${Date.now()}`, // Temporary number until matched
                title: whMatch.whitehouse_title,
                federal_register_id: null,
                federal_register_url: null,
                signing_date: whMatch.whitehouse_date,
                publication_date: null,
                pdf_url: null,
                summary: 'Pending Federal Register match',
                category: null,
                status: 'pending',
                whitehouse_title: whMatch.whitehouse_title,
                whitehouse_date: whMatch.whitehouse_date,
                whitehouse_url: whMatch.whitehouse_url
              });
            }
          } catch (error) {
            console.error('Error processing White House match:', error);
            errorCount++;
          }
        }
      }

      // Insert the pending rows server-side in batches (max 200 per call).
      if (pendingInserts.length > 0) {
        for (let i = 0; i < pendingInserts.length; i += 200) {
          const chunk = pendingInserts.slice(i, i + 200);
          try {
            const result = await adminPost<OrderBatchResult>('/orders/batch', {
              inserts: chunk,
              updates: []
            });
            successCount += result.inserted;
            errorCount += result.errors.length;
            for (const e of result.errors) {
              console.error('Error inserting White House match:', e);
            }
          } catch (error) {
            console.error('Error inserting White House matches:', error);
            errorCount += chunk.length;
          }
        }
      }
    }

    console.log('Sync completed:', {
      fetched: fetchedTotal,
      success: successCount,
      errors: errorCount
    });

    return {
      success: true,
      stats: {
        total: fetchedTotal + (whMatches?.length || 0),
        success: successCount,
        errors: errorCount
      }
    };
  } catch (error) {
    console.error('Error syncing orders:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
