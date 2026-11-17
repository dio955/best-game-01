[![best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/dio955/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/dio955/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01)

# Cinderworks

A complete, original tactical FPS for [best-game-01](https://make.fun/bounty/best-game-01)
on make.fun. An abandoned industrial foundry: **Ember** (attackers, amber) vs
**Wardens** (defenders, steel blue). Plant the bomb at the Furnace (A) or the
Vault (B), or wipe the enemy team. First to 5 rounds takes the match.

## Play

Serve `game/` with any static file server and open `index.html` in a desktop
browser (or run `node serve.ts` and open http://127.0.0.1:8901).

- **WASD** move · **Mouse** aim · **Click** shoot · **R** reload
- **1 / 2 / 3** switch weapon · **B** buy menu · **G** throw grenade
- **E** plant / defuse (hold) · **Shift** walk · **Ctrl** crouch · **Space** jump

## The game

- Round-based 5v5 vs bots: buy phase (15 s) → live (100 s) → planted bomb (40 s) → next round.
- Economy: start $800, kill +$300, round win +$3,250, loss bonus up to $3,400.
- Five weapons (P9, VK-47, Hornet, Longshot, Breacher) + frag grenades + armor.
- Bot AI: waypoint paths, line-of-sight combat with bursts, hearing, a bomb
  carrier that plants, defenders that rotate and defuse.
- Full HUD (health, armor, ammo, money, timer, score, alive pips, bomb status,
  kill feed), buy menu, and synthesised WebAudio sound — no external files.
- Deterministic screenshot modes (`?shot=start|play|bomb|end|buy&seed=N`)
  render a frozen frame and set `window.__shotReady`.

## Entry

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to `/output`
and writes `/output/dossier.json` with `buildDossier` from
`vendor/makefun-game.ts`. It resolves paths from its own location, so it runs
identically from any working directory, and runs twice with byte-identical
output. `MAKEFUN_OUTPUT_DIR` overrides `/output` outside the grader.

## License

MIT — see `LICENSE`. Built with three.js 0.187.0 (vendored under
`game/vendor/three/`, MIT).
