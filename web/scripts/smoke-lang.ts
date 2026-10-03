/**
 * Locks the English heuristic path and checks Hindi / mixed fill.
 * Run from web/: npx vite-node scripts/smoke-lang.ts
 */
import { buildReadbackScript, heuristicExtract } from '../src/lib/heuristicExtract';
import { getNextAsk } from '../src/lib/schema';
import { HINDI_SAMPLE, MIXED_SAMPLE, readbackLanguage } from '../src/lib/utteranceLang';

const EN =
  'Hi, I want to open a savings account. My name is Ananya Reddy, DOB 15/08/1992, PAN ABCDE1234F, mobile 9876501234. I live at 22 MG Road, Bengaluru, Karnataka 560001.';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const en = heuristicExtract(EN, {});
assert(en.reply_lang === 'en', `english lang ${en.reply_lang}`);
assert(en.field_updates.applicant_full_name === 'Ananya Reddy', `name ${en.field_updates.applicant_full_name}`);
assert(en.field_updates.dob === '1992-08-15', `dob ${en.field_updates.dob}`);
assert(en.field_updates.pan_number === 'ABCDE1234F', `pan ${en.field_updates.pan_number}`);
assert(en.field_updates.pan_available === true, 'pan flag');
assert(en.field_updates.mobile_registered === '9876501234', `mobile ${en.field_updates.mobile_registered}`);
assert(en.field_updates.journey_mode === 'account_opening', `journey ${en.field_updates.journey_mode}`);
assert(en.field_updates.account_product_intent === 'regular_savings', `product ${en.field_updates.account_product_intent}`);
assert(en.field_updates.addr_current_city === 'Bengaluru', `city ${en.field_updates.addr_current_city}`);
assert(en.field_updates.addr_current_state === 'Karnataka', `state ${en.field_updates.addr_current_state}`);
assert(en.field_updates.addr_current_pin === '560001', `pin ${en.field_updates.addr_current_pin}`);
assert(
  String(en.field_updates.addr_current_line1 || '').includes('22 MG Road'),
  `line1 ${en.field_updates.addr_current_line1}`,
);
assert(en.field_updates.preferred_language === undefined, 'english must not write preferred_language');
assert(!/[\u0900-\u097F]/.test(en.assistant_message || ''), `english assistant has Devanagari: ${en.assistant_message}`);
assert(!/[\u0900-\u097F]/.test(en.next_ask || ''), `english next_ask has Devanagari: ${en.next_ask}`);
assert((en.assistant_message || '').includes('Fields vary by bank.'), 'english bank copy');
assert((en.assistant_message || '').startsWith('Updated '), `english lead ${en.assistant_message}`);
const merged = { ...en.field_updates };
assert(en.next_ask === getNextAsk(en.missing_required, merged), `next_ask drifted: ${en.next_ask}`);

const confirm = heuristicExtract('confirmed, draft only, no live submit', {});
assert(confirm.reply_lang === 'en', 'confirm lang');
assert(confirm.field_updates.readback_confirmed === true, 'readback');
assert(confirm.field_updates.draft_only_ack === true, 'draft');
assert(confirm.field_updates.no_live_submit_ack === true, 'no live ack');

const live = heuristicExtract('Please submit to the bank', {});
assert(live.refuse_live_submit === true, 'english live refuse');
assert(live.reply_lang === 'en', 'live lang');
assert(
  live.next_ask ===
    'This demo never submits to a bank. I can only save a draft after you confirm read-back and the draft-only acknowledgements.',
  `live next ${live.next_ask}`,
);

const scope = heuristicExtract('I want to add a nomination', {});
assert(scope.reply_lang === 'en', 'scope lang');
assert(Object.keys(scope.field_updates).length === 0, 'scope updates');
assert(
  scope.next_ask ===
    'This demo covers account opening and KYC only. Nomination, NEFT, loans, SCSS, and Form 15G are stretch items for later.',
  `scope next ${scope.next_ask}`,
);
assert((scope.assistant_message || '').includes('Fields vary by bank.'), 'scope bank copy');

