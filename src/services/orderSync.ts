import { supabase } from '../lib/supabase';
import { fetchExecutiveOrders, transformFederalRegisterData } from '../api/federalRegister';

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

export async function syncOrders() {
  try {
    console.log('Starting order sync process...');
    
    // First, fetch from Federal Register
    const frResponse = await fetchExecutiveOrders();
    const frOrders = frResponse.results.map(transformFederalRegisterData);
    console.log(`Fetched ${frOrders.length} orders from Federal Register`);

    // Then, fetch the latest White House matches
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

    // Process Federal Register orders
    for (const order of frOrders) {
      if (!order.number) {
        console.log('Skipping order with no number:', order.title);
        continue;
      }
      
      // Find matching White House entry if any
      const whMatch = whMatches?.find(match => 
        match.federal_register_id === order.document_number
      );
      
      const orderData = {
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

      try {
        // First try to find an existing record by federal_register_id or number
        const { data: existingOrder } = await supabase
          .from('executive_orders')
          .select('id, number, federal_register_id')
          .or(`federal_register_id.eq.${order.document_number},number.eq.${order.number}`)
          .maybeSingle();

        if (existingOrder) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('executive_orders')
            .update(orderData)
            .eq('id', existingOrder.id);

          if (updateError) throw updateError;
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('executive_orders')
            .insert(orderData);

          if (insertError) throw insertError;
        }
        successCount++;
      } catch (error) {
        console.error('Error upserting order:', {
          number: orderData.number,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errorCount++;
      }
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
      total: frOrders.length + (whMatches?.length || 0),
      success: successCount,
      errors: errorCount
    });

    return { 
      success: true,
      stats: {
        total: frOrders.length + (whMatches?.length || 0),
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