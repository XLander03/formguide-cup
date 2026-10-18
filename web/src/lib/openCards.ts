import type { JourneyId } from './journeys';

/** The forms a customer can start on Preparation. The landing page counts these too. */
export type OpenCard = {
  id: string;
  kind: string;
  name: string;
  blurb: string;
  journey: JourneyId;
  /** Existing account_product_intent value, or null for KYC journeys. */
  product: string | null;
};

export const OPEN_CARDS: OpenCard[] = [
  {
    id: 'regular_savings',
    kind: 'Account opening',
    name: 'Regular savings',
    blurb: 'Everyday savings account for individuals',
    journey: 'account_opening',
    product: 'regular_savings',
  },
  {
    id: 'salary_savings',
    kind: 'Account opening',
    name: 'Salary account',
    blurb: 'Zero-balance account linked to your employer',
    journey: 'account_opening',
    product: 'salary_savings',
  },
  {
    id: 'bsbda',
    kind: 'Account opening',
    name: 'Basic savings',
    blurb: 'Simple no-frills savings account',
    journey: 'account_opening',
    product: 'bsbda',
  },
  {
    id: 'individual_current',
    kind: 'Account opening',
    name: 'Individual current',
    blurb: 'Current account for business transactions',
    journey: 'account_opening',
    product: 'individual_current',
  },
  {
    id: 'kyc_update',
    kind: 'KYC',
    name: 'KYC update',
    blurb: 'Change address, mobile, or identity details',
    journey: 'kyc_update',
    product: null,
  },
  {
    id: 'rekyc',
    kind: 'KYC',
    name: 'Re-KYC',
    blurb: 'Periodic re-verification your bank asked for',
    journey: 'rekyc',
    product: null,
  },
  {
    id: 'debit_reissue',
    kind: 'Service request',
    name: 'Debit card reissue',
    blurb: 'Replace a lost, stolen, or damaged debit card',
    journey: 'debit_reissue',
    product: null,
  },
];