const read = buildReadbackScript({
  applicant_full_name: 'Ananya Reddy',
  dob: '1992-08-15',
  mobile_registered: '9876501234',
  ovd_poi_type: 'driving_licence',
  account_product_intent: 'regular_savings',
});
assert(
  read ===
    'Please confirm this read-back. Name: Ananya Reddy. Date of birth: 1992-08-15. Mobile ending 1234. Proof of identity: driving licence. Product or journey: regular savings. This is a draft only. Fields vary by bank. No live bank submit.',
  `readback drifted: ${read}`,
);

const hi = heuristicExtract(HINDI_SAMPLE, {});
assert(hi.reply_lang === 'hi', `hindi lang ${hi.reply_lang} msg=${hi.assistant_message}`);
assert(hi.field_updates.applicant_full_name === 'प्रिया शर्मा', `hi name ${hi.field_updates.applicant_full_name}`);
assert(hi.field_updates.dob === '1994-03-12', `hi dob ${hi.field_updates.dob}`);
assert(hi.field_updates.pan_number === 'ABCPS1234D', `hi pan ${hi.field_updates.pan_number}`);
assert(hi.field_updates.mobile_registered === '9876543210', `hi mobile ${hi.field_updates.mobile_registered}`);
assert(hi.field_updates.journey_mode === 'account_opening', `hi journey ${hi.field_updates.journey_mode}`);
assert(hi.field_updates.account_product_intent === 'regular_savings', `hi product ${hi.field_updates.account_product_intent}`);
assert(hi.field_updates.addr_current_city === 'Bengaluru', `hi city ${hi.field_updates.addr_current_city}`);
assert(hi.field_updates.addr_current_state === 'Karnataka', `hi state ${hi.field_updates.addr_current_state}`);
assert(hi.field_updates.addr_current_pin === '560038', `hi pin ${hi.field_updates.addr_current_pin}`);
assert(
  String(hi.field_updates.addr_current_line1 || '').includes('14'),
  `hi line ${hi.field_updates.addr_current_line1}`,
);
assert(hi.field_updates.nationality === 'Indian', 'hi nationality');
assert(hi.field_updates.residential_status === 'resident_individual', 'hi resident');
assert(hi.field_updates.ovd_poi_type === 'driving_licence', `hi ovd ${hi.field_updates.ovd_poi_type}`);
assert(hi.field_updates.addr_permanent_same_as_current === true, 'hi same addr');
assert(hi.field_updates.existing_bank_customer === false, 'hi new customer');
assert(hi.field_updates.pep_declaration === false, 'hi pep');
assert(hi.field_updates.tax_resident_india_only === true, 'hi tax');
assert(hi.field_updates.preferred_language === 'Hindi', `hi pref ${hi.field_updates.preferred_language}`);
assert(/[\u0900-\u097F]/.test(hi.next_ask || ''), `hi next not hindi: ${hi.next_ask}`);
assert(/[\u0900-\u097F]/.test(hi.assistant_message || ''), `hi assistant not hindi: ${hi.assistant_message}`);
assert((hi.assistant_message || '').includes('Fields vary by bank.'), 'hi bank copy');
assert(hi.refuse_live_submit === false, 'hi not live');
const hiRead = buildReadbackScript(hi.field_updates, 'hi');
assert(/[\u0900-\u097F]/.test(hiRead), 'hi readback');
assert(hiRead.includes('Fields vary by bank.'), 'hi readback bank copy');
assert(!hiRead.includes('Please confirm this read-back.'), 'pure hindi readback stays Hindi');

