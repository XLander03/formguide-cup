import { heuristicExtract, isRekycText } from './heuristicExtract';

export type JourneyCardId =
  | 'regular_savings'
  | 'salary_savings'
  | 'bsbda'
  | 'individual_current'
  | 'kyc_update'
  | 'rekyc'
  | 'debit_reissue';

export type JourneyPick = { kind: 'card'; cardId: JourneyCardId } | { kind: 'later' } | { kind: 'unknown' };

const PRODUCTS = new Set<JourneyCardId>([
  'regular_savings',
  'salary_savings',
  'bsbda',
  'individual_current',
]);

function isLater(text: string): boolean {
  return (
    /\b(nomination|nominee|personal\s+loan|home\s+loan|\bloan\b|fixed\s+deposit|\bneft\b|\brtgs\b|\bimps\b)\b/i.test(
      text,
    ) || /नॉमिनेशन|नोमिनेशन|लोन|फिक्स्ड\s*डिपॉजिट/.test(text)
  );
}

/** Map a free description to one open journey card. */
export function pickJourneyCard(text: string): JourneyPick {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown' };
  if (isLater(raw)) return { kind: 'later' };
  if (isRekycText(raw)) return { kind: 'card', cardId: 'rekyc' };

  const updates = heuristicExtract(raw, {}).field_updates;
  const journey = typeof updates.journey_mode === 'string' ? updates.journey_mode : '';
  const product = typeof updates.account_product_intent === 'string' ? updates.account_product_intent : '';
  if (journey === 'debit_reissue') return { kind: 'card', cardId: 'debit_reissue' };
  if (journey === 'rekyc') return { kind: 'card', cardId: 'rekyc' };
  if (PRODUCTS.has(product as JourneyCardId)) return { kind: 'card', cardId: product as JourneyCardId };
  if (journey === 'kyc_update') return { kind: 'card', cardId: 'kyc_update' };
  if (journey === 'account_opening') return { kind: 'card', cardId: 'regular_savings' };
  return { kind: 'unknown' };
}
