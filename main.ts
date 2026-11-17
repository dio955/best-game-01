// Cinderworks — best-game-01 entry program (Node 22, stdlib only).
// Copies game/ and screenshots/ from beside this script to /output and
// writes /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Paths resolve from the script's own location, never the working directory.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const name of ['game', 'screenshots']) {
  const src = join(root, name);
  if (!existsSync(src)) throw new Error(`missing ${name}/ beside main.ts`);
  cpSync(src, join(outDir, name), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
}));
