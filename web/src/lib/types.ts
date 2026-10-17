import type { VoiceCommand } from '../../../shared/voiceCommands';

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
  source: 'gemini' | 'heuristic' | 'heuristic-dev' | 'priya_demo' | 'out_of_scope' | 'command';
  assistant_message?: string;
  /** What the voice turn was. Absent on typed text and older responses. */
  intent?: 'answer' | 'correction' | 'question' | 'other' | 'command';
  /** Spoken before next_ask: the answer to a question, or what a correction changed. */
  reply?: string | null;
  /** Set when intent is 'command' (read-back, review and confirm only). */
  command?: VoiceCommand | null;
  /** Language of this utterance. English path omits nothing required — default en. */
  reply_lang?: 'en' | 'hi' | 'mixed';
  /** BCP-47 code of the language the speak function heard (auto-detected). */
  spoken_lang?: string;
  /** BCP-47 code next_ask is written in; English when no question in spoken_lang was usable. */
  next_ask_lang?: string;
  /** next_ask in English, spoken when the device has no voice for next_ask_lang. */
  next_ask_en?: string | null;
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
  /** When set, the field is only required and shown on these journeys. */
  journey_modes?: string[];
}
