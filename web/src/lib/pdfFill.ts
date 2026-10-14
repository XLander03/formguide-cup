import { PDFDocument, PDFForm, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { FormValues } from './types';

/**
 * Fills the real HDFC Resident-Individual KYC form (from corpus/bank-forms,
 * copied into public/forms/ as a static asset) using its actual AcroForm
 * field names. We only ever write fields this app actually collects —
 * everything else on this real, complex form (income bands, business
 * nature, qualifications, bank-verification sections...) stays blank,
 * never invented. "Fields vary by bank" applies here too: this is one
 * bank's layout, used as a concrete demo artifact, not a universal form.
 */
const TEMPLATE_URL = '/forms/HDFC_KYC_Resident_Individual.pdf';

const GENDER_LABEL: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Other',
};

const OCCUPATION_CHECKBOX: Record<string, string> = {
  salaried: 'chk_Salaried',
  self_employed: 'chk_Self_employed',
  professional: 'chk_Self_employed_prof',
  student: 'chk_Student',
  homemaker: 'chk_Housewife',
  retired: 'chk_Retired',
  other: 'chk_Occ_Others',
};

const OVD_CHECKBOX: Record<string, string> = {
  passport: 'chk_Passport',
  driving_licence: 'chk_Driving_Licence_No',
  voter_id: 'chk_Voter_Id_Card_No',
  // Aadhaar is a valid type in the app, but its number and the form's
  // Aadhaar keys are never written. nrega_job_card / npr_letter have no
  // matching checkbox on this bank's form.
};

const OVD_POA_CHECKBOX: Record<string, string> = {
  passport: 'chk_POA_Passport',
  driving_licence: 'chk_POA_drivingLicense',
  voter_id: 'chk_POA_VoterID',
};

function safeSetText(form: PDFForm, name: string, value: string | undefined | null): void {
  if (!value) return;
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Field missing or wrong widget type on this template — skip rather
    // than throw. We can't visually verify all 150+ fields on this form.
  }
}

function safeCheck(form: PDFForm, name: string | undefined): void {
  if (!name) return;
  try {
    form.getCheckBox(name).check();
  } catch {
    // Same defensive policy as safeSetText.
  }
}

function isoToDmy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

function fillIdentity(form: PDFForm, v: FormValues): void {
  safeSetText(form, 'txt_Self_Name', typeof v.applicant_full_name === 'string' ? v.applicant_full_name : null);
  safeSetText(
    form,
    'txt_Father_or_Spouse_name',
    typeof v.father_or_spouse_name === 'string' ? v.father_or_spouse_name : null,
  );
  if (typeof v.dob === 'string' && v.dob) safeSetText(form, 'txt_Self_DOB', isoToDmy(v.dob));
  if (typeof v.gender === 'string' && v.gender) safeSetText(form, 'txt_Self_Gender', GENDER_LABEL[v.gender] ?? v.gender);
  safeSetText(form, 'txt_Pan_No', typeof v.pan_number === 'string' ? v.pan_number : null);
  safeSetText(form, 'txt_Mobile_No', typeof v.mobile_registered === 'string' ? v.mobile_registered : null);
  safeSetText(form, 'txt_Email_Id', typeof v.email === 'string' ? v.email : null);
}

function fillAddress(form: PDFForm, v: FormValues): void {
  safeSetText(form, 'txt_Address_Line1', typeof v.addr_current_line1 === 'string' ? v.addr_current_line1 : null);
  safeSetText(form, 'txt_Address_Line2', typeof v.addr_current_line2 === 'string' ? v.addr_current_line2 : null);
  safeSetText(form, 'txt_City', typeof v.addr_current_city === 'string' ? v.addr_current_city : null);
  safeSetText(form, 'txt_State', typeof v.addr_current_state === 'string' ? v.addr_current_state : null);
  safeSetText(form, 'txt_Pin', typeof v.addr_current_pin === 'string' ? v.addr_current_pin : null);

  if (v.addr_permanent_same_as_current === false) {
    safeSetText(
      form,
      'txtcor_Address_Line_1',
      typeof v.addr_permanent_line1 === 'string' ? v.addr_permanent_line1 : null,
    );
    safeSetText(form, 'txtcor_City', typeof v.addr_permanent_city === 'string' ? v.addr_permanent_city : null);
    safeSetText(form, 'txtcor_state', typeof v.addr_permanent_state === 'string' ? v.addr_permanent_state : null);
    safeSetText(form, 'txtcor_pin', typeof v.addr_permanent_pin === 'string' ? v.addr_permanent_pin : null);
  }
}

