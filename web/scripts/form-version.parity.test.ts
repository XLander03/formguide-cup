/**
 * Behaviour parity with main: Fake prefill review rows, ask-missing order,
 * read-back copy, and PDF widget values produced by the pre-FormVersion pdfFill.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HDFC_V1, aadhaarPartialFieldIds, enumPromptClause, extractFieldIds } from '../src/forms/hdfcV1';
import { encodeFirestoreFields, loadPublishedFormVersions } from '../src/forms/loadPublished';
import { seedDocuments } from '../src/forms/seedDocs';
import { buildReadbackScript } from '../src/lib/heuristicExtract';
import { planPdfFieldMap } from '../src/lib/pdfPlan';
import { emptyValues, getMissingRequired, priyaDemoValues, reviewSections, SCHEMA } from '../src/lib/schema';
import type { FormValues } from '../src/lib/types';
import fullSchema from '../src/schema/aof_kyc_demo_v1.schema.json';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TODAY = new Date(2026, 0, 15);

const ENUM_CLAUSE =
  'journey_mode=account_opening|kyc_update|rekyc|debit_reissue; gender=female|male|other|prefer_not_to_say; residential_status=resident_individual; ovd_poi_type/ovd_poa_type=passport|driving_licence|proof_of_possession_of_aadhaar|voter_id|nrega_job_card|npr_letter; account_product_intent=regular_savings|salary_savings|bsbda|individual_current|unspecified_varies_by_bank; occupation_bucket=salaried|self_employed|professional|student|homemaker|retired|other; card_reason=lost_or_misplaced|stolen|damaged|other';

const READBACK =
  'Please confirm this read-back. Name: Priya Sharma. Date of birth: 1994-03-12. Mobile ending 3210. Proof of identity: driving licence. Product or journey: regular savings. This is a draft only. Fields vary by bank. No live bank submit.';

const REVIEW = [
  'identity:journey_mode',
  'identity:applicant_full_name',
  'identity:father_or_spouse_name',
  'identity:dob',
  'identity:gender',
  'identity:nationality',
  'identity:residential_status',
  'identity:pan_available',
  'identity:pan_number',
  'identity:ckyc_number',
  'contact:mobile_registered',
  'contact:email',
  'contact:preferred_language',
  'address:addr_current_line1',
  'address:addr_current_line2',
  'address:addr_current_city',
  'address:addr_current_state',
  'address:addr_current_pin',
  'address:addr_permanent_same_as_current',
  'kyc_ovd:ovd_poi_type',
  'kyc_ovd:ovd_poi_number',
  'kyc_ovd:ovd_poi_expiry',
  'kyc_ovd:ovd_poa_same_as_poi',
  'kyc_ovd:photo_consent',
  'kyc_ovd:ovd_originals_ack',
  'account_refs:existing_bank_customer',
  'account_refs:linked_account_last4',
  'account_refs:account_product_intent',
  'account_refs:branch_hint',
  'account_refs:bank_hint',
  'profile_light:occupation_bucket',
  'profile_light:pep_declaration',
  'profile_light:tax_resident_india_only',
];

const EMPTY_MISSING = [
  'journey_mode',
  'applicant_full_name',
  'dob',
  'mobile_registered',
  'pan_available',
  'addr_current_line1',
  'addr_current_city',
  'addr_current_state',
  'addr_current_pin',
  'addr_permanent_same_as_current',
  'ovd_poi_type',
  'ovd_poi_number',
  'ovd_poa_same_as_poi',
  'photo_consent',
  'ovd_originals_ack',
  'existing_bank_customer',
  'pep_declaration',
  'tax_resident_india_only',
  'residential_status',
];

const CONDITIONAL_MISSING = [
  'mobile_registered',
  'pan_number',
  'customer_id_cif',
  'account_product_intent',
  'residential_status',
  'addr_permanent_line1',
  'addr_permanent_city',
  'addr_permanent_state',
  'addr_permanent_pin',
  'ovd_poa_type',
  'ovd_poa_number',
  'aadhaar_voluntary_consent',
];

function reviewKeys(values: FormValues): string[] {
  return reviewSections(values).flatMap((section) => section.fields.map((field) => `${section.id}:${field.id}`));
}

/** Frozen copy of main's pdfFill widget writes (f5b9d1d / 1cf47c6 mapping). */
function legacyPdfMap(v: FormValues, today: Date): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const text = (name: string, value: string | undefined | null) => {
    if (!value) return;
    out[name] = value;
  };
  const check = (name: string | undefined) => {
    if (!name) return;
    out[name] = true;
  };
  const dmy = (iso: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
  };
  const last4 = (value: string) => {
    const match = /(\d{4})\D*$/.exec(value);
    return match ? match[1] : null;
  };
  const gender: Record<string, string> = {
    female: 'Female',
    male: 'Male',
    other: 'Other',
    prefer_not_to_say: 'Other',
  };
  const occupation: Record<string, string> = {
    salaried: 'chk_Salaried',
    self_employed: 'chk_Self_employed',
    professional: 'chk_Self_employed_prof',
    student: 'chk_Student',
    homemaker: 'chk_Housewife',
    retired: 'chk_Retired',
    other: 'chk_Occ_Others',
  };
  const ovd: Record<string, string> = {
    passport: 'chk_Passport',
    driving_licence: 'chk_Driving_Licence_No',
    voter_id: 'chk_Voter_Id_Card_No',
  };
  const poa: Record<string, string> = {
    passport: 'chk_POA_Passport',
    driving_licence: 'chk_POA_drivingLicense',
    voter_id: 'chk_POA_VoterID',
  };

  text('txt_Self_Name', typeof v.applicant_full_name === 'string' ? v.applicant_full_name : null);
  text('txt_Father_or_Spouse_name', typeof v.father_or_spouse_name === 'string' ? v.father_or_spouse_name : null);
  if (typeof v.dob === 'string' && v.dob) text('txt_Self_DOB', dmy(v.dob));
  if (typeof v.gender === 'string' && v.gender) text('txt_Self_Gender', gender[v.gender] ?? v.gender);
  text('txt_Pan_No', typeof v.pan_number === 'string' ? v.pan_number.toUpperCase().replace(/[^A-Z0-9]/g, '') : null);
  text('txt_Mobile_No', typeof v.mobile_registered === 'string' ? v.mobile_registered : null);
  text('txt_Email_Id', typeof v.email === 'string' ? v.email : null);
  text('txt_Address_Line1', typeof v.addr_current_line1 === 'string' ? v.addr_current_line1 : null);
  text('txt_Address_Line2', typeof v.addr_current_line2 === 'string' ? v.addr_current_line2 : null);
  text('txt_City', typeof v.addr_current_city === 'string' ? v.addr_current_city : null);
  text('txt_State', typeof v.addr_current_state === 'string' ? v.addr_current_state : null);
  text('txt_Pin', typeof v.addr_current_pin === 'string' ? v.addr_current_pin : null);
  if (v.addr_permanent_same_as_current === false) {
    text('txtcor_Address_Line_1', typeof v.addr_permanent_line1 === 'string' ? v.addr_permanent_line1 : null);
    text('txtcor_City', typeof v.addr_permanent_city === 'string' ? v.addr_permanent_city : null);
    text('txtcor_state', typeof v.addr_permanent_state === 'string' ? v.addr_permanent_state : null);
    text('txtcor_pin', typeof v.addr_permanent_pin === 'string' ? v.addr_permanent_pin : null);
  }
  const poiType = typeof v.ovd_poi_type === 'string' ? v.ovd_poi_type : null;
  if (poiType === 'proof_of_possession_of_aadhaar') {
    check('Chk_Adhaar');
    const digits = typeof v.ovd_poi_number === 'string' ? last4(v.ovd_poi_number) : null;
    if (digits) {
      text('txt_9th_digit_of_adhaar', digits[0]);
      text('txt_10th_digit_of_adhaar', digits[1]);
      text('txt_11th_digit_of_adhaar', digits[2]);
      text('txt_12th_digit_of_adhaar', digits[3]);
    }
  } else if (poiType && ovd[poiType]) {
    check(ovd[poiType]);
    const number = typeof v.ovd_poi_number === 'string' ? v.ovd_poi_number : null;
    if (poiType === 'passport') {
      text('txt_Passport_No', number);
      if (typeof v.ovd_poi_expiry === 'string') text('txt_Passport_Expiry_Date', dmy(v.ovd_poi_expiry));
    } else if (poiType === 'driving_licence') {
      text('txt_Driving_Licence_No', number);
      if (typeof v.ovd_poi_expiry === 'string') text('txt_Driving_Licence_Expiry_Date', dmy(v.ovd_poi_expiry));
    } else if (poiType === 'voter_id') {
      text('txt_Voter_Id_Card_No', number);
    }
  }
  if (v.ovd_poa_same_as_poi === false && typeof v.ovd_poa_type === 'string') {
    if (v.ovd_poa_type === 'proof_of_possession_of_aadhaar') check('chk_POA_aadhaar');
    else check(poa[v.ovd_poa_type]);
  }
  if (typeof v.occupation_bucket === 'string' && occupation[v.occupation_bucket]) check(occupation[v.occupation_bucket]);
  if (v.pep_declaration === true) check('Chk_PEP');
  if (v.journey_mode === 'account_opening') check('chk_Application_Type_New');
  else if (v.journey_mode === 'kyc_update' || v.journey_mode === 'rekyc') check('chk_Application_Type_Update');
  text(
    'txt_Date',
    `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`,
  );
  return out;
}

