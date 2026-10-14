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

const incompleteName = heuristicExtract(
  'I want to open a savings account. I am a tax resident of India.',
  {},
);
assert(incompleteName.field_updates.applicant_full_name === undefined, `status name ${incompleteName.field_updates.applicant_full_name}`);
assert(incompleteName.field_updates.tax_resident_india_only === true, 'tax phrase still sets the flag');
assert(incompleteName.field_updates.journey_mode === 'account_opening', 'journey kept on incomplete name');

const existingOnly = heuristicExtract('I am an existing customer of this bank.', {});
assert(existingOnly.field_updates.applicant_full_name === undefined, `existing name ${existingOnly.field_updates.applicant_full_name}`);
assert(existingOnly.field_updates.existing_bank_customer === true, 'existing customer flag');

const namedAndStatus = heuristicExtract(
  'My name is Priya Sharma. I am a tax resident of India only and I am not an existing customer.',
  {},
);
assert(namedAndStatus.field_updates.applicant_full_name === 'Priya Sharma', `kept name ${namedAndStatus.field_updates.applicant_full_name}`);
assert(namedAndStatus.field_updates.tax_resident_india_only === true, 'named tax flag');
assert(namedAndStatus.field_updates.existing_bank_customer === false, 'named not existing');

const iAmName = heuristicExtract('I am Ananya Reddy', {});
assert(iAmName.field_updates.applicant_full_name === 'Ananya Reddy', `i am name ${iAmName.field_updates.applicant_full_name}`);

const PRIYA_DUMP =
  'Hi, I want to open a new savings account. My name is Priya Sharma. ' +
  "Father's name is Ramesh Sharma. I was born on 12 March 1994. Gender female. " +
  'I am an Indian national and a resident individual. I have a PAN. ' +
  'PAN number is A B C P S 1 2 3 4 D. My registered mobile is 9876543210. ' +
  'Email is priya.sharma.demo@example.com. ' +
  'Current address: 14, Lake View Apartments, 3rd Cross, Indiranagar, Bengaluru, Karnataka, PIN 560038. ' +
  'Permanent address is the same as current. ' +
  'I will use my driving licence as proof of identity, number KA01 20190012345. ' +
  'Same document for address proof. I agree to provide photograph. ' +
  'I have the original documents for verification. I am not an existing customer. ' +
  'I want a regular savings account. I am salaried. I am not a politically exposed person. ' +
  'Tax resident of India only. This draft is for HDFC.';

const priya = heuristicExtract(PRIYA_DUMP, {});
assert(priya.field_updates.applicant_full_name === 'Priya Sharma', `priya name ${priya.field_updates.applicant_full_name}`);
assert(priya.field_updates.father_or_spouse_name === 'Ramesh Sharma', `priya father ${priya.field_updates.father_or_spouse_name}`);
assert(priya.field_updates.dob === '1994-03-12', `priya dob ${priya.field_updates.dob}`);
assert(priya.field_updates.pan_number === 'ABCPS1234D', `priya pan ${priya.field_updates.pan_number}`);
assert(priya.field_updates.pan_available === true, 'priya pan flag');
assert(
  String(priya.field_updates.addr_current_line1 || '').includes('Lake View'),
  `priya line1 ${priya.field_updates.addr_current_line1}`,
);
assert(priya.field_updates.addr_current_city === 'Bengaluru', `priya city ${priya.field_updates.addr_current_city}`);
assert(priya.field_updates.addr_current_state === 'Karnataka', `priya state ${priya.field_updates.addr_current_state}`);
assert(priya.field_updates.addr_current_pin === '560038', `priya pin ${priya.field_updates.addr_current_pin}`);
assert(priya.field_updates.photo_consent === true, 'priya photo');
assert(priya.field_updates.ovd_originals_ack === true, 'priya originals');
assert(priya.field_updates.existing_bank_customer === false, 'priya new customer');
assert(priya.field_updates.pep_declaration === false, 'priya pep');
assert(priya.field_updates.tax_resident_india_only === true, 'priya tax');
assert(priya.field_updates.journey_mode === 'account_opening', 'priya journey');
assert(priya.field_updates.addr_permanent_same_as_current === true, 'priya same address');
assert(priya.field_updates.ovd_poa_same_as_poi === true, 'priya same poa');
assert(priya.field_updates.ovd_poi_type === 'driving_licence', `priya ovd ${priya.field_updates.ovd_poi_type}`);
assert(
  String(priya.field_updates.ovd_poi_number || '').includes('KA01'),
  `priya ovd number ${priya.field_updates.ovd_poi_number}`,
);
assert(priya.missing_required.length === 0, `priya missing ${priya.missing_required.join(',')}`);
assert(
  priya.completeness === 'demo_ready' || priya.completeness === 'full_bank_packet',
  `priya completeness ${priya.completeness}`,
);

