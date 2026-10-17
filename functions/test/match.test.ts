import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FieldType } from '../../shared/forms/types';
import { FIELD_LIBRARY, libraryById } from '../src/ingest/fieldLibrary';
import { MATCH_MIN } from '../src/ingest/errors';
import { customId, matchLibrary } from '../src/ingest/match';
import { normalisedTopLeftToPdfBox } from '../src/ingest/geom';
import './support';

describe('field library seed', () => {
  const schema = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../web/src/schema/aof_kyc_demo_v1.schema.json'), 'utf8'),
  ) as {
    fields: Array<{ id: string; label_en: string; required: boolean; group: string; journey_modes?: string[] }>;
  };
  // The ingest library matches AOF/KYC bank forms. Debit card reissue fields are not part of it.
  const aofFields = schema.fields.filter(
    (field) => !field.journey_modes || field.journey_modes.some((mode) => mode !== 'debit_reissue'),
  );

  it('matches aof_kyc_demo_v1 ids and labels', () => {
    assert.equal(FIELD_LIBRARY.length, aofFields.length);
    assert.equal(FIELD_LIBRARY.length, 45);
    for (let i = 0; i < aofFields.length; i += 1) {
      const expected = aofFields[i];
      const got = FIELD_LIBRARY[i];
      assert.equal(got.id, expected.id);
      assert.equal(got.label, expected.label_en);
      assert.equal(got.required, expected.required);
      assert.equal(got.section, expected.group);
    }
    const byId = new Map(FIELD_LIBRARY.map((field) => [field.id, field]));
    assert.equal(byId.get('email')?.type, 'email');
    assert.equal(byId.get('mobile_registered')?.type, 'phone');
    assert.equal(byId.get('addr_current_pin')?.type, 'pin');
    assert.equal(byId.get('dob')?.type, 'date');
    assert.equal(byId.get('photo_consent')?.type, 'checkbox');
    assert.deepEqual(byId.get('journey_mode')?.options, ['account_opening', 'kyc_update', 'rekyc']);
    assert.deepEqual(byId.get('linked_account_last4')?.partial, { keep: 'last', count: 4 });
    assert.equal(byId.get('applicant_full_name')?.pii, true);
    assert.equal(byId.get('journey_mode')?.pii, false);
  });
});

describe('library match', () => {
  it('scores shared ids and labels', () => {
    assert.equal(matchLibrary('applicant_full_name').entry?.id, 'applicant_full_name');
    assert.equal(matchLibrary('applicant_full_name').score, 1);
    assert.equal(matchLibrary('Full name (as in bank / OVD)').entry?.id, 'applicant_full_name');
    assert.equal(matchLibrary('Date of birth').entry?.id, 'dob');
    assert.equal(matchLibrary('PEP').entry?.id, 'pep_declaration');
    assert.equal(matchLibrary('PEP').score, 0.97);
    assert.equal(matchLibrary('email address').entry?.id, 'email');
    assert.equal(matchLibrary('pan').entry?.id, 'pan_number');
    assert.equal(matchLibrary('Current PIN code').entry?.id, 'addr_current_pin');
    assert.equal(matchLibrary('Permanent PIN code').entry?.id, 'addr_permanent_pin');
    const unknown = matchLibrary('Mother maiden name');
    assert.equal(unknown.entry, null);
    assert.ok(unknown.score < MATCH_MIN);
  });

  it('does not reuse a claimed id', () => {
    const used = new Set(['applicant_full_name']);
    const second = matchLibrary('applicant_full_name', used);
    assert.equal(second.entry, null);
    assert.ok(second.score < 0.8);
    const ids = new Set<string>(['custom_field']);
    assert.equal(customId('Mother maiden name', ids), 'custom_mother_maiden_name');
    assert.equal(customId('Mother maiden name', ids), 'custom_mother_maiden_name_2');
  });
});

/** Runs labels through the matcher in page order, as draftFromPdf does. */
function matchAll(rows: Array<[label: string, type?: FieldType]>): string[] {
  const used = new Set<string>();
  return rows.map(([label, type]) => {
    const hit = matchLibrary(label, used, { type });
    const id = hit.entry ? hit.entry.id : customId(label, used);
    if (hit.claim) used.add(hit.claim);
    return id;
  });
}

