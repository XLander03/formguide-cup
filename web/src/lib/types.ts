export type FieldValue = string | boolean | null | undefined;

export type FormValues = Record<string, FieldValue>;

export type GateAnswer =
  | {
      type: 'choice';
      choice: string | null;
      probabilities?: Record<string, number>;
      confidence?: number;
    }
  | {
      type: 'score';
      score: number | null;
      levels?: string[];
      probabilities?: Record<string, number>;
      confidence?: number;
    }
  | {
      type: 'noul';
      noul: number | null;
      confidence?: number;
    };

export interface ExtractResponse {
  field_updates: FormValues;
  /** Per-field model confidence (0–1) from the single field-JSON call. Absent = treat as high. */
  field_confidence?: Record<string, { confidence: number; reason?: string }>;
  missing_required: string[];
  next_ask: string | null;
  gates: { answers: Record<string, GateAnswer> };
  completeness: 'empty' | 'partial_core' | 'demo_ready' | 'full_bank_packet';
  refuse_live_submit: boolean;
  refuse_message?: string;
  source: 'gemini' | 'heuristic' | 'heuristic-dev' | 'priya_demo';
  assistant_message?: string;
  /** Language of this utterance. English path omits nothing required — default en. */
  reply_lang?: 'en' | 'hi' | 'mixed';
}

export interface SchemaField {
  id: string;
  label_en: string;
  type: string;
  required: boolean;
  required_if?: Record<string, unknown> | null;
  group: string;
  enum_ref?: string;
  validation?: Record<string, unknown>;
  bank_varies?: boolean;
  voice_hints?: string[];
  notes?: string;
  section?: string;
}
