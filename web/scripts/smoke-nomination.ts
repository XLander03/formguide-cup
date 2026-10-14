/**
 * Nomination journey: multi-field fill, missing-only follow-up, confidence, read-back, PDF.
 * Run from web/: npx vite-node scripts/smoke-nomination.ts
 */
import { confidenceFlag, scoreOf } from '../src/journeys/confidence';
import { extractNomination, nomineeIsMinor } from '../src/journeys/nomination/extract';
import { buildNominationPdf, nominationPdfLines } from '../src/journeys/nomination/pdf';
import { nominationReadback } from '../src/journeys/nomination/readback';
import { nominationMissing } from '../src/journeys/nomination/schema';
import { heuristicExtract } from '../src/lib/heuristicExtract';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const EN =
  'I want to add a nominee on my savings account. Account holder Meera Iyer, account number 123456789012, customer ID CIF88421. Nominee is Arjun Iyer, my son, date of birth 14/06/2012, address 18 Residency Road, Bengaluru. He is a minor. Guardian is Meera Iyer, same address 18 Residency Road, Bengaluru. Mobile 9845012345.';

const en = extractNomination(EN, {});
assert(en.reply_lang === 'en', `lang ${en.reply_lang}`);
assert(en.refuse_live_submit === false, 'not a live submit');
assert(en.field_updates.account_holder_name === 'Meera Iyer', `holder ${en.field_updates.account_holder_name}`);
assert(en.field_updates.account_number === '123456789012', `acct ${en.field_updates.account_number}`);
assert(en.field_updates.customer_id === 'CIF88421', `cif ${en.field_updates.customer_id}`);
assert(en.field_updates.nominee_name === 'Arjun Iyer', `nominee ${en.field_updates.nominee_name}`);
assert(en.field_updates.nominee_relationship === 'son', `rel ${en.field_updates.nominee_relationship}`);
assert(en.field_updates.nominee_dob === '2012-06-14', `dob ${en.field_updates.nominee_dob}`);
assert(
  String(en.field_updates.nominee_address || '').includes('18 Residency Road'),
  `addr ${en.field_updates.nominee_address}`,
);
assert(!/guardian|minor|mobile/i.test(String(en.field_updates.nominee_address)), `addr ran on ${en.field_updates.nominee_address}`);
assert(en.field_updates.nominee_is_minor === true, 'minor');
assert(en.field_updates.guardian_name === 'Meera Iyer', `guardian ${en.field_updates.guardian_name}`);
assert(
  String(en.field_updates.guardian_address || '').includes('18 Residency Road'),
  `g addr ${en.field_updates.guardian_address}`,
);
assert(en.field_updates.mobile === '9845012345', `mobile ${en.field_updates.mobile}`);
assert(en.field_updates.mobile !== en.field_updates.account_number, 'mobile is not the account');
assert(en.missing_required.length === 0, `missing ${en.missing_required.join(',')}`);
assert(en.next_ask === null, `next ${en.next_ask}`);
assert(en.completeness === 'full_bank_packet', `complete ${en.completeness}`);
assert(en.gates.answers.journey_type && en.gates.answers.journey_type.type === 'choice', 'choice gate');
const journeyGate = en.gates.answers.journey_type;
assert(journeyGate.type === 'choice' && journeyGate.confidence !== undefined && journeyGate.confidence >= 0.75, 'journey confidence');
assert((scoreOf(en.field_confidence?.account_holder_name) ?? 0) >= 0.75, 'holder confidence');
assert((en.assistant_message || '').includes('Fields vary by bank.'), 'bank copy');

const partial = extractNomination(
  'Account holder Rahul Deshmukh, account number 501000112233.',
  {},
);
assert(partial.field_updates.account_holder_name === 'Rahul Deshmukh', 'partial holder');
assert(!partial.missing_required.includes('account_holder_name'), 'holder not re-asked');
assert(partial.missing_required[0] === 'customer_id', `ask order ${partial.missing_required[0]}`);
assert(partial.next_ask?.includes('customer ID'), `ask ${partial.next_ask}`);
const merged = { ...partial.field_updates };
const follow = extractNomination(
  'Customer ID 778899. Nominee is Kavita Deshmukh, my wife, born 02/11/1990, lives at 9 FC Road, Pune. She is not a minor.',
  merged,
);
assert(follow.field_updates.customer_id === '778899', `cid ${follow.field_updates.customer_id}`);
assert(follow.field_updates.nominee_name === 'Kavita Deshmukh', `wife ${follow.field_updates.nominee_name}`);
assert(follow.field_updates.nominee_relationship === 'wife', `wife rel ${follow.field_updates.nominee_relationship}`);
assert(follow.field_updates.nominee_dob === '1990-11-02', `wife dob ${follow.field_updates.nominee_dob}`);
assert(follow.field_updates.nominee_is_minor === false, 'adult');
assert(!follow.field_updates.account_holder_name, 'follow-up does not clear holder');
const followMerged = { ...merged, ...follow.field_updates };
assert(!nominationMissing(followMerged).includes('guardian_name'), 'adult skips guardian');
assert(nominationMissing(followMerged).includes('nominee_address') === false, `addr missing ${nominationMissing(followMerged)}`);

const HI =
  'मैं बचत खाते पर नॉमिनी जोड़ना चाहता हूँ। खाताधारक का नाम राहुल देशमुख है। खाता संख्या 501000112233। ग्राहक आईडी 778899। नॉमिनी का नाम कविता देशमुख है। रिश्ता पत्नी। जन्म तिथि 02/11/1990। पता 9 एफसी रोड पुणे। वो नाबालिग नहीं है।';