const mixed = heuristicExtract(MIXED_SAMPLE, {});
assert(mixed.reply_lang === 'mixed', `mixed lang ${mixed.reply_lang}`);
assert(mixed.field_updates.applicant_full_name === 'Ananya Reddy', `mixed name ${mixed.field_updates.applicant_full_name}`);
assert(mixed.field_updates.dob === '1992-08-15', `mixed dob ${mixed.field_updates.dob}`);
assert(mixed.field_updates.pan_number === 'ABCDE1234F', `mixed pan ${mixed.field_updates.pan_number}`);
assert(mixed.field_updates.mobile_registered === '9876501234', `mixed mobile ${mixed.field_updates.mobile_registered}`);
assert(mixed.field_updates.journey_mode === 'account_opening', `mixed journey ${mixed.field_updates.journey_mode}`);
assert(mixed.field_updates.addr_current_city === 'Bengaluru', `mixed city ${mixed.field_updates.addr_current_city}`);
assert(mixed.field_updates.nationality === 'Indian', 'mixed nationality');
assert(mixed.field_updates.residential_status === 'resident_individual', 'mixed resident');
assert(mixed.field_updates.preferred_language === 'Hindi+English', `mixed pref ${mixed.field_updates.preferred_language}`);
assert(/[\u0900-\u097F]/.test(mixed.next_ask || ''), `mixed next missing Hindi: ${mixed.next_ask}`);
assert((mixed.next_ask || '').includes('Please') || (mixed.next_ask || '').includes('Which') || (mixed.next_ask || '').includes('What') || (mixed.next_ask || '').includes('Is this') || (mixed.next_ask || '').includes('Do you'), `mixed next missing English: ${mixed.next_ask}`);
assert((mixed.assistant_message || '').includes('Fields vary by bank.'), 'mixed bank copy');
const mixedRead = buildReadbackScript(mixed.field_updates, 'mixed');
assert(mixedRead.includes('कृपया इस रीड-बैक'), 'mixed readback hindi');
assert(mixedRead.includes('Please confirm this read-back.'), 'mixed readback english');

const hiLive = heuristicExtract('कृपया इसे बैंक में जमा करो', {});
assert(hiLive.refuse_live_submit === true, 'hindi live refuse');
assert(hiLive.reply_lang === 'hi', `hindi live lang ${hiLive.reply_lang}`);
assert(/[\u0900-\u097F]/.test(hiLive.next_ask || ''), `hindi live next ${hiLive.next_ask}`);

const hiScope = heuristicExtract('मुझे नामांकन करना है', {});
assert(hiScope.reply_lang === 'hi', 'hindi scope lang');
assert(Object.keys(hiScope.field_updates).length === 0, 'hindi scope updates');
assert(/[\u0900-\u097F]/.test(hiScope.next_ask || ''), `hindi scope next ${hiScope.next_ask}`);

const mixedGap = heuristicExtract(
  'मेरा नाम Ananya Reddy है। mobile 9876501234। PIN 560001। जन्म तिथि 15 अगस्त 1992। मैं बैंगलुरु में रहती हूँ।',
  {},
);
assert(mixedGap.field_updates.applicant_full_name === 'Ananya Reddy', `gap name ${mixedGap.field_updates.applicant_full_name}`);
assert(mixedGap.field_updates.mobile_registered === '9876501234', `gap mobile ${mixedGap.field_updates.mobile_registered}`);
assert(mixedGap.field_updates.addr_current_pin === '560001', `gap pin ${mixedGap.field_updates.addr_current_pin}`);
assert(mixedGap.field_updates.dob === '1992-08-15', `gap dob ${mixedGap.field_updates.dob}`);
assert(mixedGap.field_updates.addr_current_city === 'Bengaluru', `gap city ${mixedGap.field_updates.addr_current_city}`);
assert((mixedGap.assistant_message || '').includes('Fields vary by bank.'), 'gap bank copy');

const mixedEnDate = heuristicExtract(
  'My name is Ananya Reddy, mobile 9876501234, PIN 560001, DOB 15 August 1992, city बैंगलुरु.',
  {},
);
assert(mixedEnDate.field_updates.dob === '1992-08-15', `en-month dob ${mixedEnDate.field_updates.dob}`);
assert(mixedEnDate.field_updates.addr_current_city === 'Bengaluru', `en-month city ${mixedEnDate.field_updates.addr_current_city}`);
assert(mixedEnDate.field_updates.mobile_registered === '9876501234', 'en-month mobile');
assert(mixedEnDate.field_updates.addr_current_pin === '560001', 'en-month pin');

