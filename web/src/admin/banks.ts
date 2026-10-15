import { JOURNEYS } from '../lib/journeys';

export const ADMIN_BANKS = ['HDFC', 'Axis', 'ICICI', 'Kotak', 'PNB'] as const;

export const ADMIN_JOURNEYS = JOURNEYS.map((journey) => ({ id: journey.id, title: journey.title }));
