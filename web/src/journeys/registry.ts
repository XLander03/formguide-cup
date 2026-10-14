import type { ExtractResponse, FormValues } from '../lib/types';
import type { UtteranceLang } from '../lib/utteranceLang';

/**
 * Stretch journeys register here and keep their own schema, draft, and extractor.
 * Account opening, KYC update, and Re-KYC stay on `aof_kyc_demo_v1`.
 *
 * A parallel journey (debit card reissue) should add one folder, one import in
 * `journeys/index.ts`, and the same id in `functions/src/journeyPacks`.
 * Speak transcribes once. The client fills the pack. There is no second Gemini call.
 */
export interface JourneyFieldView {
  id: string;
  label: string;
  hint: string;
  required: boolean;
  section: string;
  enumRef?: string;
  kind?: 'text' | 'boolean' | 'enum';
}

export interface JourneyPack {
  id: string;
  title: string;
  titleHi: string;
  schemaId: string;
  /** Landing / journey chips removed once this pack is registered. */
  hidesLater: string[];
  card: {
    kind: string;
    name: string;
    blurb: string;
    needs: string[];
  };
  sections: string[];
  enums: Record<string, string[]>;
  enumLabels: Record<string, string>;
  primaryNameField: string;
  sampleLines: readonly string[];
  pickerSamples: readonly { text: string; cardId: string }[];
  speakFields: () => JourneyFieldView[];
  emptyValues: () => FormValues;
  demoValues: () => FormValues;
  demoConfidence: () => Record<string, { confidence: number; reason?: string; confirmed: boolean }>;
  extract: (utterance: string, current: FormValues) => ExtractResponse;
  isRequired: (values: FormValues, id: string) => boolean;
  missing: (values: FormValues) => string[];
  completeness: (
    values: FormValues,
    missing: string[],
  ) => ExtractResponse['completeness'];
  readback: (values: FormValues, lang: UtteranceLang) => string;
  buildPdf: (input: {
    values: FormValues;
    confidence: Record<string, { confidence: number; reason?: string; confirmed?: boolean }>;
  }) => Blob;
}

const packs: JourneyPack[] = [];

export function registerJourney(pack: JourneyPack): void {
  if (packs.some((item) => item.id === pack.id)) return;
  packs.push(pack);
}

export function registeredJourneys(): readonly JourneyPack[] {
  return packs;
}

export function journeyPack(id: string | null | undefined): JourneyPack | null {
  if (!id) return null;
  return packs.find((item) => item.id === id) ?? null;
}
