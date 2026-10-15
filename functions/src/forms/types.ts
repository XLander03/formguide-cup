/**
 * Per-form field model. HDFC v1 is the current aof_kyc_demo_v1 schema plus
 * the pdfFill mapping (tick boxes and Aadhaar last-4), not a new bank form id.
 */

export type FieldType =
  | 'text'
  | 'date'
  | 'number'
  | 'phone'
  | 'email'
  | 'pin'
  | 'checkbox'
  | 'choice'
  | 'partial';

export interface PdfBox {
  /** PDF points, bottom-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldRecord {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  partial?: { keep: 'last'; count: number };
  required: boolean;
  pii: boolean;
  section?: string;
  order: number;
  confidence: number;
  checked: boolean;
  /** 1-based PDF page. 0 means this logical field has no single widget on the PDF. */
  page: number;
  box: PdfBox;
  pdfField?: string;
  maxChars?: number;
}

export type FormStatus = 'draft' | 'published' | 'retired';
export type FormSource = 'acroform' | 'ocr';

export interface FormVersion {
  formId: string;
  version: string;
  bankId: string;
  journey: string;
  status: FormStatus;
  source: FormSource;
  pdfPath: string;
  fields: FieldRecord[];
}

/** How one logical value writes one AcroForm widget. Kept beside FieldRecord so pdfFill is data-driven. */
export interface PdfWrite {
  pdfField: string;
  op: 'text' | 'check';
  source?: string;
  when?: Record<string, string | boolean>;
  equals?: string | boolean;
  equalsAny?: Array<string | boolean>;
  whenTrue?: boolean;
  transform?: 'dmy' | 'pan' | 'gender' | 'digit' | 'today';
  digitIndex?: number;
}

/** Original aof_kyc_demo_v1 field, stored on the form so schema loading round-trips. */
export interface SchemaFieldSnapshot {
  id: string;
  label_en: string;
  type: string;
  required: boolean;
  required_if?: Record<string, unknown> | null;
  group: string;
  section?: string;
  enum_ref?: string;
  validation?: Record<string, unknown>;
  bank_varies?: boolean;
  voice_hints?: string[];
  notes?: string;
  default?: string;
}

export interface BoundField extends FieldRecord {
  group?: string;
  schemaField?: SchemaFieldSnapshot;
  writes?: PdfWrite[];
}
