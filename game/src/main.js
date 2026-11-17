// Boot and the one loop: Solmar Bay, an open-world crime game.
// Fixed 1/60 s steps, camera follows the player, screens: title, play, paused,
// busted, wasted, win. ?seed=N fixes the city; ?shot=chase|city|mission|night
// (&seed=N) stages that scene, paints it twice and sets window.__shotReady.
import { CAR_MODELS, SAVE_KEY, STEP, WEAPONS, ZOOM } from './config.js';
import { createRandom, clamp, dist2 } from './random.js';
import { createCity } from './world.js';
import { createEntities, EVT_BUSTED, EVT_WASTED } from './entities.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import {
  ACT_CONFIRM, ACT_ENTER, ACT_INTERACT, ACT_PAUSE, ACT_RADIO, ACT_RELOAD, ACT_WEAPON,
  createInput,
} from './input.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261118;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rand = createRandom(seed);
const city = createCity(rand);
const ent = createEntities(rand, city);
const missions = createMissions(ent);
const audio = createAudio();
const renderer = createRenderer(canvas);

// ---- view model the renderer reads ---------------------------------------
const view = {
  player: ent.player, cars: ent.cars, peds: ent.peds, cops: ent.cops,
  bullets: ent.bullets, particles: ent.particles, pickups: ent.pickups,
  heli: ent.heli, elapsed: 0, time: 17.4, wanted: 0, district: 'MARINA',
  missionsDone: 0, missionMarker: null,
};

function syncView() {
  view.elapsed = ent.state.elapsed;
  view.time = ent.state.time;
  view.wanted = ent.state.wanted;
  view.district = city.districtAt(ent.player.x, ent.player.y);
  view.missionsDone = ent.state.missionsDone;
  view.missionMarker = missions.state.marker;
}

// ---- game object used by the screenshot stager ---------------------------
const G = {
  city, ent, missions,
  reset() { ent.reset(); missions.state.active = false; missions.state.index = 0; missions.state.stage = 0; missions.state.done = false; missions.state.allDone = false; missions.state.dialogue = []; missions.state.marker = null; },
  setTime(h) { ent.state.time = h; },
  teleport(x, y) { ent.player.x = x; ent.player.y = y; if (ent.player.inCar) { ent.player.inCar.x = x; ent.player.inCar.y = y; } },
  giveCar(modelIdx, angle) {
    const model = CAR_MODELS[modelIdx];
    const car = { x: ent.player.x, y: ent.player.y, angle: angle === undefined ? Math.PI / 2 : angle, speed: 200, model, traffic: false, parked: false, health: 100, driver: false, color: model.color, len: model.len, wid: model.wid, top: model.top, accel: model.accel, grip: model.grip };
    ent.cars.push(car);
    ent.player.inCar = car;
  },
  step(dt, move, aim, firing) {
    const fakeInput = { move: () => move, mouse: () => ({ x: 0, y: 0, down: firing, clicked: false }), takeActions: () => 0 };
    ent.step(dt, fakeInput, missions);
    missions.step(dt, ent.player, !!ent.player.inCar);
    syncView();
  },
};

// ---- save / load ----------------------------------------------------------
function saveGame() {
  try {
    const p = ent.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      x: p.x, y: p.y, money: p.money, health: p.health, armor: p.armor,
      wanted: ent.state.wanted, missionsDone: ent.state.missionsDone,
      completed: missions.state.completedIds, next: missions.state.index,
      time: ent.state.time, weapon: p.weapon, ammo: p.ammo, owned: p.owned,
    }));
  } catch { /* storage off: the save lasts this visit only */ }
}
function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    ent.player.x = s.x; ent.player.y = s.y; ent.player.money = s.money;
    ent.player.health = s.health; ent.player.armor = s.armor;
    ent.state.wanted = s.wanted || 0;
    ent.state.missionsDone = s.missionsDone || 0;
    missions.state.completedIds = s.completed || [];
    missions.state.index = s.next || 0;
    ent.state.time = s.time || 17.4;
    ent.player.weapon = s.weapon || 'pistol';
    ent.player.ammo = s.ammo || ent.player.ammo;
    ent.player.owned = s.owned || ent.player.owned;
    return true;
  } catch { return false; }
}