const hi = extractNomination(HI, {});
assert(hi.reply_lang === 'hi', `hi lang ${hi.reply_lang}`);
assert(hi.field_updates.account_holder_name === 'राहुल देशमुख', `hi holder ${hi.field_updates.account_holder_name}`);
assert(hi.field_updates.account_number === '501000112233', `hi acct ${hi.field_updates.account_number}`);
assert(hi.field_updates.customer_id === '778899', `hi cid ${hi.field_updates.customer_id}`);
assert(hi.field_updates.nominee_name === 'कविता देशमुख', `hi nominee ${hi.field_updates.nominee_name}`);
assert(hi.field_updates.nominee_relationship === 'wife', `hi rel ${hi.field_updates.nominee_relationship}`);
assert(hi.field_updates.nominee_dob === '1990-11-02', `hi dob ${hi.field_updates.nominee_dob}`);
assert(String(hi.field_updates.nominee_address || '').includes('पुणे'), `hi addr ${hi.field_updates.nominee_address}`);
assert(hi.field_updates.nominee_is_minor === false, 'hi adult');
assert(hi.missing_required.length === 0, `hi missing ${hi.missing_required.join(',')}`);
assert(hi.next_ask === null, `hi next ${hi.next_ask}`);

const clash = extractNomination('Nominee date of birth 14/06/2012. She is not a minor.', {
  account_holder_name: 'Meera Iyer',
  account_number: '123456789012',
  customer_id: 'CIF88421',
  nominee_name: 'Arjun Iyer',
  nominee_relationship: 'son',
  nominee_address: '18 Residency Road, Bengaluru',
});
assert(clash.field_updates.nominee_is_minor === true, 'dob wins over a conflicting minor claim');
assert((scoreOf(clash.field_confidence?.nominee_is_minor) ?? 1) < 0.75, `clash flag ${scoreOf(clash.field_confidence?.nominee_is_minor)}`);
assert(confidenceFlag(clash.field_confidence?.nominee_is_minor)?.low === true, 'low flag');

const shortAcct = extractNomination('Account number 1234567890.', {});
assert(shortAcct.field_updates.account_number === '1234567890', '10 digit account kept');
assert((scoreOf(shortAcct.field_confidence?.account_number) ?? 1) < 0.75, '10 digit account flagged');

const refused = extractNomination('Please submit this to the bank.', { account_holder_name: 'Meera Iyer' });
assert(refused.refuse_live_submit === true, 'refuse live');
assert(Object.keys(refused.field_updates).length === 0, 'refuse writes nothing');
assert(refused.field_updates.account_holder_name === undefined, 'holder kept out of updates');

const gates = extractNomination('confirmed, draft only, no live submit', {
  account_holder_name: 'Meera Iyer',
  account_number: '123456789012',
  customer_id: 'CIF88421',
  nominee_name: 'Arjun Iyer',
  nominee_relationship: 'son',
  nominee_dob: '2012-06-14',
  nominee_address: '18 Residency Road, Bengaluru',
  nominee_is_minor: true,
  guardian_name: 'Meera Iyer',
  guardian_address: '18 Residency Road, Bengaluru',
});
assert(gates.field_updates.readback_confirmed === true, 'readback tick');
assert(gates.field_updates.draft_only_ack === true, 'draft tick');
assert(gates.field_updates.no_live_submit_ack === true, 'no live tick');

const readEn = nominationReadback({ ...en.field_updates }, 'en');
const readHi = nominationReadback({ ...hi.field_updates }, 'hi');
assert(readEn.includes('Meera Iyer') && readEn.includes('Arjun Iyer'), 'en readback names');
assert(readEn.includes('ending 9012'), `en mask ${readEn}`);
assert(readEn.includes('minor') && readEn.includes('Fields vary by bank.') && readEn.includes('No live bank submit.'), 'en readback close');
assert(readHi.includes('राहुल देशमुख') && readHi.includes('कविता देशमुख'), 'hi readback names');
assert(readHi.includes('Fields vary by bank.') && readHi.includes('नाबालिग नहीं'), 'hi readback close');
assert(nomineeIsMinor('2012-06-14', new Date(2026, 9, 14)) === true, 'minor age');
assert(nomineeIsMinor('1990-11-02', new Date(2026, 9, 14)) === false, 'adult age');

const lines = nominationPdfLines(en.field_updates, en.field_confidence || {});
assert(lines[0] === 'Nomination', 'pdf title');
assert(lines.some((line) => line.includes('DRAFT · NOT SUBMITTED')), 'pdf banner');
const blob = buildNominationPdf(en.field_updates, en.field_confidence || {});
const raw = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
assert(raw.includes('Nomination'), 'pdf bytes title');
assert(raw.includes('DRAFT'), 'pdf bytes draft');
assert(raw.includes('NOT SUBMITTED'), 'pdf bytes not submitted');
assert(raw.includes('%PDF-1.4'), 'pdf header');

const aof = heuristicExtract('I want to add a nominee on my savings account.', {});
assert(aof.refuse_live_submit === false, 'aof exclusion is not a live submit');
assert((aof.assistant_message || '').length > 0, 'aof still answers');
assert(!aof.field_updates.nominee_name, 'aof schema does not take nomination slots');

console.log('nomination smoke ok');
