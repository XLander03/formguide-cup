/** Shared contract for dynamic form ingest and review. */
export type FieldRecord = {
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
  /** PDF points, bottom-left origin. */
  box: { x: number; y: number; w: number; h: number };
  pdfField?: string;
  maxChars?: number;
};

export type FormVersion = {
  formId: string;
  version: string;
  bankId: string;
  journey: string;
  status: 'draft' | 'published' | 'retired';
  source: 'acroform' | 'ocr';
  pdfPath: string;
  fields: FieldRecord[];
};
