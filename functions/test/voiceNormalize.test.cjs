/**
 * Hindi voice normalizers. Run after tsc: npm test (from functions/).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkDigitField,
  cityFromTranscript,
  digitRecheckAsk,
  dobFromTranscript,
  normalizeDate,
  normalizePlace,
  normalizeVoiceUpdates,
  spokenDigits,
  transliterateDevanagari,
} = require('../lib/voiceNormalize');

test('Hindi spoken DOB → ISO', () => {
  assert.equal(normalizeDate('बारह मार्च उन्नीस सौ चौरानवे'), '1994-03-12');
  assert.equal(normalizeDate('बारह मार्च उन्नीस चौरानवे'), '1994-03-12');
  assert.equal(normalizeDate('पंद्रह अगस्त उन्नीस सौ बानबे'), '1992-08-15');
  assert.equal(normalizeDate('पाँच जनवरी दो हज़ार एक'), '2001-01-05');
  assert.equal(normalizeDate('पहली फ़रवरी 1990'), '1990-02-01');
  assert.equal(normalizeDate('12वीं मार्च 1994'), '1994-03-12');
});

test('Devanagari digits, Hinglish months, numeric forms', () => {
  assert.equal(normalizeDate('१२/०३/१९९४'), '1994-03-12');
  assert.equal(normalizeDate('१२ मार्च १९९४'), '1994-03-12');
  assert.equal(normalizeDate('12 maarch 1994'), '1994-03-12');
  assert.equal(normalizeDate('3 farvari 1988'), '1988-02-03');
  assert.equal(normalizeDate('बारह March 1994'), '1994-03-12');
  assert.equal(normalizeDate('1994-03-12'), '1994-03-12');
  assert.equal(normalizeDate('1994/3/12'), '1994-03-12');
  assert.equal(normalizeDate('12-03-1994'), '1994-03-12');
  assert.equal(normalizeDate('twelfth March nineteen ninety four'), '1994-03-12');
});

test('precomposed and combining nukta both match', () => {
  const pre = '\u095Eरवरी';
  const comb = '\u092B\u093Cरवरी';
  assert.equal(normalizeDate(`दस ${pre} 1990`), '1990-02-10');
  assert.equal(normalizeDate(`दस ${comb} 1990`), '1990-02-10');
});

test('invalid or incomplete dates are rejected', () => {
  assert.equal(normalizeDate('बारह मार्च'), null);
  assert.equal(normalizeDate('तीस फरवरी 1994'), null);
  assert.equal(normalizeDate('1994-02-30'), null);
  assert.equal(normalizeDate('12/03/2999'), null);
  assert.equal(normalizeDate('12/03/2999', true), null);
  assert.equal(normalizeDate('31/08/2029', true), '2029-08-31');
  assert.equal(normalizeDate('31 फरवरी 1994'), null);
});

test('DOB from transcript needs a cue or a DOB ask', () => {
  const t = 'मेरी जन्म तिथि बारह मार्च उन्नीस सौ चौरानवे है।';
  assert.equal(dobFromTranscript(t, false), '1994-03-12');
  assert.equal(dobFromTranscript('बारह मार्च उन्नीस सौ चौरानवे', false), null);
  assert.equal(dobFromTranscript('बारह मार्च उन्नीस सौ चौरानवे', true), '1994-03-12');
});

test('spoken digits: Hindi, doubles, mixed scripts', () => {
  assert.equal(spokenDigits('नौ आठ सात छह पांच चार तीन दो एक शून्य'), '9876543210');
  assert.equal(spokenDigits('नौ आठ सात सात दो दो एक एक शून्य शून्य'), '9877221100');
  assert.equal(spokenDigits('डबल नौ आठ सात'), '99' + '87');
  assert.equal(spokenDigits('ट्रिपल शून्य'), '000');
  assert.equal(spokenDigits('९८ seven छह 5'), '9876' + '5');
  assert.equal(spokenDigits('nau aath saat'), '987');
  assert.equal(spokenDigits('double five six'), '556');
  assert.equal(spokenDigits('अट्ठानवे सत्तासी'), '9887');
  assert.equal(spokenDigits('पाँच सौ साठ शून्य तीन आठ'), '560038');
  assert.equal(spokenDigits('ninety eight seventy six'), '9876');
  assert.equal(spokenDigits('+91 98765 43210'), '919876543210');
});

test('digit fields: counts and confidence', () => {
  assert.deepEqual(checkDigitField('mobile_registered', 'नौ आठ सात छह पांच चार तीन दो एक शून्य'), {
    value: '9876543210',
    ok: true,
  });
  assert.equal(checkDigitField('mobile_registered', '+91 98765 43210').value, '9876543210');
  assert.equal(checkDigitField('mobile_registered', '09876543210').value, '9876543210');
  const short = checkDigitField('mobile_registered', 'नौ आठ सात छह पांच चार तीन दो एक');
  assert.equal(short.ok, false);
  assert.equal(short.value, '987654321');
  assert.match(short.reason, /9 digits, expected 10/);
  assert.equal(checkDigitField('addr_current_pin', 'पांच छह शून्य शून्य तीन आठ').value, '560038');
  assert.equal(checkDigitField('addr_current_pin', 'पांच छह शून्य तीन आठ').ok, false);
  assert.equal(checkDigitField('ckyc_number', 'ABC123'), null);
  assert.equal(checkDigitField('email', 'x'), null);
});

test('places: Devanagari, Latin aliases, transliteration fallback', () => {
  assert.deepEqual(normalizePlace('बेंगलुरु', 'city'), { value: 'Bengaluru', state: 'Karnataka', transliterated: false });
  assert.equal(normalizePlace('बैंगलोर शहर', 'city').value, 'Bengaluru');
  assert.equal(normalizePlace('नई दिल्ली', 'city').value, 'New Delhi');
  assert.equal(normalizePlace('दिल्ली', 'city').value, 'Delhi');
  assert.equal(normalizePlace('लखनऊ', 'city').value, 'Lucknow');
  assert.equal(normalizePlace('गुड़गांव', 'city').value, 'Gurugram');
  assert.equal(normalizePlace('Bangalore', 'city').value, 'Bengaluru');
  assert.equal(normalizePlace('Bengaluru', 'city').value, 'Bengaluru');
  assert.equal(normalizePlace('Sitapur', 'city'), null);
  assert.equal(normalizePlace('कर्नाटक', 'state').value, 'Karnataka');
  assert.equal(normalizePlace('उत्तर प्रदेश', 'state').value, 'Uttar Pradesh');
  const unknown = normalizePlace('सीतापुर', 'city');
  assert.equal(unknown.value, 'Sitapur');
  assert.equal(unknown.transliterated, true);
  assert.equal(transliterateDevanagari('गोरखपुर'), 'Gorakhpur');
  assert.equal(transliterateDevanagari('कानपुर'), 'Kanpur');
});

test('city from transcript: exactly one known city', () => {
  assert.equal(cityFromTranscript('मैं नई दिल्ली में रहती हूँ').name, 'New Delhi');
  assert.equal(cityFromTranscript('मैं बेंगलुरु में रहता हूँ').name, 'Bengaluru');
  assert.equal(cityFromTranscript('जन्म पटना में, अब मुंबई में रहता हूँ'), null);
  assert.equal(cityFromTranscript('कोई शहर नहीं'), null);
});

test('normalizeVoiceUpdates: Hindi model values become schema values', () => {
  const out = normalizeVoiceUpdates({
    current: {},
    updates: {
      dob: 'बारह मार्च उन्नीस सौ चौरानवे',
      addr_current_city: 'बेंगलुरु',
      mobile_registered: 'नौ आठ सात छह पांच चार तीन दो एक शून्य',
      addr_current_pin: '५६००३८',
    },
    meta: { dob: { confidence: 0.9 } },
    transcript: 'जन्म तिथि बारह मार्च उन्नीस सौ चौरानवे। मैं बेंगलुरु में रहती हूँ।',
    hindi: true,
    asked: [],
  });
  assert.equal(out.updates.dob, '1994-03-12');
  assert.equal(out.updates.addr_current_city, 'Bengaluru');
  assert.equal(out.updates.addr_current_state, 'Karnataka');
  assert.equal(out.updates.mobile_registered, '9876543210');
  assert.equal(out.updates.addr_current_pin, '560038');
  assert.deepEqual(out.meta.dob, { confidence: 0.9 });
  assert.deepEqual(out.recheck, []);
});

test('normalizeVoiceUpdates: wrong digit count is flagged and re-asked', () => {
  const out = normalizeVoiceUpdates({
    current: {},
    updates: { mobile_registered: '987654321' },
    meta: { mobile_registered: { confidence: 0.95 } },
    transcript: 'मोबाइल नौ आठ सात छह पांच चार तीन दो एक',
    hindi: true,
    asked: [],
  });
  assert.equal(out.updates.mobile_registered, '987654321');
  assert.ok(out.meta.mobile_registered.confidence < 0.5);
  assert.match(out.meta.mobile_registered.reason, /9 digits/);
  assert.deepEqual(out.recheck, [{ key: 'mobile_registered', heard: 9, expected: 10 }]);
  assert.match(digitRecheckAsk(out.recheck, 'hi'), /मोबाइल नंबर में 9 अंक/);
  assert.match(digitRecheckAsk(out.recheck, 'en'), /9 digits for the mobile number/);
});

test('normalizeVoiceUpdates: model dropped a doubled digit, transcript has all ten', () => {
  const out = normalizeVoiceUpdates({
    current: {},
    updates: { mobile_registered: '987721100' },
    meta: { mobile_registered: { confidence: 0.9 } },
    transcript: 'मेरा मोबाइल नौ आठ सात सात दो दो एक एक शून्य शून्य है',
    hindi: true,
    asked: [],
  });
  assert.equal(out.updates.mobile_registered, '9877221100');
  assert.equal(out.meta.mobile_registered.confidence, 0.8);
  assert.deepEqual(out.recheck, []);
});

test('normalizeVoiceUpdates: Hindi transcript fills fields the model left empty', () => {
  const out = normalizeVoiceUpdates({
    current: { applicant_full_name: 'प्रिया शर्मा' },
    updates: {},
    meta: {},
    transcript: 'मेरी जन्म तिथि बारह मार्च उन्नीस सौ चौरानवे है। मैं लखनऊ में रहती हूँ। पिन कोड दो दो छह शून्य शून्य एक।',
    hindi: true,
    asked: [],
  });
  assert.equal(out.updates.dob, '1994-03-12');
  assert.equal(out.updates.addr_current_city, 'Lucknow');
  assert.equal(out.updates.addr_current_state, 'Uttar Pradesh');
  assert.equal(out.updates.addr_current_pin, '226001');
});

test('normalizeVoiceUpdates: answer to the asked field without a cue', () => {
  const dob = normalizeVoiceUpdates({
    current: {},
    updates: {},
    meta: {},
    transcript: 'बारह मार्च उन्नीस सौ चौरानवे',
    hindi: true,
    asked: ['dob', 'mobile_registered'],
  });
  assert.equal(dob.updates.dob, '1994-03-12');
  const pin = normalizeVoiceUpdates({
    current: {},
    updates: {},
    meta: {},
    transcript: 'पांच छह शून्य शून्य तीन आठ',
    hindi: true,
    asked: ['addr_current_pin'],
  });
  assert.equal(pin.updates.addr_current_pin, '560038');
});

test('normalizeVoiceUpdates: English path keeps values and skips gap-fill', () => {
  const out = normalizeVoiceUpdates({
    current: {},
    updates: { dob: '1992-08-15', addr_current_city: 'Bengaluru', mobile_registered: '9876501234' },
    meta: {},
    transcript: 'DOB 15 August 1992, I live in Bengaluru, mobile 9876501234',
    hindi: false,
    asked: [],
  });
  assert.deepEqual(out.updates, {
    dob: '1992-08-15',
    addr_current_city: 'Bengaluru',
    mobile_registered: '9876501234',
  });
  const none = normalizeVoiceUpdates({
    current: {},
    updates: {},
    meta: {},
    transcript: 'मेरी जन्म तिथि बारह मार्च उन्नीस सौ चौरानवे है।',
    hindi: false,
    asked: [],
  });
  assert.deepEqual(none.updates, {});
});

test('normalizeVoiceUpdates: unparseable DOB is dropped, filled fields are not overwritten by gap-fill', () => {
  const out = normalizeVoiceUpdates({
    current: { addr_current_city: 'Pune', dob: '1990-01-01' },
    updates: { dob: 'बारह मार्च' },
    meta: { dob: { confidence: 0.5 } },
    transcript: 'बारह मार्च। मैं लखनऊ में रहती हूँ।',
    hindi: true,
    asked: [],
  });
  assert.equal(out.updates.dob, undefined);
  assert.equal(out.meta.dob, undefined);
  assert.equal(out.updates.addr_current_city, undefined);
});
