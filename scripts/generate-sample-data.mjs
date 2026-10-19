// Regenerates every file in sample-data/ (except README.md) from the deterministic sample
// generator, so the CSVs always match what "Load illustrative sample" produces in the app.
// Usage: node scripts/generate-sample-data.mjs   (tests fail if the files drift)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sampleDataFiles } from './sample-data-files.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'sample-data');
for (const [name, content] of Object.entries(sampleDataFiles())) {
  writeFileSync(join(outDir, name), content);
  console.log(`wrote sample-data/${name}`);
}
