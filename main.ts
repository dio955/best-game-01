// Cinderworks — best-game-01 entry program (Node 22, stdlib only).
// Copies game/ and screenshots/ from beside this script to /output and
// writes /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Paths resolve from the script's own location, never the working directory.
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The repo is read-only, so cpSync copies read-only modes; make the copy
// owner-writable so a later run can clean or overwrite it.
function makeWritable(dir: string) {
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) makeWritable(p);
    else chmodSync(p, 0o644);
  }
}

// Clear only the contents of the output dir, never the dir itself: the
// grader's /output is writable inside, but its parent is read-only, so
// removing the directory itself fails with EPERM.
if (existsSync(outDir)) {
  for (const entry of readdirSync(outDir)) rmSync(join(outDir, entry), { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

for (const name of ['game', 'screenshots']) {
  const src = join(root, name);
  if (!existsSync(src)) throw new Error(`missing ${name}/ beside main.ts`);
  cpSync(src, join(outDir, name), { recursive: true });
  makeWritable(join(outDir, name));
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
}));