const mixedSpokenDate = heuristicExtract(
  'मेरा नाम Ananya Reddy है। mobile 9876501234। PIN 560001। DOB fifteenth August nineteen ninety two। शहर बैंगलुरु।',
  {},
);
assert(mixedSpokenDate.field_updates.dob === '1992-08-15', `spoken-en dob ${mixedSpokenDate.field_updates.dob}`);
assert(mixedSpokenDate.field_updates.addr_current_city === 'Bengaluru', 'spoken-en city');

const hiName = heuristicExtract(
  'मेरा नाम अनन्या रेड्डी है। मोबाइल नौ आठ सात छह पांच चार तीन दो एक शून्य।',
  {},
);
assert(hiName.field_updates.applicant_full_name === 'अनन्या रेड्डी', `hi spoken name ${hiName.field_updates.applicant_full_name}`);
assert(hiName.field_updates.mobile_registered === '9876543210', `hi spoken mobile ${hiName.field_updates.mobile_registered}`);
assert(hiName.reply_lang === 'hi', `hi spoken lang ${hiName.reply_lang}`);

const hiDevanagariMobile = heuristicExtract('मेरा नाम अनन्या रेड्डी है। मोबाइल ९८७६५४३२१०।', {});
assert(hiDevanagariMobile.field_updates.mobile_registered === '9876543210', `deva mobile ${hiDevanagariMobile.field_updates.mobile_registered}`);

const hiSpacedMobile = heuristicExtract('मेरा नाम अनन्या रेड्डी है। मोबाइल 9 8 7 6 5 4 3 2 1 0।', {});
assert(hiSpacedMobile.field_updates.mobile_registered === '9876543210', `spaced mobile ${hiSpacedMobile.field_updates.mobile_registered}`);

const hiSpokenDob = heuristicExtract(
  'मेरा नाम अनन्या रेड्डी है। जन्म तिथि पंद्रह अगस्त उन्नीस सौ बानवे। मोबाइल नौ आठ सात छह पांच चार तीन दो एक शून्य। शहर बैंगलुरु।',
  {},
);
assert(hiSpokenDob.field_updates.dob === '1992-08-15', `hi spoken dob ${hiSpokenDob.field_updates.dob}`);
assert(hiSpokenDob.field_updates.addr_current_city === 'Bengaluru', 'hi spoken city');
assert(hiSpokenDob.field_updates.mobile_registered === '9876543210', 'hi spoken dob mobile');

const hiGroups = heuristicExtract('मेरा नाम अनन्या रेड्डी है। मोबाइल 98765 43210।', {});
assert(hiGroups.field_updates.mobile_registered === '9876543210', `grouped mobile ${hiGroups.field_updates.mobile_registered}`);

assert(readbackLanguage('hi-IN', 'en') === 'hi', 'hindi mic forces hindi readback');
assert(readbackLanguage('en-IN', 'en') === 'en', 'english mic keeps english');
assert(readbackLanguage('en-IN', 'hi') === 'hi', 'english mic keeps hindi utterance');
const priyaHi = buildReadbackScript(
  {
    applicant_full_name: 'Priya Sharma',
    dob: '1994-03-12',
    mobile_registered: '9876543210',
    ovd_poi_type: 'driving_licence',
    account_product_intent: 'regular_savings',
  },
  readbackLanguage('hi-IN', 'en'),
);
assert(priyaHi.startsWith('कृपया इस रीड-बैक की पुष्टि करें।'), `priya hi lead ${priyaHi}`);
assert(priyaHi.includes('Name: Priya Sharma') === false && priyaHi.includes('Priya Sharma'), 'priya name kept');
assert(!priyaHi.includes('Please confirm this read-back.'), 'priya hindi mic is not English');
assert(priyaHi.includes('Fields vary by bank.'), 'priya hindi bank copy');
assert(priyaHi.includes('3210'), 'priya hindi last4');

console.log('smoke-lang ok');
console.log('en fields', Object.keys(en.field_updates).join(','));
console.log('hi next', hi.next_ask);
console.log('mixed next', mixed.next_ask);