// Debug/test hook (also handy for the finalist review): live state and helpers.
// Nothing here touches the network or the filesystem.
window.__solmar = {
  ent, missions, city, audio, G, saveGame, loadGame,
  player: () => ent.player,
  state: () => ({ wanted: ent.state.wanted, money: ent.player.money, missionsDone: ent.state.missionsDone, health: ent.player.health, time: ent.state.time }),
  screen: () => 'title',
};
function runShot(name) {
  const scene = stageShot(name, G);
  syncView();
  let painted = 0;
  function paint() {
    renderer.draw(view, scene.screen, ui());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function ui() {
  return {
    city, radio: audio.stationName(), muted: audio.isMuted(),
    objective: missions.objectiveText(),
    banner: missions.state.banner, bannerAge: missions.state.bannerAt,
    dialogue: missions.state.dialogue, dialogueAt: missions.state.dialogueAt,
    prompt: promptText(), shop: shopState,
  };
}

let shopState = null;
let shopCooldown = 0;

function promptText() {
  const p = ent.player;
  if (p.inCar) return '';
  const car = ent.nearestCar(p.x, p.y, 70);
  if (car) return car.driver ? 'Press E to steal this car  (wanted +1)' : 'Press E to get in the ' + car.model.name;
  for (const s of city.shops) {
    if (dist2(p.x, p.y, s.x, s.y) < 80 * 80) return 'Press F — ' + s.name;
  }
  if (!missions.state.active && dist2(p.x, p.y, missions.startPoint.x, missions.startPoint.y) < 90 * 90) {
    return missions.state.allDone ? 'All missions complete — free roam!' : 'Press F to start mission: ' + (missions.current() ? missions.current().title : '');
  }
  if (missions.state.done && !missions.state.active) return 'Press F near ROSA GARAGE for the next mission';
  return '';
}

function openShop(shop) {
  const p = ent.player;
  if (shop.kind === 'guns') {
    shopState = {
      name: shop.name, prompt: 'Press 1 P9 $250 · 2 VK-9 $900 · 3 Sweeper $1,400 · F ammo $40 · SPACE close',
      lines: [shop.blurb, 'You hold ' + (p.owned.smg ? 'VK-9 ✓ ' : '') + (p.owned.shotgun ? 'Sweeper ✓ ' : '') + 'P9 ✓', 'Money: $' + Math.floor(p.money)],
    };
  } else if (shop.kind === 'food') {
    shopState = { name: shop.name, prompt: 'Press F to eat — $25, +50 health · SPACE close', lines: [shop.blurb, 'Health: ' + Math.floor(p.health) + '/100'] };
  } else if (shop.kind === 'clothes') {
    shopState = { name: shop.name, prompt: 'Press F to buy a fresh fit — $120, armor +25 · SPACE close', lines: [shop.blurb, 'Armor: ' + Math.floor(p.armor) + '/100'] };
  } else {
    shopState = { name: shop.name, prompt: 'Press F to repair your car — free · SPACE close', lines: [shop.blurb, 'Mama Rosa keeps your ride alive.'] };
  }
  audio.click();
}

function shopAction(key) {
  const p = ent.player;
  const shop = shopState;
  if (!shop) return;
  if (shop.name === 'IRONWORKS GUNS') {
    const buy = (id, price) => {
      if (p.owned[id]) { p.ammo[id] += id === 'pistol' ? 12 : 32; p.money -= WEAPONS[id].ammoPrice; audio.pickup(); }
      else if (p.money >= price) { p.money -= price; p.owned[id] = true; p.ammo[id] = WEAPONS[id].mag; p.weapon = id; audio.missionPass(); }
    };
    if (key === '1') buy('pistol', 250);
    else if (key === '2') buy('smg', 900);
    else if (key === '3') buy('shotgun', 1400);
    else if (key === 'F' && p.money >= 40) { p.money -= 40; p.ammo[p.weapon] = (p.ammo[p.weapon] || 0) + 24; audio.pickup(); }
  } else if (shop.name === 'TICO TACOS') {
    if (key === 'F' && p.money >= 25) { p.money -= 25; p.health = Math.min(100, p.health + 50); audio.pickup(); }
  } else if (shop.name === 'NEON THREADS') {
    if (key === 'F' && p.money >= 120) { p.money -= 120; p.armor = Math.min(100, p.armor + 25); audio.pickup(); }
  } else if (shop.name === 'ROSA GARAGE') {
    if (key === 'F' && p.inCar) { p.inCar.health = 100; audio.pickup(); }
  }
  openShop(city.shops.find((s) => s.name === shop.name));
}

// ---- live game ------------------------------------------------------------
function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  window.__solmar.screen = () => screen;
  let accumulator = 0;
  let last = performance.now();
  let fpsFrames = 0, fpsTime = 0, fpsMs = 0;
  const hadSave = loadGame();

  function announce(message) { status.textContent = message; }

  function startGame() {
    audio.startMusic();
    missions.state.dialogue = []; missions.state.dialogueAt = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Solmar Bay.');
  }

  function endGame(kind) {
    screen = kind;
    missions.state.dialogue = []; missions.state.dialogueAt = 0;
    saveGame();
    announce(kind === SCREEN_OVER ? 'Wasted.' : 'Busted.');
  }

  function handleActions() {
    const actions = input.takeActions();
    const mouse = input.mouse();
    // Pause works from anywhere in play, even with a shop or dialogue open.
    if (actions & ACT_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACT_CONFIRM) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    if (shopState) {
      if (actions & ACT_CONFIRM) { shopState = null; return; }
      if (actions & ACT_INTERACT) shopAction('F');
      if (actions & ACT_WEAPON) {
        const code = window.__lastDigit;
        if (code) shopAction(code);
      }
      return;
    }
    if (missions.state.dialogue.length > 0 && (actions & ACT_CONFIRM)) {
      missions.state.dialogueAt += 1;
      if (missions.state.dialogueAt >= missions.state.dialogue.length) {
        missions.state.dialogue = []; missions.state.dialogueAt = 0;
        if (missions.state.done && !missions.state.active && !missions.state.allDone) missions.nextMission();
      }
      return;
    }
    if (actions & ACT_RADIO && screen === SCREEN_PLAY) {
      audio.nextStation();
      announce('Radio: ' + audio.stationName());
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_BUSTED || screen === SCREEN_WIN) {
      if (actions & ACT_CONFIRM || mouse.clicked) startGame();
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACT_ENTER) {
      const p = ent.player;
      if (p.inCar) { ent.exitCar(); audio.click(); }
      else {
        const car = ent.nearestCar(p.x, p.y, 70);
        if (car) {
          const ev = ent.enterCar(car);
          if (ev === 16) announce('Car stolen! Wanted level up.');
          audio.engineStart(0);
        }
      }
    }
    if (actions & ACT_INTERACT) {
      const p = ent.player;
      if (!p.inCar) {
        for (const s of city.shops) {
          if (dist2(p.x, p.y, s.x, s.y) < 80 * 80) { openShop(s); return; }
        }
        if (!missions.state.active && dist2(p.x, p.y, missions.startPoint.x, missions.startPoint.y) < 110 * 110) {
          missions.start(missions.state.index);
          audio.missionPass();
        } else if (missions.state.done && !missions.state.active && !missions.state.allDone) {
          missions.nextMission();
        }
      }
    }
    if (actions & ACT_RELOAD) {
      const p = ent.player;
      if (p.weapon !== 'fists') {
        // Reload from reserve: simple — refill the magazine from pocket ammo is free here.
        p.ammo[p.weapon] = Math.max(p.ammo[p.weapon], WEAPONS[p.weapon].mag);
        audio.click();
      }
    }
    if (actions & ACT_WEAPON) {
      const p = ent.player;
      const order = ['fists', 'pistol', 'smg', 'shotgun'];
      const owned = order.filter((w) => w === 'fists' || p.owned[w]);
      const idx = owned.indexOf(p.weapon);
      p.weapon = owned[(idx + 1) % owned.length];
      audio.click();
    }
  }

  // Track number keys for the gun shop (digit pressed).
  window.addEventListener('keydown', (event) => {
    if (event.code && event.code.startsWith('Digit')) window.__lastDigit = event.code.slice(5);
  });

  function step() {
    if (screen === SCREEN_TITLE) {
      // Living backdrop: traffic and peds move behind the title.
      const fake = { move: () => ({ x: 0, y: 0, run: false }), mouse: () => ({ x: 0, y: 0, down: false, clicked: false }), takeActions: () => 0 };
      ent.step(STEP, fake, missions);
      syncView();
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const mouse = input.mouse();
    // Aim: mouse position mapped back into world coordinates.
    const scaleCss = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const offX = (window.innerWidth - 1280 * scaleCss) / 2;
    const offY = (window.innerHeight - 720 * scaleCss) / 2;
    const camX = clamp(ent.player.x - 1280 / ZOOM / 2, 0, 3600 - 1280 / ZOOM);
    const camY = clamp(ent.player.y - 720 / ZOOM / 2, 0, 2600 - 720 / ZOOM);
    const aimInput = Object.assign(Object.create(Object.getPrototypeOf(input)), input, {
      aimAngle: () => Math.atan2((mouse.y - offY) / scaleCss / ZOOM + camY - ent.player.y, (mouse.x - offX) / scaleCss / ZOOM + camX - ent.player.x),
    });
    const events = ent.step(STEP, aimInput, missions);
    missions.step(STEP, ent.player, !!ent.player.inCar);
    if (missions.state.done && !missions.state.active && missions.state.allDone && screen === SCREEN_PLAY) {
      // Let the outro dialogue play first; win screen comes on confirm.
    }
    if (events & EVT_WASTED) endGame(SCREEN_OVER);
    else if (events & EVT_BUSTED) endGame(SCREEN_BUSTED);
    if (ent.player.inCar) audio.engineStart(clamp(Math.abs(ent.player.inCar.speed) / 560, 0, 1));
    else audio.engineStop();
    if (shopCooldown > 0) shopCooldown -= STEP;
    syncView();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    fpsFrames += 1; fpsTime += dt;
    if (fpsTime >= 1) { fpsMs = (fpsTime / fpsFrames) * 1000; window.__fpsMs = fpsMs; fpsFrames = 0; fpsTime = 0; }
    accumulator += dt;
    handleActions();
    input.clearClick();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(view, screen, ui());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  announce(hadSave ? 'Solmar Bay. Save loaded. Press Space to continue.' : 'Solmar Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
