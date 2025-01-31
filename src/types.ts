export interface ExecutiveOrder {
  id: string;
  number: string;
  title: string;
  date: string;
  summary: string;
  category: string;
  status: 'active' | 'revoked' | 'superseded';
  url: string;
  document_number?: string;
  pdf_url?: string;
  html_url?: string;
  type?: string;
  signing_date?: string;
  executive_order_number?: string;
  full_text_xml_url?: string;
  body_html_url?: string;
  json_url?: string;
  disposition_notes?: string;
  correction_of?: string;
  corrected_by?: string;
  whitehouse_title?: string;
  whitehouse_date?: string;
  whitehouse_url?: string;
}

export interface PolicyProposal {
  id: string;
  source: 'Project2025' | 'Agenda45';
  title: string;
  category: string;
  summary: string;
  relatedOrders?: string[];
}

export interface FederalRegisterResponse {
  count: number;
  total_pages: number;
  results: any[];
}

export interface WhiteHouseAction {
  title: string;
  date: string;
  url: string;
  type: string;
}

export interface TitleMatch {
  id: string;
  whitehouse_title: string;
  whitehouse_date: string;
  whitehouse_url: string;
  federal_register_id: string | null;
  match_confidence: number;
  matched_at: string;
  created_at: string;
}