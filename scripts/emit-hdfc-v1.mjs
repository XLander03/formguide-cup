/**
 * Builds the bundled HDFC v1 form from aof_kyc_demo_v1 and the real
 * HDFC_KYC_Resident_Individual.pdf widget rectangles. Run from the repo root:
 *   node scripts/emit-hdfc-v1.mjs
 * Does not call Gemini and does not deploy.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, 'web/package.json'));
const { PDFDocument } = require('pdf-lib');

const schema = JSON.parse(
  readFileSync(join(root, 'web/src/schema/aof_kyc_demo_v1.schema.json'), 'utf8'),
);

const pdfBytes = readFileSync(join(root, 'corpus/bank-forms/HDFC_KYC_Resident_Individual.pdf'));
const pdf = await PDFDocument.load(pdfBytes);
const form = pdf.getForm();
const pages = pdf.getPages();

function pageOf(widget) {
  const ref = widget.P();
  if (!ref) return 0;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].ref === ref) return i + 1;
  }
  return 0;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

const widgets = new Map();
for (const field of form.getFields()) {
  const name = field.getName();
  const widget = field.acroField.getWidgets()[0];
  if (!widget) continue;
  const rect = widget.getRectangle();
  widgets.set(name, {
    page: pageOf(widget),
    box: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
  });
}

function placed(pdfField) {
  const found = widgets.get(pdfField);
  if (!found) throw new Error(`missing AcroForm widget ${pdfField}`);
  return found;
}

const ZERO = { page: 0, box: { x: 0, y: 0, w: 0, h: 0 } };
const priority = schema.incomplete_routing.choice_next_ask.fallback_priority;
const rank = new Map(priority.map((id, index) => [id, index]));

const PII = new Set([
  'pan_number',
  'ckyc_number',
  'mobile_registered',
  'email',
  'ovd_poi_number',
  'ovd_poa_number',
  'customer_id_cif',
  'linked_account_last4',
]);

function modelType(field) {
  if (field.id === 'ovd_poi_number' || field.id === 'ovd_poa_number') return 'partial';
  if (field.id === 'mobile_registered') return 'phone';
  if (field.id === 'email') return 'email';
  if (field.id === 'addr_current_pin' || field.id === 'addr_permanent_pin') return 'pin';
  if (field.type === 'date') return 'date';
  if (field.type === 'boolean') return 'checkbox';
  if (field.type === 'enum') return 'choice';
  return 'text';
}

function maxChars(field) {
  const max = field.validation?.maxLength;
  if (typeof max === 'number') return max;
  if (field.id === 'mobile_registered') return 10;
  if (field.id === 'pan_number') return 10;
  if (field.id === 'addr_current_pin' || field.id === 'addr_permanent_pin') return 6;
  if (field.id === 'linked_account_last4') return 4;
  return undefined;
}

const DIRECT = {
  applicant_full_name: { pdfField: 'txt_Self_Name' },
  father_or_spouse_name: { pdfField: 'txt_Father_or_Spouse_name' },
  dob: { pdfField: 'txt_Self_DOB', transform: 'dmy' },
  gender: { pdfField: 'txt_Self_Gender', transform: 'gender' },
  pan_number: { pdfField: 'txt_Pan_No', transform: 'pan' },
  mobile_registered: { pdfField: 'txt_Mobile_No' },
  email: { pdfField: 'txt_Email_Id' },
  addr_current_line1: { pdfField: 'txt_Address_Line1' },
  addr_current_line2: { pdfField: 'txt_Address_Line2' },
  addr_current_city: { pdfField: 'txt_City' },
  addr_current_state: { pdfField: 'txt_State' },
  addr_current_pin: { pdfField: 'txt_Pin' },
  addr_permanent_line1: {
    pdfField: 'txtcor_Address_Line_1',
    when: { addr_permanent_same_as_current: false },
  },
  addr_permanent_city: { pdfField: 'txtcor_City', when: { addr_permanent_same_as_current: false } },
  addr_permanent_state: { pdfField: 'txtcor_state', when: { addr_permanent_same_as_current: false } },
  addr_permanent_pin: { pdfField: 'txtcor_pin', when: { addr_permanent_same_as_current: false } },
};

function textWrite(id, spec) {
  const write = { pdfField: spec.pdfField, op: 'text', source: id };
  if (spec.transform) write.transform = spec.transform;
  if (spec.when) write.when = spec.when;
  return write;
}

const schemaFields = schema.fields.map((field, index) => {
  const direct = DIRECT[field.id];
  const place = direct ? placed(direct.pdfField) : ZERO;
  const record = {
    id: field.id,
    label: field.label_en,
    type: modelType(field),
    required: field.required === true,
    pii: PII.has(field.id),
    section: field.section,
    order: rank.has(field.id) ? rank.get(field.id) : 1000 + index,
    confidence: 1,
    checked: false,
    page: place.page,
    box: place.box,
    group: field.group,
    schemaField: field,
  };
  if (field.enum_ref && Array.isArray(schema.enums[field.enum_ref])) {
    record.options = schema.enums[field.enum_ref];
  }
  if (field.id === 'ovd_poi_number' || field.id === 'ovd_poa_number') {
    record.partial = { keep: 'last', count: 4 };
  }
  const chars = maxChars(field);
  if (chars) record.maxChars = chars;
  if (direct) {
    record.pdfField = direct.pdfField;
    record.writes = [textWrite(field.id, direct)];
  }
  if (field.id === 'pep_declaration') {
    const pep = placed('Chk_PEP');
    record.pdfField = 'Chk_PEP';
    record.page = pep.page;
    record.box = pep.box;
    record.writes = [{ pdfField: 'Chk_PEP', op: 'check', source: 'pep_declaration', whenTrue: true }];
  }
  return record;
});

function widgetRecord(spec) {
  const place = placed(spec.pdfField);
  const record = {
    id: spec.id,
    label: spec.label,
    type: spec.type,
    required: false,
    pii: spec.pii === true,
    section: spec.section,
    order: spec.order,
    confidence: 1,
    checked: false,
    page: place.page,
    box: place.box,
    pdfField: spec.pdfField,
    writes: spec.writes,
  };
  if (spec.partial) record.partial = spec.partial;
  if (spec.maxChars) record.maxChars = spec.maxChars;
  return record;
}

let widgetOrder = 3000;
function nextOrder() {
  widgetOrder += 1;
  return widgetOrder;
}

const poiChecks = [
  ['chk_Passport', 'Passport', 'passport'],
  ['chk_Driving_Licence_No', 'Driving licence', 'driving_licence'],
  ['chk_Voter_Id_Card_No', 'Voter ID', 'voter_id'],
  ['Chk_Adhaar', 'Aadhaar', 'proof_of_possession_of_aadhaar'],
];

const poiNumbers = [
  ['txt_Passport_No', 'Passport number', 'passport', null],
  ['txt_Driving_Licence_No', 'Driving licence number', 'driving_licence', null],
  ['txt_Voter_Id_Card_No', 'Voter ID number', 'voter_id', null],
];

const poiExpiry = [
  ['txt_Passport_Expiry_Date', 'Passport expiry', 'passport'],
  ['txt_Driving_Licence_Expiry_Date', 'Driving licence expiry', 'driving_licence'],
];

const poaChecks = [
  ['chk_POA_aadhaar', 'POA Aadhaar', 'proof_of_possession_of_aadhaar'],
  ['chk_POA_Passport', 'POA passport', 'passport'],
  ['chk_POA_drivingLicense', 'POA driving licence', 'driving_licence'],
  ['chk_POA_VoterID', 'POA voter ID', 'voter_id'],
];

const occupations = [
  ['chk_Salaried', 'Salaried', 'salaried'],
  ['chk_Self_employed', 'Self-employed', 'self_employed'],
  ['chk_Self_employed_prof', 'Self-employed professional', 'professional'],
  ['chk_Student', 'Student', 'student'],
  ['chk_Housewife', 'Homemaker', 'homemaker'],
  ['chk_Retired', 'Retired', 'retired'],
  ['chk_Occ_Others', 'Other occupation', 'other'],
];

const aadhaarDigits = [
  ['txt_9th_digit_of_adhaar', 'Aadhaar 9th digit', 0],
  ['txt_10th_digit_of_adhaar', 'Aadhaar 10th digit', 1],
  ['txt_11th_digit_of_adhaar', 'Aadhaar 11th digit', 2],
  ['txt_12th_digit_of_adhaar', 'Aadhaar 12th digit', 3],
];

const widgetsOnly = [];

for (const [pdfField, label, equals] of poiChecks) {
  widgetsOnly.push(
    widgetRecord({
      id: pdfField,
      label,
      type: 'checkbox',
      section: 'sec_kyc_ovd',
      order: nextOrder(),
      pdfField,
      writes: [{ pdfField, op: 'check', source: 'ovd_poi_type', equals }],
    }),
  );
}

for (const [pdfField, label, poi] of poiNumbers) {
  widgetsOnly.push(
    widgetRecord({
      id: pdfField,
      label,
      type: 'text',
      section: 'sec_kyc_ovd',
      order: nextOrder(),
      pdfField,
      pii: true,
      writes: [{ pdfField, op: 'text', source: 'ovd_poi_number', when: { ovd_poi_type: poi } }],
    }),
  );
}

for (const [pdfField, label, poi] of poiExpiry) {
  widgetsOnly.push(
    widgetRecord({
      id: pdfField,
      label,
      type: 'date',
      section: 'sec_kyc_ovd',
      order: nextOrder(),
      pdfField,
      writes: [
        {
          pdfField,
          op: 'text',
          source: 'ovd_poi_expiry',
          when: { ovd_poi_type: poi },
          transform: 'dmy',
        },
      ],
    }),
  );
}

for (const [pdfField, label, index] of aadhaarDigits) {
  widgetsOnly.push(
    widgetRecord({
      id: pdfField,
      label,
      type: 'partial',
      section: 'sec_kyc_ovd',
      order: nextOrder(),
      pdfField,
      pii: true,
      partial: { keep: 'last', count: 1 },
      maxChars: 1,
      writes: [
        {
          pdfField,
          op: 'text',
          source: 'ovd_poi_number',
          when: { ovd_poi_type: 'proof_of_possession_of_aadhaar' },
          transform: 'digit',
          digitIndex: index,
        },
      ],
    }),
  );
}

for (const [pdfField, label, equals] of poaChecks) {
  widgetsOnly.push(
    widgetRecord({
      id: pdfField,
      label,
      type: 'checkbox',
      section: 'sec_kyc_ovd',
      order: nextOrder(),
      pdfField,
      writes: [
        {
          pdfField,
          op: 'check',
          source: 'ovd_poa_type',
          equals,
          when: { ovd_poa_same_as_poi: false },
        },
      ],
    }),
  );
}

for (const [pdfField, label, equals] of occupations) {
  widgetsOnly.push(
    widgetRecord({
      id: pdfField,
      label,
      type: 'checkbox',
      section: 'sec_profile_light',
      order: nextOrder(),
      pdfField,
      writes: [{ pdfField, op: 'check', source: 'occupation_bucket', equals }],
    }),
  );
}

const journeyNew = placed('chk_Application_Type_New');
const journeyUpdate = placed('chk_Application_Type_Update');
widgetsOnly.push({
  id: 'chk_Application_Type_New',
  label: 'Application type new',
  type: 'checkbox',
  required: false,
  pii: false,
  section: 'sec_intent',
  order: nextOrder(),
  confidence: 1,
  checked: false,
  page: journeyNew.page,
  box: journeyNew.box,
  pdfField: 'chk_Application_Type_New',
  writes: [
    { pdfField: 'chk_Application_Type_New', op: 'check', source: 'journey_mode', equals: 'account_opening' },
  ],
});
widgetsOnly.push({
  id: 'chk_Application_Type_Update',
  label: 'Application type update',
  type: 'checkbox',
  required: false,
  pii: false,
  section: 'sec_intent',
  order: nextOrder(),
  confidence: 1,
  checked: false,
  page: journeyUpdate.page,
  box: journeyUpdate.box,
  pdfField: 'chk_Application_Type_Update',
  writes: [
    {
      pdfField: 'chk_Application_Type_Update',
      op: 'check',
      source: 'journey_mode',
      equalsAny: ['kyc_update', 'rekyc'],
    },
  ],
});

const today = placed('txt_Date');
widgetsOnly.push({
  id: 'txt_Date',
  label: 'Form date',
  type: 'date',
  required: false,
  pii: false,
  section: 'sec_confirm',
  order: nextOrder(),
  confidence: 1,
  checked: false,
  page: today.page,
  box: today.box,
  pdfField: 'txt_Date',
  writes: [{ pdfField: 'txt_Date', op: 'text', transform: 'today' }],
});

const version = {
  formId: 'aof_kyc_demo_v1',
  version: 'v1',
  bankId: 'HDFC',
  journey: schema.form_type,
  status: 'published',
  source: 'acroform',
  pdfPath: '/forms/HDFC_KYC_Resident_Individual.pdf',
  fields: [...schemaFields, ...widgetsOnly],
};

const json = JSON.stringify(version, null, 2);
const ts = `/* Generated by scripts/emit-hdfc-v1.mjs. Do not edit by hand. */\nexport const HDFC_V1_DATA = ${json};\n`;

writeFileSync(join(root, 'web/src/forms/hdfcV1Data.ts'), ts);
writeFileSync(join(root, 'functions/src/forms/hdfcV1Data.ts'), ts);
writeFileSync(join(root, 'web/src/forms/hdfc.v1.json'), `${json}\n`);
console.log(
  `wrote HDFC v1: ${schemaFields.length} schema fields, ${widgetsOnly.length} widgets, acroform widgets measured ${widgets.size}`,
);