function expectSamePdf(values: FormValues): void {
  assert.deepEqual(planPdfFieldMap(values, TODAY), legacyPdfMap(values, TODAY));
}

test('schema fields round-trip from HDFC v1', () => {
  assert.equal(HDFC_V1.formId, 'aof_kyc_demo_v1');
  assert.equal(HDFC_V1.version, 'v1');
  assert.equal(HDFC_V1.bankId, 'HDFC');
  assert.equal(HDFC_V1.status, 'published');
  assert.equal(HDFC_V1.source, 'acroform');
  assert.deepEqual(SCHEMA.fields, fullSchema.fields);
  assert.deepEqual(extractFieldIds(), fullSchema.fields.map((field) => field.id));
  assert.equal(enumPromptClause(), ENUM_CLAUSE);
  assert.deepEqual(aadhaarPartialFieldIds(), ['ovd_poi_number', 'ovd_poa_number']);
  const bundled = JSON.parse(readFileSync(join(root, 'web/src/forms/hdfc.v1.json'), 'utf8'));
  assert.deepEqual(bundled, HDFC_V1);
});

test('Fake prefill review fields stay in order across 6 sections', () => {
  const sections = reviewSections(priyaDemoValues());
  assert.deepEqual(
    sections.map((section) => section.id),
    ['identity', 'contact', 'address', 'kyc_ovd', 'account_refs', 'profile_light'],
  );
  const keys = reviewKeys(priyaDemoValues());
  assert.equal(keys.length, 33);
  assert.deepEqual(keys, REVIEW);
});

