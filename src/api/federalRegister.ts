const BASE_URL = 'https://www.federalregister.gov/api/v1';

export async function fetchExecutiveOrders(page = 1): Promise<FederalRegisterResponse> {
  // Define the fields we want to retrieve
  const fields = [
    'title',
    'executive_order_number',
    'signing_date',
    'publication_date',
    'document_number',
    'html_url',
    'pdf_url',
    'abstract',
    'disposition_notes'
  ];

  // Create params object with fields as separate entries
  const params = new URLSearchParams();
  params.append('per_page', '20');
  params.append('page', page.toString());
  params.append('order', 'document_number');
  params.append('sort', 'desc');
  params.append('conditions[type][]', 'PRESDOCU');
  params.append('conditions[presidential_document_type][]', 'executive_order');
  
  // Add each field separately
  fields.forEach(field => {
    params.append('fields[]', field);
  });

  const apiUrl = `${BASE_URL}/documents.json?${params.toString()}`;
  console.log('Fetching from Federal Register API:', apiUrl);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Federal Register API response:', {
      count: data.count,
      total_pages: data.total_pages,
      results_count: data.results?.length
    });
    
    return {
      count: data.count || 0,
      total_pages: data.total_pages || 1,
      results: data.results || []
    };
  } catch (error) {
    console.error('Error fetching executive orders:', error);
    throw new Error('Failed to fetch executive orders. Please try again later.');
  }
}

export function transformFederalRegisterData(data: any): ExecutiveOrder {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data format');
  }

  console.log('Transforming Federal Register data:', {
    document_number: data.document_number,
    title: data.title,
    executive_order_number: data.executive_order_number
  });

  // Determine status based on disposition notes
  let status: 'active' | 'revoked' | 'superseded' = 'active';
  if (data.disposition_notes) {
    const notes = data.disposition_notes.toLowerCase();
    if (notes.includes('revoked')) {
      status = 'revoked';
    } else if (notes.includes('superseded')) {
      status = 'superseded';
    }
  }

  // Determine category based on title and abstract
  let category = 'Uncategorized';
  const text = `${data.title} ${data.abstract || ''}`.toLowerCase();
  if (text.includes('military') || text.includes('defense') || text.includes('veteran')) {
    category = 'Military & Defense';
  } else if (text.includes('economy') || text.includes('economic') || text.includes('financial')) {
    category = 'Economy';
  } else if (text.includes('health') || text.includes('medical') || text.includes('healthcare')) {
    category = 'Healthcare';
  } else if (text.includes('education') || text.includes('school')) {
    category = 'Education';
  } else if (text.includes('environment') || text.includes('climate')) {
    category = 'Environment';
  }

  return {
    id: data.document_number || '',
    number: data.executive_order_number || 'N/A',
    title: data.title || 'Untitled',
    date: data.signing_date || data.publication_date || new Date().toISOString(),
    summary: data.abstract || 'No summary available',
    category,
    status,
    url: data.html_url || '',
    document_number: data.document_number,
    pdf_url: data.pdf_url,
    html_url: data.html_url,
    type: 'PRESDOCU',
    signing_date: data.signing_date,
    executive_order_number: data.executive_order_number
  };
}