import { supabase } from '../lib/supabase';
import { fetchExecutiveOrders, transformFederalRegisterData } from '../api/federalRegister';
import type { ExecutiveOrder, TitleMatch } from '../types';

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

      if (inserts.length > 0) {
        const { error: insertError } = await supabase
          .from('executive_orders')
          .insert(inserts);

        if (insertError) {
          // Bulk insert failed — retry row by row so one bad record
          // doesn't sink the whole page.
          console.error('Bulk insert failed, retrying row by row:', insertError.message);
          for (const row of inserts) {
            const { error: rowError } = await supabase
              .from('executive_orders')
              .insert(row);
            if (rowError) {
              console.error('Error inserting order:', { number: row.number, error: rowError.message });
              errorCount++;
            } else {
              successCount++;
            }
          }
        } else {
          successCount += inserts.length;
        }
      }

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('executive_orders')
          .update(update.data)
          .eq('id', update.id);
        if (updateError) {
          console.error('Error updating order:', { number: update.data.number, error: updateError.message });
          errorCount++;
        } else {
          successCount++;
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
      for (const whMatch of whMatches) {
        if (!whMatch.federal_register_id) {
          try {
            // Check if an order with this White House URL already exists
            const { data: existingOrder } = await supabase
              .from('executive_orders')
              .select('id')
              .eq('whitehouse_url', whMatch.whitehouse_url)
              .maybeSingle();

            if (!existingOrder) {
              const orderData = {
                number: `PENDING-${Date.now()}`, // Temporary number until matched
                title: whMatch.whitehouse_title,
                signing_date: whMatch.whitehouse_date,
                whitehouse_title: whMatch.whitehouse_title,
                whitehouse_date: whMatch.whitehouse_date,
                whitehouse_url: whMatch.whitehouse_url,
                status: 'pending' as const,
                summary: 'Pending Federal Register match'
              };

              const { error: insertError } = await supabase
                .from('executive_orders')
                .insert(orderData);

              if (insertError) throw insertError;
              successCount++;
            }
          } catch (error) {
            console.error('Error processing White House match:', error);
            errorCount++;
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