test('ask-missing order matches main', () => {
  assert.deepEqual(getMissingRequired(priyaDemoValues()), []);
  assert.deepEqual(getMissingRequired(emptyValues()), EMPTY_MISSING);
  const values = priyaDemoValues();
  values.pan_number = '';
  values.addr_permanent_same_as_current = false;
  values.addr_permanent_line1 = '';
  values.addr_permanent_city = '';
  values.addr_permanent_state = '';
  values.addr_permanent_pin = '';
  values.ovd_poa_same_as_poi = false;
  values.ovd_poa_type = '';
  values.ovd_poa_number = '';
  values.ovd_poi_type = 'proof_of_possession_of_aadhaar';
  values.aadhaar_voluntary_consent = null;
  values.existing_bank_customer = true;
  values.customer_id_cif = '';
  values.account_product_intent = '';
  values.mobile_registered = '';
  values.residential_status = '';
  assert.deepEqual(getMissingRequired(values), CONDITIONAL_MISSING);
});

test('Priya read-back string is unchanged', () => {
  assert.equal(buildReadbackScript(priyaDemoValues(), 'en'), READBACK);
});

test('pdf field values match main pdfFill', () => {
  const priya = priyaDemoValues();
  expectSamePdf(priya);
  expectSamePdf(emptyValues());

  const aadhaar = priyaDemoValues();
  aadhaar.ovd_poi_type = 'proof_of_possession_of_aadhaar';
  aadhaar.ovd_poi_number = '•••• •••• 1234';
  aadhaar.ovd_poi_expiry = '';
  expectSamePdf(aadhaar);
  const aadhaarMap = planPdfFieldMap(aadhaar, TODAY);
  assert.equal(aadhaarMap.Chk_Adhaar, true);
  assert.equal(aadhaarMap.txt_9th_digit_of_adhaar, '1');
  assert.equal(aadhaarMap.txt_12th_digit_of_adhaar, '4');
  assert.equal(aadhaarMap.chk_Driving_Licence_No, undefined);

  const passport = priyaDemoValues();
  passport.ovd_poi_type = 'passport';
  passport.ovd_poi_number = 'Z1234567';
  passport.ovd_poi_expiry = '2030-01-02';
  passport.ovd_poa_same_as_poi = false;
  passport.ovd_poa_type = 'voter_id';
  passport.addr_permanent_same_as_current = false;
  passport.addr_permanent_line1 = '1 Permanent Road';
  passport.addr_permanent_city = 'Mysuru';
  passport.addr_permanent_state = 'Karnataka';
  passport.addr_permanent_pin = '570001';
  passport.pep_declaration = true;
  passport.journey_mode = 'rekyc';
  passport.occupation_bucket = 'professional';
  passport.pan_number = 'abcps1234d';
  passport.gender = 'prefer_not_to_say';
  expectSamePdf(passport);

  const nrega = priyaDemoValues();
  nrega.ovd_poi_type = 'nrega_job_card';
  nrega.ovd_poa_same_as_poi = false;
  nrega.ovd_poa_type = 'npr_letter';
  nrega.journey_mode = 'kyc_update';
  nrega.occupation_bucket = 'other';
  expectSamePdf(nrega);
});