describe('library match guards (labels from the live Axis forms)', () => {
  it('keeps prefix cells off the full name and fills name parts', () => {
    assert.deepEqual(
      matchAll([
        ['Customer Name Prefix', 'text'],
        ['Customer Name First Name', 'text'],
        ['Customer Name Middle Name', 'text'],
        ['Customer Name Last Name', 'text'],
        ['Name as per ID Proof Prefix', 'text'],
        ['Name as per ID Proof First Name', 'text'],
        ['Name as per ID Proof Last Name', 'text'],
        ['Name as per PAN - First Name', 'text'],
        ['Name as per PAN Card Last Name', 'text'],
        ['Name - Middle Name', 'text'],
      ]),
      [
        'custom_customer_name_prefix',
        'applicant_first_name',
        'applicant_middle_name',
        'applicant_last_name',
        'custom_name_as_per_id_proof_prefix',
        'applicant_first_name',
        'applicant_last_name',
        'applicant_first_name',
        'applicant_last_name',
        'applicant_middle_name',
      ],
    );
  });

  it('keeps father, mother, spouse and maiden name parts apart', () => {
    assert.deepEqual(
      matchAll([
        ["Father's Name Prefix", 'text'],
        ["Father's Name First Name", 'text'],
        ["Father's Name Middle Name", 'text'],
        ["Father's Name Last Name", 'text'],
        ["Mother's Name First Name", 'text'],
        ["Spouse's Name Last Name", 'text'],
        ['Maiden Name (If any) First Name', 'text'],
      ]),
      [
        'custom_fathers_name_prefix',
        'father_first_name',
        'father_middle_name',
        'father_last_name',
        'custom_mothers_name_first_name',
        'custom_spouses_name_last_name',
        'custom_maiden_name_if_any_first_name',
      ],
    );
  });

  it('does not let an identical repeated label claim a name part twice', () => {
    // FD form: the second "Name* First" belongs to the joint applicant.
    assert.deepEqual(
      matchAll([
        ['Name*', 'text'],
        ['Name* First', 'text'],
        ['Name*', 'text'],
        ['Name* First', 'text'],
      ]),
      ['applicant_full_name', 'applicant_first_name', 'custom_name', 'custom_name_first'],
    );
  });

  it('maps only birth-date labels to dob', () => {
    assert.deepEqual(
      matchAll([
        ['Date', 'date'],
        ['Date of Birth / Date of Incorporation', 'date'],
        ['DOB as per PAN Card', 'date'],
        ['Place & Date', 'text'],
        ['Date:', 'date'],
        ['date of birth of the minor', 'date'],
        ['DOB / DOI D', 'number'],
      ]),
      [
        'custom_date',
        'dob',
        'dob',
        'custom_place_date',
        'custom_date_2',
        'custom_date_of_birth_of_the_minor',
        'custom_dob_doi_d',
      ],
    );
  });

  it('never reads bank or branch hints off a PDF', () => {
    assert.equal(matchLibrary('Bank', undefined, { type: 'text' }).entry, null);
    assert.equal(matchLibrary('Branch', undefined, { type: 'text' }).entry, null);
    assert.equal(matchLibrary('bank_hint').entry, null);
  });

  it('rejects type-incompatible matches', () => {
    assert.equal(matchLibrary('No', undefined, { type: 'checkbox' }).entry, null);
    assert.equal(matchLibrary('Country', undefined, { type: 'checkbox' }).entry, null);
    assert.equal(matchLibrary('Mobile No', undefined, { type: 'checkbox' }).entry, null);
    assert.equal(matchLibrary('Tel. No. (O)', undefined, { type: 'phone' }).entry, null);
    assert.equal(matchLibrary('Name', undefined, { type: 'phone' }).entry, null);
    assert.equal(matchLibrary('Email Address', undefined, { type: 'date' }).entry, null);
  });

  it('needs a father or spouse word for father_or_spouse_name', () => {
    const used = new Set(['applicant_full_name']);
    assert.equal(matchLibrary('Name*', used, { type: 'text' }).entry, null);
    assert.equal(matchLibrary("Father's Name", used, { type: 'text' }).entry?.id, 'father_or_spouse_name');
    assert.equal(matchLibrary("Husband's name", used, { type: 'text' }).entry?.id, 'father_or_spouse_name');
    assert.equal(matchLibrary("Mother's Name", used, { type: 'text' }).entry, null);
  });

  it('needs a number word for document numbers', () => {
    assert.deepEqual(
      matchAll([
        ['Identity Proof Document Type', 'choice'],
        ['ID no.', 'text'],
        ['Identity Proof Document Type', 'text'],
      ]),
      ['ovd_poi_type', 'ovd_poi_number', 'custom_identity_proof_document_type'],
    );
  });

  it('keeps genuine matches', () => {
    const cases: Array<[string, FieldType, string]> = [
      ['Date of Birth', 'date', 'dob'],
      ['Date of Birth', 'text', 'dob'],
      ['Mobile No', 'phone', 'mobile_registered'],
      ['Mobile Number', 'text', 'mobile_registered'],
      ['PAN', 'text', 'pan_number'],
      ['PAN***', 'text', 'pan_number'],
      ['Permanent Account Number (PAN)', 'text', 'pan_number'],
      ['PAN', 'checkbox', 'pan_available'],
      ['Customer Id', 'text', 'customer_id_cif'],
      ['CKYC ID', 'text', 'ckyc_number'],
      ['Email Address', 'email', 'email'],
      ['City', 'text', 'addr_current_city'],
      ['Pincode', 'pin', 'addr_current_pin'],
      ['Nationality', 'text', 'nationality'],
      ['Customer Name', 'text', 'applicant_full_name'],
      ['Or Form 60', 'checkbox', 'form60_declared'],
      ['I am a tax resident of India and not resident of any other country', 'checkbox', 'tax_resident_india_only'],
      ['First Name', 'text', 'applicant_first_name'],
    ];
    for (const [label, type, id] of cases) {
      assert.equal(matchLibrary(label, undefined, { type }).entry?.id, id, label);
    }
  });

  it('exposes derived ids through libraryById', () => {
    assert.equal(libraryById('applicant_first_name')?.derivedFrom, 'applicant_full_name');
    assert.equal(libraryById('father_last_name')?.derivedFrom, 'father_or_spouse_name');
    assert.equal(FIELD_LIBRARY.some((field) => field.derivedFrom), false);
  });
});

