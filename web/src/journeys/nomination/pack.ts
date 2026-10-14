import type { JourneyFieldView } from '../registry';
import { registerJourney } from '../registry';
import { extractNomination } from './extract';
import { buildNominationPdf } from './pdf';
import { nominationReadback } from './readback';
import {
  NOMINATION_SCHEMA,
  emptyNominationValues,
  isNominationRequired,
  nominationCompleteness,
  nominationDemoValues,
  nominationMissing,
  nominationSectionTitle,
} from './schema';

const ENUM_LABELS: Record<string, string> = {
  wife: 'Wife',
  husband: 'Husband',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  brother: 'Brother',
  sister: 'Sister',
  other: 'Other',
};

function speakFields(): JourneyFieldView[] {
  return NOMINATION_SCHEMA.fields
    .filter((field) => field.group !== 'confirm_gates')
    .map((field) => ({
      id: field.id,
      label: field.label_en,
      hint: field.voice_hints?.[0] ?? '',
      required: field.required,
      section: nominationSectionTitle(field.group),
      enumRef: field.enum_ref,
      kind: field.type === 'boolean' ? 'boolean' : field.enum_ref ? 'enum' : 'text',
    }));
}

registerJourney({
  id: 'nomination',
  title: 'Nomination',
  titleHi: 'नॉमिनेशन',
  schemaId: 'nomination_savings_demo_v1',
  hidesLater: ['Nomination'],
  card: {
    kind: 'Nomination',
    name: 'Add or change nominee',
    blurb: 'Name who receives the balance of a savings account you already hold',
    needs: [
      'Savings account number',
      'Customer ID',
      'Nominee name, relationship, date of birth, and address',
      'Guardian name and address if the nominee is a minor',
    ],
  },
  sections: ['Account', 'Nominee', 'Guardian'],
  enums: NOMINATION_SCHEMA.enums,
  enumLabels: ENUM_LABELS,
  primaryNameField: 'account_holder_name',
  sampleLines: [
    'मैं बचत खाते पर नॉमिनी जोड़ना चाहता हूँ। खाताधारक का नाम राहुल देशमुख है। खाता संख्या 501000112233। ग्राहक आईडी 778899। नॉमिनी का नाम कविता देशमुख है। रिश्ता पत्नी। जन्म तिथि 02/11/1990। पता 9 एफसी रोड पुणे। वो नाबालिग नहीं है।',
    'Add a nominee. खाताधारक Meera Iyer, account number 123456789012, customer ID CIF88421. Nominee Arjun Iyer, my son, DOB 14/06/2012, address 18 Residency Road, Bengaluru. He is a minor. Guardian is Meera Iyer, same address. Mobile 9845012345.',
    'I want to add a nominee on my savings account. Account holder Meera Iyer, account number 123456789012, customer ID CIF88421. Nominee is Arjun Iyer, my son, date of birth 14/06/2012, address 18 Residency Road, Bengaluru. He is a minor. Guardian is Meera Iyer, same address 18 Residency Road, Bengaluru. Mobile 9845012345.',
  ],
  pickerSamples: [
    {
      text: 'मुझे अपने सेविंग अकाउंट पर नॉमिनी जोड़ना है',
      cardId: 'nomination',
    },
  ],
  speakFields,
  emptyValues: emptyNominationValues,
  demoValues: nominationDemoValues,
  demoConfidence: () => {
    const values = nominationDemoValues();
    const confidence: Record<string, { confidence: number; confirmed: boolean }> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== '' && value !== undefined) {
        confidence[key] = { confidence: 0.9, confirmed: false };
      }
    }
    return confidence;
  },
  extract: extractNomination,
  isRequired: (values, id) => {
    const field = NOMINATION_SCHEMA.fields.find((item) => item.id === id);
    return field ? isNominationRequired(field, values) : false;
  },
  missing: nominationMissing,
  completeness: nominationCompleteness,
  readback: nominationReadback,
  buildPdf: ({ values, confidence }) => buildNominationPdf(values, confidence),
});

