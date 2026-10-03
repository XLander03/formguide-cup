import { SCHEMA } from './schema';

/**
 * P0 journeys already on `aof_kyc_demo_v1.journey_mode`.
 * Corpus lines are titled samples from `corpus/bank-forms/INDEX.md`.
 * They are citations, not bank form IDs.
 */
export const JOURNEY_IDS = ['account_opening', 'kyc_update', 'rekyc'] as const;

export type JourneyId = (typeof JOURNEY_IDS)[number];

export interface CorpusTitle {
  bank: string;
  title: string;
}

export interface JourneyOption {
  id: JourneyId;
  title: string;
  titleHi: string;
  summary: string;
  voiceHint: string;
  corpus: CorpusTitle[];
}

export const JOURNEYS: readonly JourneyOption[] = [
  {
    id: 'account_opening',
    title: 'Account opening',
    titleHi: 'खाता खोलना',
    summary: 'Resident individual account opening. Product names differ by bank.',
    voiceHint: 'open a savings account',
    corpus: [
      { bank: 'HDFC', title: 'Account Opening Form — Individuals' },
      { bank: 'Axis', title: 'Savings / Current Account Opening Form' },
      { bank: 'Axis', title: 'Account Opening Form' },
      { bank: 'PNB', title: 'Account Opening Form (Revised)' },
      { bank: 'Kotak', title: 'Resident Individual CRF — Account Opening' },
    ],
  },
  {
    id: 'kyc_update',
    title: 'KYC update',
    titleHi: 'केवाईसी अपडेट',
    summary: 'Update identity, address, and contact on an existing KYC record.',
    voiceHint: 'update KYC',
    corpus: [
      { bank: 'HDFC', title: 'KYC — Resident Individual' },
      { bank: 'ICICI', title: 'Customer Information Updation — Individual' },
      { bank: 'AMFI', title: 'CKYC KYC Form — Individual' },
    ],
  },
  {
    id: 'rekyc',
    title: 'Re-KYC',
    titleHi: 'री-केवाईसी',
    summary: 'Refresh KYC when a bank asks for a periodic update.',
    voiceHint: 're-KYC',
    corpus: [
      { bank: 'HDFC', title: 'Re-KYC Form — Individuals' },
      { bank: 'Axis', title: 'Re-KYC Form' },
    ],
  },
];

for (const journey of JOURNEYS) {
  if (!SCHEMA.enums.journey_mode.includes(journey.id)) {
    throw new Error(`aof_kyc_demo_v1 is missing journey_mode "${journey.id}"`);
  }
}

export function isJourneyId(value: unknown): value is JourneyId {
  return typeof value === 'string' && (JOURNEY_IDS as readonly string[]).includes(value);
}

export function journeyById(id: JourneyId): JourneyOption {
  const found = JOURNEYS.find((journey) => journey.id === id);
  if (!found) throw new Error(`Unknown journey ${id}`);
  return found;
}
