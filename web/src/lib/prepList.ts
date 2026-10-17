import type { JourneyId } from './journeys';

/**
 * What to keep in front of you before speaking, per journey. Follows the required fields and
 * confirm gates in aof_kyc_demo_v1, so the landing page and /journey promise the same things.
 */
const ID_PROOF =
  'One ID proof and its number: passport, driving licence, Aadhaar, voter ID, NREGA job card or NPR letter';
const KYC: readonly string[] = [
  'Customer ID (CIF), if you have it: it is printed on your passbook or cheque book',
  'Your full name and date of birth, exactly as on your ID',
  'The mobile number registered with your bank',
  'Your PAN card, or say you will fill Form 60 if you have none',
  ID_PROOF,
  'Your current address with its 6-digit PIN code',
];

export const PREP_LIST: Record<JourneyId, readonly string[]> = {
  account_opening: [
    'Your full name and date of birth, exactly as on your ID',
    'A 10-digit mobile number you can receive calls on',
    'Your PAN card, or say you will fill Form 60 if you have none',
    ID_PROOF,
    'Your current address with its 6-digit PIN code, and your permanent address if it is different',
  ],
  kyc_update: KYC,
  rekyc: KYC,
  debit_reissue: [
    'Customer ID and the account number the card is linked to',
    'The last 4 digits of the card only, never the full number',
    'What happened: lost or misplaced, stolen, damaged, or something else',
    'Block the old card with your bank first: you will be asked to confirm you have',
  ],
};
