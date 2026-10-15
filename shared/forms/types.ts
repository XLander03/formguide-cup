export interface FieldRecord {
  id: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'phone' | 'email' | 'pin' | 'checkbox' | 'choice' | 'partial';
  options?: string[];
  partial?: { keep: 'last'; count: number };
  required: boolean;
  pii: boolean;
  section?: string;
  order: number;
  confidence: number;
  checked: boolean;
  page: number;
  box: { x: number; y: number; w: number; h: number } /* PDF points, bottom-left origin */;
  pdfField?: string;
  maxChars?: number;
}

export interface FormVersion {
  formId: string;
  version: number;
  bankId: string;
  journey: string;
  status: 'draft' | 'published' | 'retired';
  source: 'acroform' | 'ocr';
  pdfPath: string;
  fields: FieldRecord[];
}
