import { describe, expect, it } from 'vitest';
import { buildReadbackScript } from './heuristicExtract';
import { detectScriptLanguage, LANGUAGES } from './languages';
import { isRegionalLanguage, spokenDate } from './readbackI18n';
import { readbackFollowup } from './utteranceLang';

const AOF = {
  journey_mode: 'account_opening',
  applicant_full_name: 'Priya Sharma',
  dob: '1994-03-12',
  mobile_registered: '9876543210',
  ovd_poi_type: 'driving_licence',
  account_product_intent: 'regular_savings',
};

describe('regional read-back', () => {
  it('reads the AOF draft in Telugu with Latin values and the required English line', () => {
    const script = buildReadbackScript(AOF, 'te');
    expect(script).toContain('పేరు: Priya Sharma');
    // Dates are read as day, month name and year, not the raw stored form.
    expect(script).toContain('12 మార్చి, 1994');
    expect(script).not.toContain('1994-03-12');
    expect(script).toContain('3210');
    expect(script).toContain('డ్రైవింగ్ లైసెన్స్');
    expect(script).toContain('సాధారణ పొదుపు ఖాతా');
    expect(script).toContain('Fields vary by bank.');
    expect(script).not.toContain('Please confirm');
  });

  it('reads the debit reissue draft in Kannada, last four only', () => {
    const script = buildReadbackScript(
      {
        journey_mode: 'debit_reissue',
        applicant_full_name: 'Priya Sharma',
        card_customer_id: 'CIF102938',
        card_account_number: '501002223334',
        card_last4: '4417',
        card_reason: 'stolen',
        card_reissue_new: true,
      },
      'kn',
    );
    expect(script).toContain('ಡೆಬಿಟ್ ಕಾರ್ಡ್ ಮರು ವಿತರಣೆ');
    expect(script).toContain('4417');
    expect(script).toContain('ಕಳ್ಳತನವಾಗಿದೆ');
    expect(script).toContain('Fields vary by bank.');
  });

  it('has copy for every regional picker language, English and Hindi unchanged', () => {
    for (const lang of LANGUAGES) {
      if (lang.id === 'en' || lang.id === 'hi') {
        expect(isRegionalLanguage(lang.id)).toBe(false);
        continue;
      }
      expect(isRegionalLanguage(lang.id)).toBe(true);
      expect(buildReadbackScript(AOF, lang.id)).toContain('Priya Sharma');
      expect(readbackFollowup(lang.id)).toContain('confirmed, draft only, no live submit');
    }
    expect(buildReadbackScript(AOF, 'en')).toMatch(/^Please confirm this read-back\./);
    expect(buildReadbackScript(AOF, 'hi')).toMatch(/^कृपया इस रीड-बैक/);
  });
});

describe('detectScriptLanguage', () => {
  it('detects typed regional text and leaves Latin text to the caller', () => {
    expect(detectScriptLanguage('నా పేరు ప్రియ', 'en-IN')).toBe('te-IN');
    expect(detectScriptLanguage('माझं नाव प्रिया', 'mr-IN')).toBe('mr-IN');
    expect(detectScriptLanguage('मेरा नाम प्रिया', 'en-IN')).toBe('hi-IN');
    expect(detectScriptLanguage('My name is Priya', 'te-IN')).toBeNull();
  });
});

describe('spoken dates', () => {
  it('reads a stored date as day, month name and year in the read-back language', () => {
    expect(spokenDate('1994-03-12', 'en-IN')).toBe('12 March 1994');
    expect(spokenDate('1994-03-12', 'hi-IN')).toBe('12 मार्च 1994');
    expect(spokenDate('1994-03-12', 'te-IN')).toMatch(/^12 .+ 1994$/);
    expect(spokenDate('1994-03-12', 'bn-IN')).toMatch(/12/);
    expect(spokenDate('not a date', 'hi-IN')).toBe('not a date');
  });

  it('the Hindi read-back no longer says the raw date', () => {
    const script = buildReadbackScript({ applicant_full_name: 'Priya Sharma', dob: '1994-03-12' }, 'hi');
    expect(script).toContain('12 मार्च 1994');
    expect(script).not.toContain('1994-03-12');
  });
});
