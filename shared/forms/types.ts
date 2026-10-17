/**
 * Single form contract for ingest, admin review, the journey picker, and HDFC v1.
 * `version` is a string id such as `v1`, matching `forms/{formId}/versions/{version}`.
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
  /**
   * Set at OCR ingest when the self-checking agent (functions/src/ingest/verifyAgent.ts)
   * looked at this field's box on the page image. `verified`: the box was right.
   * `fixed`: the agent moved it and confirmed the new place on a second look. Both are
   * accepted (`checked: true`). `unresolved`: the agent could not confirm a place, so the
   * field waits for an admin (confidence capped at the review line, `checked: false`).
   * `note` is one or two short sentences for the reviewer. Absent when the field was not
   * checked (AcroForm, bank-only optional fields, or the page's check failed).
   */
  agent?: FieldAgent;
}

export interface FieldAgent {
  status: 'verified' | 'fixed' | 'unresolved';
  note: string;
}

/** What the ingest agent did to one form version, for the admin console and review. */
export interface AgentSummary {
  /** Fields the agent gave a verdict on. */
  checked: number;
  fixed: number;
  unresolved: number;
  /** Pages it checked. */
  pages: number;
  /** Pages it tried and could not check (call failed or out of time); their fields stay as placed. */
  pagesFailed?: number;
  durationMs: number;
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
  /** Present on OCR versions the ingest agent checked. */
  agentSummary?: AgentSummary;
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
  /** When set, the field is only shown and required on these journeys. */
  journey_modes?: string[];
}

export interface BoundField extends FieldRecord {
  group?: string;
  schemaField?: SchemaFieldSnapshot;
  writes?: PdfWrite[];
}
