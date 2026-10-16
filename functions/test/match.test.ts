import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIELD_LIBRARY } from '../src/ingest/fieldLibrary';
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

describe('box conversion', () => {
  it('maps top-left normalised coords to PDF points', () => {
    const box = normalisedTopLeftToPdfBox({ x: 0.1, y: 0.2, w: 0.4, h: 0.05 }, 612, 792);
    assert.deepEqual(box, { x: 61.2, y: 594, w: 244.8, h: 39.6 });
  });
});