test('published loader falls back without Firestore and skips drafts', async () => {
  let called = 0;
  const offline = await loadPublishedFormVersions({
    fetchImpl: () => {
      called += 1;
      throw new Error('no network');
    },
  });
  assert.equal(called, 0);
  assert.deepEqual(offline, [HDFC_V1]);

  const failed = await loadPublishedFormVersions({
    projectId: 'faceapp-5397b',
    emulatorHost: '127.0.0.1:8080',
    fetchImpl: async () => {
      throw new Error('emulator down');
    },
  });
  assert.deepEqual(failed, [HDFC_V1]);

  const docs = seedDocuments();
  const formDoc = docs.find((doc) => doc.path === 'forms/aof_kyc_demo_v1');
  const versionDoc = docs.find((doc) => doc.path === 'forms/aof_kyc_demo_v1/versions/v1');
  assert.ok(formDoc && versionDoc);
  assert.equal(docs.filter((doc) => doc.path.startsWith('banks/')).length, 1);
  assert.equal(docs.filter((doc) => doc.path.startsWith('fieldLibrary/')).length, 55);
  assert.equal(docs.some((doc) => doc.data.status !== 'published'), false);

  const rest = (path: string, data: Record<string, string | boolean>) => ({
    name: `projects/faceapp-5397b/databases/(default)/documents/${path}`,
    fields: encodeFirestoreFields(data),
  });
  const draft = { ...versionDoc.data, status: 'draft', version: 'v0' };

  const seen: string[] = [];
  const loaded = await loadPublishedFormVersions({
    projectId: 'faceapp-5397b',
    emulatorHost: '127.0.0.1:8080',
    fetchImpl: async (url) => {
      seen.push(url);
      if (url.endsWith('/forms')) {
        return { ok: true, status: 200, json: async () => ({ documents: [rest(formDoc.path, formDoc.data)] }) };
      }
      if (url.endsWith('/versions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            documents: [rest(`${formDoc.path}/versions/v0`, draft), rest(versionDoc.path, versionDoc.data)],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded[0], HDFC_V1);
  assert.ok(seen.some((url) => url.endsWith('/banks')));
  assert.ok(seen.some((url) => url.endsWith('/fieldLibrary')));
  assert.ok(seen.some((url) => url.endsWith('/versions')));
});
