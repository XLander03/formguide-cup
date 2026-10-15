#!/usr/bin/env node
// Guards against silent drift between files that must be duplicated because
// no shared workspace package exists between the Vite web app and the Cloud
// Functions backend. Add a pair here whenever a new file has to be copied
// between the two instead of imported once from a common source.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const PAIRS = [
  ['web/src/lib/pii.ts', 'functions/src/pii.ts'],
  ['web/src/forms/types.ts', 'functions/src/forms/types.ts'],
  ['web/src/forms/hdfcV1.ts', 'functions/src/forms/hdfcV1.ts'],
  ['web/src/forms/hdfcV1Data.ts', 'functions/src/forms/hdfcV1Data.ts'],
  ['web/src/forms/loadPublished.ts', 'functions/src/forms/loadPublished.ts'],
];

let failed = false;
for (const [a, b] of PAIRS) {
  const contentA = readFileSync(join(root, a), 'utf8');
  const contentB = readFileSync(join(root, b), 'utf8');
  if (contentA !== contentB) {
    failed = true;
    console.error(`DRIFT: ${a} and ${b} no longer match.`);
    console.error('Edit one, then copy it over the other — they must stay byte-identical.');
  }
}

if (failed) {
  console.error('\ncheck:shared failed — see above.');
  process.exit(1);
}
console.log('check:shared: all duplicated files match.');