function fillOvd(form: PDFForm, v: FormValues): void {
  const poiType = typeof v.ovd_poi_type === 'string' ? v.ovd_poi_type : null;
  // Aadhaar may be chosen as a document type, but its number and the form's
  // Aadhaar keys are never written into the PDF.
  if (poiType && poiType !== 'proof_of_possession_of_aadhaar' && OVD_CHECKBOX[poiType]) {
    safeCheck(form, OVD_CHECKBOX[poiType]);
    const number = typeof v.ovd_poi_number === 'string' ? v.ovd_poi_number : null;
    if (number && !looksLikeAadhaar(number)) {
      if (poiType === 'passport') {
        safeSetText(form, 'txt_Passport_No', number);
        if (typeof v.ovd_poi_expiry === 'string') safeSetText(form, 'txt_Passport_Expiry_Date', isoToDmy(v.ovd_poi_expiry));
      } else if (poiType === 'driving_licence') {
        safeSetText(form, 'txt_Driving_Licence_No', number);
        if (typeof v.ovd_poi_expiry === 'string') {
          safeSetText(form, 'txt_Driving_Licence_Expiry_Date', isoToDmy(v.ovd_poi_expiry));
        }
      } else if (poiType === 'voter_id') {
        safeSetText(form, 'txt_Voter_Id_Card_No', number);
      }
    }
  }

  if (v.ovd_poa_same_as_poi === false && typeof v.ovd_poa_type === 'string') {
    if (v.ovd_poa_type !== 'proof_of_possession_of_aadhaar') safeCheck(form, OVD_POA_CHECKBOX[v.ovd_poa_type]);
  }
}

function looksLikeAadhaar(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12) return true;
  return /•/.test(value) && digits.length > 0 && digits.length <= 4;
}

function fillProfile(form: PDFForm, v: FormValues): void {
  if (typeof v.occupation_bucket === 'string' && OCCUPATION_CHECKBOX[v.occupation_bucket]) {
    safeCheck(form, OCCUPATION_CHECKBOX[v.occupation_bucket]);
  }
  if (v.pep_declaration === true) safeCheck(form, 'Chk_PEP');
  if (v.journey_mode === 'account_opening') safeCheck(form, 'chk_Application_Type_New');
  else if (v.journey_mode === 'kyc_update' || v.journey_mode === 'rekyc') {
    safeCheck(form, 'chk_Application_Type_Update');
  }
}

function applyFieldMappings(form: PDFForm, values: FormValues): void {
  fillIdentity(form, values);
  fillAddress(form, values);
  fillOvd(form, values);
  fillProfile(form, values);
  const today = new Date();
  safeSetText(
    form,
    'txt_Date',
    `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`,
  );
}

async function drawDraftWatermark(pdfDoc: PDFDocument): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText('DRAFT - NOT SUBMITTED TO ANY BANK', {
      x: width * 0.08,
      y: height * 0.45,
      size: 22,
      font,
      color: rgb(0.8, 0.1, 0.1),
      rotate: degrees(35),
      opacity: 0.22,
    });
    page.drawText('Fields vary by bank. Prepared via FormGuide demo.', {
      x: width * 0.06,
      y: height * 0.03,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
      opacity: 0.8,
    });
  }
}

export async function buildFilledKycPdf(values: FormValues): Promise<Blob> {
  const bytes = await fetch(TEMPLATE_URL).then((r) => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  applyFieldMappings(form, values);

  try {
    form.flatten();
  } catch {
    // Some widget/appearance quirk on this real-world PDF — ship the
    // filled-but-unflattened document rather than failing the download.
  }

  await drawDraftWatermark(pdfDoc);

  const outBytes = await pdfDoc.save();
  // pdf-lib's Uint8Array type doesn't line up with the stricter BlobPart
  // typing in newer TS DOM libs (SharedArrayBuffer vs ArrayBuffer) — Blob
  // accepts a Uint8Array fine at runtime, so this is a typing-only cast.
  return new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
}
