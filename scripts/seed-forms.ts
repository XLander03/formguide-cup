/**
 * Seed banks, forms/{id}/versions/{v}, and fieldLibrary in the Firestore emulator.
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set. Does not deploy and does not write to live.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/seed-forms.ts
 */
import { encodeFirestoreFields } from '../web/src/forms/loadPublished';
import { seedDocuments } from '../web/src/forms/seedDocs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'faceapp-5397b';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!emulatorHost) {
  fail('Refusing to seed: set FIRESTORE_EMULATOR_HOST. This script never deploys and never writes to live Firestore.');
}
if (/googleapis\.com/i.test(emulatorHost)) {
  fail('Refusing to seed: FIRESTORE_EMULATOR_HOST points at a live Google API host.');
}

const origin = emulatorHost.startsWith('http://') || emulatorHost.startsWith('https://')
  ? emulatorHost.replace(/\/$/, '')
  : `http://${emulatorHost}`;
const root = `${origin}/v1/projects/${projectId}/databases/(default)/documents`;

async function putDoc(path: string, data: Record<string, string | boolean>): Promise<void> {
  const url = `${root}/${path}`;
  await fetch(url, { method: 'DELETE' });
  const parts = path.split('/');
  const id = parts.pop();
  const parent = parts.join('/');
  const createUrl = `${root}/${parent}?documentId=${encodeURIComponent(id || '')}`;
  const res = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFirestoreFields(data) }),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`seed ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  const docs = seedDocuments();
  for (const doc of docs) {
    await putDoc(doc.path, doc.data);
  }
  console.log(`Seeded ${docs.length} published documents into the Firestore emulator at ${origin}. Nothing was deployed.`);
}

void main();