const evalPriya =
  "My name is Priya Sharma. My father's name is Ramesh Sharma. Date of birth 12 March 1994. I am female, Indian, a resident individual. I have a PAN, number ABCPS1234D. My registered mobile is 9876543210. Email priya.sharma.demo@example.com. Preferred language English. Current address is 14, Lake View Apartments, 3rd Cross, Indiranagar, Bengaluru, Karnataka, PIN 560038. Permanent address is the same as current. Proof of identity is a driving licence, number KA01 20190012345, expiry 31 August 2029. Proof of address is the same document. I consent to a photograph. I will produce the original for verification. I am not an existing bank customer. I want a regular savings account. Branch Indiranagar, Bengaluru. I am salaried. I am not a PEP. I am tax resident of India only. Journey is account opening.";
const evalRun = heuristicExtract(evalPriya, {});
assert(evalRun.field_updates.ovd_poa_same_as_poi === true, 'eval same document');
assert(evalRun.field_updates.existing_bank_customer === false, 'eval not existing bank customer');
assert(evalRun.field_updates.addr_current_pin === '560038', `eval pin ${evalRun.field_updates.addr_current_pin}`);
assert(evalRun.missing_required.length === 0, `eval missing ${evalRun.missing_required.join(',')}`);
assert(
  evalRun.completeness === 'demo_ready' || evalRun.completeness === 'full_bank_packet',
  `eval completeness ${evalRun.completeness}`,
);

const DEBIT =
  'I need a debit card reissue. My name is Priya Sharma, customer ID CIF102938, account number 501002223334, card number 6521 8844 2291 4417. It was stolen. Please reissue a new card. Confirmation mobile 9876543210. PIN 1234.';
const debit = heuristicExtract(DEBIT, { journey_mode: 'debit_reissue', card_reissue_new: true });
const debitValues = { journey_mode: 'debit_reissue', card_reissue_new: true, ...debit.field_updates };
assert(debit.field_updates.journey_mode === 'debit_reissue', 'debit journey');
assert(debit.field_updates.applicant_full_name === 'Priya Sharma', `debit name ${debit.field_updates.applicant_full_name}`);
assert(debit.field_updates.card_customer_id === 'CIF102938', `debit id ${debit.field_updates.card_customer_id}`);
assert(debit.field_updates.card_account_number === '501002223334', `debit account ${debit.field_updates.card_account_number}`);
assert(debit.field_updates.card_last4 === '4417', `debit last4 ${debit.field_updates.card_last4}`);
assert(debit.field_updates.card_reason === 'stolen', `debit reason ${debit.field_updates.card_reason}`);
assert(debit.field_updates.card_reissue_new === true, 'debit reissue');
assert(debit.field_updates.card_confirm_mobile === '9876543210', `debit mobile ${debit.field_updates.card_confirm_mobile}`);
assert(!('card_pin' in debit.field_updates), 'no pin field');
assert(!JSON.stringify(debit).includes('6521884422914417'), 'full card number stored');
assert(!JSON.stringify(debit).includes('6521 8844'), 'spaced card number stored');
assert(!debit.missing_required.includes('dob'), `debit asked for dob ${debit.missing_required.join(',')}`);
assert(debit.missing_required.length === 0, `debit missing ${debit.missing_required.join(',')}`);
const debitScript = buildReadbackScript(debitValues, 'en');
assert(debitScript.includes('4417'), 'readback last4');
assert(debitScript.includes('Card goes to your registered address'), 'readback address');
assert(!debitScript.includes('6521884422914417'), 'readback hid full card');
assert(getNextAsk([], debitValues) === null, 'debit ask done');

const stillOpening = heuristicExtract(EN, { journey_mode: 'account_opening' });
assert(stillOpening.field_updates.journey_mode === 'account_opening', 'opening stays opening');
assert(!stillOpening.field_updates.card_last4, 'opening has no card');

console.log('smoke-lang ok');
console.log('en fields', Object.keys(en.field_updates).join(','));
console.log('hi next', hi.next_ask);
console.log('mixed next', mixed.next_ask);
