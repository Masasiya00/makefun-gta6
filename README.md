[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/gta6-01)
[![Solmar Bay](https://img.shields.io/badge/game-Solmar%20Bay-ffd166)](https://make.fun/bounty/gta6-01)
[![Open world](https://img.shields.io/badge/open%20world-2D%20canvas-2ecc71)](https://make.fun/bounty/gta6-01)

# SOLMAR BAY — an open-world crime game

Dario Cruz is back in Solmar Bay, a sun-soaked fictional coastal city.
Steal cars, take missions from Mama Rosa, outrun Chief Duarte's police,
and own the coast — all in a 2D top-down open world that runs entirely
offline in desktop Chrome. No assets, names, music or characters from any
commercial game: everything here is original.

## Play

Open `game/index.html` (or `node serve.ts` and visit http://localhost:8080).

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Mouse + click | Aim and shoot |
| E | Enter / exit a car (steal a driven one: wanted +1) |
| F | Interact — shops, mission start |
| Q | Switch radio station (3 procedural stations) |
| R | Reload · 1–4 cycle weapons |
| Hold click (in car) | Handbrake |
| P / Esc | Pause |

## What's inside

- **A city to explore**: 8 districts (Palm Beach, Marina, Old Town, Neon Row,
  Dockside, Hillcrest, Airfield, Sunset Park), a beach and ocean, parks,
  parking lots, 30 traffic cars and 55 pedestrians with panic AI.
- **Cars**: 6 models to drive and steal, plus parked cars in lots.
- **Wanted 1–5 stars**: police cars that chase and ram, a police helicopter
  from 3 stars, heat that fades when you stay out of sight, busted and
  wasted screens.
- **6 story missions** with dialogue, objectives and cash rewards, from
  *First Wheels* to the finale *The Big Score*.
- **Combat**: fists, pistol, SMG and shotgun, with ammo, armor and health.
- **Money and shops**: Ironworks Guns, Tico Tacos, Neon Threads, Rosa Garage;
  cash and health pickups scattered around the city.
- **HUD**: money, district, clock, wanted stars, health/armor, weapon/ammo,
  speedometer, mission tracker, radio strip, and a circular minimap with
  cop and mission blips.
- **Radio**: 3 procedural WebAudio stations (Sunset FM, Neon Nights, Coastal
  Chill) with DJ lines — no audio files.
- **Save**: progress autosaves to localStorage; a day/night cycle with
  golden-hour sunsets and neon nights.
- **60fps, 0 console errors, 0 network requests** — vanilla JS canvas,
  fixed 1/60 s steps.

## Screenshots

Deterministic scenes, rendered by the game itself:
`?shot=chase|city|mission|night&seed=7` (sets `window.__shotReady`).

1. `1-chase.jpg` — police chase at sunset on the beachfront avenue
2. `2-city.jpg` — on foot in Old Town with traffic and pedestrians
3. `3-mission.jpg` — mission *Beach Run* in progress, cops closing in
4. `4-night.jpg` — night drive in Neon Row, headlights and radio on

## Build

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with the
vendored make.fun library. `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

MIT licensed. Built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).
