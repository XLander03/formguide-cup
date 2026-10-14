import type { FormValues } from '../../lib/types';
import type { UtteranceLang } from '../../lib/utteranceLang';

const HI_RELATION: Record<string, string> = {
  wife: 'पत्नी',
  husband: 'पति',
  son: 'बेटा',
  daughter: 'बेटी',
  father: 'पिता',
  mother: 'माता',
  brother: 'भाई',
  sister: 'बहन',
  other: 'अन्य',
};

function last4(value: FormValues[string]): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, '') : '';
  return text.length >= 4 ? text.slice(-4) : 'xxxx';
}

function text(value: FormValues[string], fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

export function nominationReadback(values: FormValues, lang: UtteranceLang): string {
  const holder = text(values.account_holder_name, lang === 'en' ? 'account holder not set' : 'खाताधारक नहीं');
  const nominee = text(values.nominee_name, lang === 'en' ? 'nominee not set' : 'नॉमिनी नहीं');
  const relation = text(values.nominee_relationship, lang === 'en' ? 'relationship not set' : 'रिश्ता नहीं');
  const dob = text(values.nominee_dob, lang === 'en' ? 'date of birth not set' : 'जन्म तिथि नहीं');
  const address = text(values.nominee_address, lang === 'en' ? 'address not set' : 'पता नहीं');
  const minor = values.nominee_is_minor === true;
  const guardian = text(values.guardian_name, lang === 'en' ? 'guardian not set' : 'अभिभावक नहीं');
  const guardianAddress = text(values.guardian_address, lang === 'en' ? 'guardian address not set' : 'अभिभावक का पता नहीं');
  const enMinor = minor
    ? `Nominee is a minor. Guardian: ${guardian}. Guardian address: ${guardianAddress}. `
    : 'Nominee is not a minor. ';
  const en =
    `Please confirm this read-back. Nomination. Account holder: ${holder}. ` +
    `Account number ending ${last4(values.account_number)}. Customer ID ending ${last4(values.customer_id)}. ` +
    `Nominee: ${nominee}. Relationship: ${relation.replace(/_/g, ' ')}. Date of birth: ${dob}. Address: ${address}. ` +
    enMinor +
    (typeof values.mobile === 'string' && values.mobile
      ? `Mobile ending ${last4(values.mobile)}. `
      : '') +
    'This is a draft only. Fields vary by bank. No live bank submit.';
  const hiRelation = HI_RELATION[relation] ?? relation;
  const hiMinor = minor
    ? `नॉमिनी नाबालिग है। अभिभावक: ${guardian}. पता: ${guardianAddress}. `
    : 'नॉमिनी नाबालिग नहीं है। ';
  const hi =
    `कृपया इस रीड-बैक की पुष्टि करें। नॉमिनेशन। खाताधारक: ${holder}. ` +
    `खाता संख्या के आखिरी चार अंक ${last4(values.account_number)}. ग्राहक आईडी के आखिरी चार अंक ${last4(values.customer_id)}. ` +
    `नॉमिनी: ${nominee}. रिश्ता: ${hiRelation}. जन्म तिथि: ${dob}. पता: ${address}. ` +
    hiMinor +
    (typeof values.mobile === 'string' && values.mobile
      ? `मोबाइल के आखिरी चार अंक ${last4(values.mobile)}. `
      : '') +
    'यह केवल ड्राफ्ट है। Fields vary by bank. बैंक में लाइव जमा नहीं होगा।';
  if (lang === 'en') return en;
  if (lang === 'mixed') return `${hi} ${en}`;
  return hi;
}
