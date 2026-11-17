// SOLMAR BAY — the hand-in program for the gta6-01 entry (Node 22, stdlib only).
//
// The game is this repository's game/ directory: plain static files that any
// desktop browser loads offline (game/index.html plus its ES modules, no
// library, no network request at all). This program copies game/ and
// screenshots/ from beside itself into the grader's output directory and
// writes /output/dossier.json, the summary the judge reads, using the
// vendored make.fun library in vendor/makefun-game.ts.
//
// Run it locally to check the entry exactly as the grader will see it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// then serve out/game (for example `node serve.ts` serves game/ on :8080)
// and open it in desktop Chrome. Determinism: the copy and the dossier are
// pure functions of these files, so two runs write identical bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), shotsDir, { recursive: true });
}

// The scorer's caps, from the competition's gate: at most 4 screenshots of
// 256 KiB each, at most 993 files and 48 MiB under game/, every game/ path at
// most 1000 bytes, and a 160 KiB dossier text cap. game/ counts beside the
// platform's own 1000-entry / 64 MiB output cap, so these limits leave room.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
