// ============================================================================
// ETCC Platform Types
// ============================================================================

export type Role = 'ADMIN' | 'GERANT' | 'COMPTABLE' | 'EMPLOYE';
export type Language = 'FR' | 'AR';

export interface User {
  id: string;
  username: string;
  email?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: Role;
  preferred_language: Language;
  is_active: boolean;
  last_login_at?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Client {
  id: string;
  commercial_name: string;
  legal_name?: string;
  ice?: string;
  rc?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address: string;
  city?: string;
  reliability_score?: number;
  is_active: boolean;
}

export interface Fournisseur {
  id: string;
  name: string;
  ice?: string;
  rc?: string;
  category?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  bank_name?: string;
  rib?: string;
  iban?: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client_id: string;
  status: 'ACTIVE' | 'LATE' | 'COMPLETED' | 'ARCHIVED';
  budget_amount: number;
  actual_amount: number;
  start_date?: string;
  end_date?: string;
  avg_progress?: number;
  client?: { commercial_name: string };
  _count?: { tasks: number; devis: number; bls: number; invoices: number };
}

export interface Devis {
  id: string;
  number: string;
  client_id: string;
  project_id?: string;
  object?: string;
  site?: string;
  total_ht_brut: number;
  discount_rate: number;
  discount_amount: number;
  total_ht_net: number;
  tva_rate: number;
  tva_amount: number;
  total_ttc: number;
  status: 'DRAFT' | 'SENT' | 'VALIDATED' | 'REJECTED' | 'EXPIRED';
  lines: DevisLine[];
  client?: Client;
}

export interface DevisLine {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_ht: number;
  order: number;
}

export interface Invoice {
  id: string;
  number: string;
  direction: 'ISSUED' | 'RECEIVED';
  source: 'INTERNAL' | 'SCANNED';
  site?: string;
  total_ht_brut: number;
  discount_rate: number;
  total_ht_net: number;
  tva_amount: number;
  total_ttc: number;
  balance: number;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  client?: Client;
  fournisseur?: Fournisseur;
}

export interface Signature {
  id: string;
  name: string;
  image_url: string;
  type: 'UPLOADED' | 'DRAWN' | 'PHOTO_STAMP';
  is_default: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