describe('box conversion', () => {
  it('maps top-left normalised coords to PDF points', () => {
    const box = normalisedTopLeftToPdfBox({ x: 0.1, y: 0.2, w: 0.4, h: 0.05 }, 612, 792);
    assert.deepEqual(box, { x: 61.2, y: 594, w: 244.8, h: 39.6 });
  });
});

describe('section-aware matching (real OCR headings)', () => {
  const id = (label: string, section?: string, type?: FieldType, used = new Set<string>()) =>
    matchLibrary(label, used, { type, section }).entry?.id ?? null;

  it('reads a one-word SURNAME as the last name', () => {
    assert.equal(id('SURNAME', '(A) PERSONAL DETAILS: APPLICANT NAME'), 'applicant_last_name');
    assert.equal(id('Given Name'), 'applicant_first_name');
  });

  it('keeps a second applicant, nominee or bank-use box off the shared ids', () => {
    assert.equal(id('City', 'MAILING ADDRESS - 2nd APPLICANT'), null);
    assert.equal(id('Name', '(M) NOMINATION (DA1)'), null);
    assert.equal(id('Mobile', 'FOR BRANCH USE ONLY'), null);
    assert.equal(id('City', '(D) MAILING ADDRESS - 1st APPLICANT'), 'addr_current_city');
  });

  it('puts a bare City or Flat No under its printed address heading', () => {
    assert.equal(id('City', 'PERMANENT ADDRESS 1st APPLICANT'), 'addr_permanent_city');
    assert.equal(id('State', 'PERMANENT ADDRESS 1st APPLICANT'), 'addr_permanent_state');
    assert.equal(id('PIN Code', 'Permanent Address'), 'addr_permanent_pin');
    assert.equal(id('Flat No & Bldg Name', 'PERMANENT ADDRESS 1st APPLICANT'), 'addr_permanent_line1');
    assert.equal(id('Company name / Flat No & Bldg Name', '(D) MAILING ADDRESS - 1st APPLICANT'), 'addr_current_line1');
    assert.equal(id('Road No./Name', '(D) MAILING ADDRESS - 1st APPLICANT'), 'addr_current_line2');
  });

  it('trusts the label over the heading, and a "same as" tick decides no block', () => {
    assert.equal(id('Permanent Address Line 1', 'address'), 'addr_permanent_line1');
    assert.equal(id('Residence Address Line 1', 'Permanent Address'), 'addr_current_line1');
    assert.equal(
      id('Residence Address Same as Permanent Address', 'Permanent Address', 'checkbox'),
      'addr_permanent_same_as_current',
    );
  });

  it('still lets an unlabelled second City block fall to permanent when no heading says otherwise', () => {
    const used = new Set<string>();
    const first = matchLibrary('City', used, {});
    if (first.claim) used.add(first.claim);
    assert.equal(first.entry?.id, 'addr_current_city');
    assert.equal(matchLibrary('City', used, {}).entry?.id, 'addr_permanent_city');
  });
});
