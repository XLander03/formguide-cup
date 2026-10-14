/**
 * PAN document merge: spoken values win; a matching DOB is not flagged.
 * Run from web/: node --experimental-strip-types scripts/smoke-pan.ts
 */
import { AADHAAR_OVD, withoutAadhaarNumbers } from '../src/lib/aadhaarScope.ts';
import {
  PAN_MISMATCH_REASON,
  decidePanApply,
  displayPanValue,
  panResultNote,
  speechAgainstPan,
} from '../src/lib/panDocument.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const card = {
  applicant_full_name: 'Sample Person',
  dob: '15/08/1990',
  pan_number: 'sampl 1234 z',
};

const empty = decidePanApply({}, card, new Set());
assert(empty.fill.applicant_full_name === 'Sample Person', 'fills empty name');
assert(empty.fill.dob === '1990-08-15', `iso dob ${empty.fill.dob}`);
assert(empty.fill.pan_number === 'SAMPL1234Z', `pan ${empty.fill.pan_number}`);
assert(empty.conflicts.length === 0 && empty.matches.length === 0, 'no flags on empty');
assert(empty.fromDocument.join(',') === 'applicant_full_name,dob,pan_number', 'all from document');

const spoken = {
  applicant_full_name: 'Ananya Reddy',
  dob: '1992-08-15',
  pan_number: 'ABCDE1234F',
};
const clash = decidePanApply(spoken, card, new Set());
assert(Object.keys(clash.fill).length === 0, 'does not overwrite spoken');
assert(clash.conflicts.join(',') === 'applicant_full_name,dob,pan_number', 'flags conflicts');
assert(clash.fromDocument.length === 0, 'spoken stays spoken');

const sameDob = decidePanApply(
  { dob: '15 August 1990', applicant_full_name: 'SAMPLE PERSON', pan_number: 'SAMPL1234Z' },
  card,
  new Set(),
);
assert(sameDob.conflicts.length === 0, 'matching dob/name/pan are not conflicts');
assert(sameDob.matches.join(',') === 'applicant_full_name,dob,pan_number', 'matches recorded');
assert(!('dob' in sameDob.fill), 'match does not rewrite the spoken dob');

const docOwned = decidePanApply(
  { dob: '1990-08-15', applicant_full_name: 'OLD CARD' },
  { applicant_full_name: 'SAMPLE PERSON', dob: '1990-08-15' },
  new Set(['dob', 'applicant_full_name']),
);
assert(docOwned.fill.applicant_full_name === 'SAMPLE PERSON', 'new photo can replace a document name');
assert(docOwned.conflicts.length === 0, 'document-owned values are not conflicts');

const after = speechAgainstPan(
  { dob: '01/01/1991', applicant_full_name: 'sample person' },
  { dob: '1990-08-15', applicant_full_name: 'SAMPLE PERSON', pan_number: 'SAMPL1234Z' },
);
assert(after.conflicts.join(',') === 'dob', `later spoken dob checked ${after.conflicts}`);
assert(after.matches.join(',') === 'applicant_full_name', 'later matching name is not a conflict');

const laterMatch = speechAgainstPan({ dob: '1990-08-15' }, { dob: displayPanValue('dob', '15/08/1990') });
assert(laterMatch.conflicts.length === 0 && laterMatch.matches.join(',') === 'dob', 'matching later dob');

const aadhaarDraft = withoutAadhaarNumbers({
  ovd_poi_type: AADHAAR_OVD,
  ovd_poi_number: '123412341234',
  aadhaar_voluntary_consent: true,
  ovd_poa_type: 'passport',
  ovd_poa_number: 'P1234567',
});
assert(aadhaarDraft.ovd_poi_type === AADHAAR_OVD, 'aadhaar type kept');
assert(!('ovd_poi_number' in aadhaarDraft), 'aadhaar selection stores no number');
assert(!('aadhaar_voluntary_consent' in aadhaarDraft), 'no consent key');
assert(aadhaarDraft.ovd_poa_number === 'P1234567', 'other document numbers stay');

assert(PAN_MISMATCH_REASON === "Doesn't match PAN", 'reason string');
assert(panResultNote(clash, false).includes('Fields vary by bank.'), 'bank copy');
assert(!panResultNote(empty, false).toLowerCase().includes('aadhaar'), 'aadhaar stays out of the note');

console.log('pan merge ok');
