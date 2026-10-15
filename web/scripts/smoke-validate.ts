/**
 * Locks field format checks and PAN capitals.
 * Run from web/: npx vite-node scripts/smoke-validate.ts
 */
import { priyaDemoValues } from '../src/lib/schema';
import { fieldIssue, invalidFieldIds, normalizeInput } from '../src/lib/validate';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(normalizeInput('pan_number', 'abcde1234f') === 'ABCDE1234F', 'pan lower');
assert(normalizeInput('pan_number', 'ab cde-1234 f') === 'ABCDE1234F', 'pan spaced');
assert(normalizeInput('pan_number', 'ABCDE1234FEXTRA') === 'ABCDE1234F', 'pan clipped');
assert(normalizeInput('mobile_registered', '98765 01234') === '9876501234', 'mobile spaces');
assert(normalizeInput('mobile_registered', '+91 98765 01234') === '9876501234', 'mobile country code');
assert(normalizeInput('addr_current_pin', '560 001') === '560001', 'pin spaces');
assert(normalizeInput('dob', '15/08/1992') === '1992-08-15', 'dob slash');
assert(normalizeInput('dob', '15 August 1992') === '1992-08-15', 'dob named');

assert(fieldIssue('pan_number', 'ABCDE1234F') === null, 'valid pan');
assert(fieldIssue('pan_number', '') === null, 'blank pan is missing, not invalid');
const lower = fieldIssue('pan_number', 'abcde1234f');
assert(lower !== null && /capital/i.test(lower), `lower pan message ${lower}`);
const short = fieldIssue('pan_number', 'ABCDE123');
assert(short !== null && /ABCDE1234F/.test(short), `short pan message ${short}`);
const shape = fieldIssue('pan_number', '12345ABCDE');
assert(shape !== null, 'wrong pan shape');

assert(fieldIssue('mobile_registered', '9876501234') === null, 'valid mobile');
assert(fieldIssue('mobile_registered', '5876501234') !== null, 'mobile leading 5');
assert(fieldIssue('mobile_registered', '987650123') !== null, 'mobile short');
assert(fieldIssue('addr_current_pin', '560001') === null, 'valid pin');
assert(fieldIssue('addr_current_pin', '056001') !== null, 'pin leading zero');
assert(fieldIssue('email', 'priya.sharma.demo@example.com') === null, 'valid email');
assert(fieldIssue('email', 'not-an-email') !== null, 'bad email');
assert(fieldIssue('dob', '1992-08-15') === null, 'adult dob');
assert(fieldIssue('dob', '2015-01-01') !== null, 'under 18');
assert(fieldIssue('dob', '1992-13-40') !== null, 'impossible dob');
assert(fieldIssue('applicant_full_name', 'A') !== null, 'short name');
assert(fieldIssue('applicant_full_name', 'Ananya Reddy') === null, 'name ok');

const ids = invalidFieldIds({
  pan_number: 'ABCDE123',
  mobile_registered: '9876501234',
  applicant_full_name: 'Ananya Reddy',
});
assert(ids.length === 1 && ids[0] === 'pan_number', `invalid ids ${ids.join(',')}`);
const priyaIssues = invalidFieldIds(priyaDemoValues());
assert(priyaIssues.length === 0, `priya demo should already be valid: ${priyaIssues.join(',')}`);

console.log('smoke-validate: ok');
