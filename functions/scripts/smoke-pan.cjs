/**
 * PAN request gate and extract sanitizer. Run after tsc: node scripts/smoke-pan.cjs
 */
const { dropAadhaarNumbers } = require('../lib/aadhaarScope');
const { readPanImageRequest, sanitizePanExtract } = require('../lib/pan');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function multipart(parts) {
  const boundary = '----panboundary';
  const chunks = [];
  for (const part of parts) {
    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${part.name}"` +
      (part.filename ? `; filename="${part.filename}"` : '') +
      `\r\n` +
      (part.type ? `Content-Type: ${part.type}\r\n` : '') +
      `\r\n`;
    chunks.push(Buffer.from(head));
    chunks.push(Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    raw: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22, 0x33]);
const audio = multipart([
  { name: 'language', body: 'en-IN' },
  { name: 'audio', filename: 'clip.wav', type: 'audio/wav', body: Buffer.from('RIFFxxxx') },
]);
assert(readPanImageRequest(audio.raw, audio.contentType).kind === 'skip', 'audio is not pan mode');

const ok = multipart([
  { name: 'mode', body: 'pan' },
  { name: 'image', filename: 'pan.jpg', type: 'image/jpeg', body: jpeg },
]);
const read = readPanImageRequest(ok.raw, ok.contentType);
assert(read.kind === 'pan' && read.image.equals(jpeg), 'jpeg passes');

const png = multipart([
  { name: 'mode', body: 'pan' },
  { name: 'image', filename: 'pan.png', type: 'image/png', body: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
]);
const bad = readPanImageRequest(png.raw, png.contentType);
assert(bad.kind === 'reject' && bad.error === 'bad_image', 'non-jpeg rejected');

const huge = multipart([
  { name: 'mode', body: 'pan' },
  { name: 'image', filename: 'pan.jpg', type: 'image/jpeg', body: Buffer.concat([jpeg, Buffer.alloc(1_500_001)]) },
]);
const tooBig = readPanImageRequest(huge.raw, huge.contentType);
assert(tooBig.kind === 'reject' && tooBig.error === 'image_too_large', 'oversize rejected');

const sample = sanitizePanExtract({
  ok: true,
  applicant_full_name: 'SAMPLE PERSON',
  dob: '15/08/1990',
  pan_number: 'SAMPL1234Z',
  aadhaar_voluntary_consent: true,
  ovd_poi_number: '123412341234',
});
assert(sample.ok === true, 'sample ok');
assert(sample.fields.dob === '1990-08-15', 'dob normalized');
assert(sample.fields.pan_number === 'SAMPL1234Z', 'pan kept');
assert(sample.fields.applicant_full_name === 'SAMPLE PERSON', 'name kept');
assert(!('aadhaar_voluntary_consent' in sample.fields), 'aadhaar not copied');
assert(!('ovd_poi_number' in sample.fields), 'no extra ids');

assert(
  sanitizePanExtract({ ok: false, applicant_full_name: 'Guess', dob: '1990-01-01', pan_number: 'SAMPL1234Z' }).ok ===
    false,
  'not a pan fills nothing',
);
assert(
  sanitizePanExtract({ ok: true, pan_number: '123412341234', applicant_full_name: null, dob: null }).ok === false,
  'aadhaar number is not a pan',
);

const dropped = dropAadhaarNumbers(
  { ovd_poi_type: 'proof_of_possession_of_aadhaar' },
  { ovd_poi_number: '123412341234', aadhaar_voluntary_consent: true, applicant_full_name: 'SAMPLE PERSON' },
);
assert(dropped.applicant_full_name === 'SAMPLE PERSON', 'name kept');
assert(!('ovd_poi_number' in dropped), 'aadhaar number dropped');
assert(!('aadhaar_voluntary_consent' in dropped), 'consent dropped');

console.log('pan function gate ok');
