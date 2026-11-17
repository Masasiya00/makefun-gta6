// Drawing only: the world state and the current screen in, pixels out.
// Camera follows the player; the HUD, circular minimap, dialogue and menus are
// drawn on top. Day/sunset/night lighting comes from the in-game clock.
import { DISTRICTS, FONT, PALETTE, WANTED, WORLD, ZOOM } from './config.js';
import { clamp, fmtMoney } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WIN = 'win';

const VIEW_W = 1280, VIEW_H = 720;
const VW = VIEW_W / ZOOM, VH = VIEW_H / ZOOM;

function skyColor(time) {
  // time is hours 0-24. Golden hour ~17-19, night 20-6, day otherwise.
  if (time >= 20 || time < 6) return { sky: '#0d1530', light: 0.42, sun: 0 };
  if (time >= 16.5 && time < 19.5) {
    const k = 1 - Math.abs(time - 18) / 1.5;
    return { sky: '#ff9a5c', light: 0.85, sun: k };
  }
  if (time >= 6 && time < 8) return { sky: '#ffb37a', light: 0.8, sun: 0.5 };
  return { sky: '#7ec8e3', light: 1, sun: 0 };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const cam = { x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    view.x = (canvas.width - VIEW_W * view.scale) / 2;
    view.y = (canvas.height - VIEW_H * view.scale) / 2;
  }
  function font(size, bold) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, (bold ? '700 ' : '') + size + 'px ' + FONT);
    return fonts.get(key);
  }
  function text(value, x, y, size, color, align, bold) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = 'rgba(8,12,24,' + (alpha || 0.72) + ')';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawCity(state, city, light) {
    const s = state;
    // Ocean + beach on the west edge.
    ctx.fillStyle = PALETTE.oceanDeep;
    ctx.fillRect(cam.x - 40, cam.y - 40, WORLD.beachX + 40, VH + 80);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(cam.x - 40, cam.y - 40, WORLD.beachX - 60, VH + 80);
    // Waves.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const wy = cam.y + ((i * 173 + s.elapsed * 22) % (VH + 120)) - 60;
      ctx.beginPath();
      ctx.moveTo(cam.x - 30, wy);
      ctx.quadraticCurveTo(cam.x + 60, wy + 12, cam.x + 150, wy);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(WORLD.beachX - 60, cam.y - 40, 60, VH + 80);
    ctx.fillStyle = PALETTE.sandWet;
    ctx.fillRect(WORLD.beachX - 60, cam.y - 40, 14, VH + 80);
    // Ground.
    ctx.fillStyle = '#6f7d5a';
    ctx.fillRect(Math.max(cam.x - 40, WORLD.beachX), cam.y - 40, VW + 80, VH + 80);
    // Parks.
    ctx.fillStyle = PALETTE.park;
    for (const p of city.parks) ctx.fillRect(p.x, p.y, p.w, p.h);
    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const rx of city.roadsV) ctx.fillRect(rx - 42, cam.y - 40, 84, VH + 80);
    for (const ry of city.roadsH) ctx.fillRect(cam.x - 40, ry - 42, VW + 80, 84);
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const rx of city.roadsV) {
      for (let y = Math.floor((cam.y - 40) / 56) * 56; y < cam.y + VH + 40; y += 56) ctx.fillRect(rx - 2, y, 4, 28);
    }
    for (const ry of city.roadsH) {
      for (let x = Math.floor((cam.x - 40) / 56) * 56; x < cam.x + VW + 40; x += 56) ctx.fillRect(x, ry - 2, 28, 4);
    }
    // Sidewalk edges.
    ctx.strokeStyle = PALETTE.roadEdge;
    ctx.lineWidth = 3;
    for (const rx of city.roadsV) { ctx.beginPath(); ctx.moveTo(rx - 42, cam.y - 40); ctx.lineTo(rx - 42, cam.y + VH + 40); ctx.moveTo(rx + 42, cam.y - 40); ctx.lineTo(rx + 42, cam.y + VH + 40); ctx.stroke(); }
    // Buildings.
    for (const b of city.buildings) {
      if (b.x > cam.x + VW + 60 || b.x + b.w < cam.x - 60 || b.y > cam.y + VH + 60 || b.y + b.h < cam.y - 60) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      const cols = Math.max(1, Math.floor(b.w / 26)), rows = Math.max(1, Math.floor(b.h / 30));
      for (let c = 0; c < cols; c += 1) for (let r = 0; r < rows; r += 1) {
        if ((c * 7 + r * 13 + b.height) % 3 !== 0) continue;
        ctx.fillRect(b.x + 8 + c * 26, b.y + 8 + r * 30, 12, 14);
      }
      if (b.neon) {
        ctx.fillStyle = light < 0.7 ? PALETTE.neonPink : '#ff8fe0';
        ctx.fillRect(b.x, b.y - 4, b.w, 4);
      }
    }
    // Palms.
    for (const p of city.palms) {
      if (p.x < cam.x - 40 || p.x > cam.x + VW + 40 || p.y < cam.y - 40 || p.y > cam.y + VH + 40) continue;
      ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 16); ctx.stroke();
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath(); ctx.arc(p.x + 3, p.y - 18, 9, 0, Math.PI * 2); ctx.fill();
    }
    // Shops.
    for (const shop of city.shops) {
      ctx.fillStyle = '#222a3a';
      ctx.fillRect(shop.x - 46, shop.y - 26, 92, 52);
      ctx.fillStyle = shop.kind === 'guns' ? '#ff5a5a' : shop.kind === 'food' ? '#ffc93c' : shop.kind === 'clothes' ? '#ff4fd8' : '#29e6ff';
      ctx.fillRect(shop.x - 46, shop.y - 26, 92, 8);
      text(shop.name, shop.x, shop.y - 32, 13, '#ffffff', 'center', true);
    }
    // District labels.
    ctx.font = font(15, true);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
      if (cx < cam.x - 100 || cx > cam.x + VW + 100 || cy < cam.y - 100 || cy > cam.y + VH + 100) continue;
      ctx.fillText(d.name, cx, cy);
    }
  }

  function drawCarShape(x, y, angle, len, wid, color, opts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.85)';
    ctx.fillRect(len * 0.08, -wid / 2 + 4, len * 0.22, wid - 8);
    ctx.fillStyle = 'rgba(255,255,220,0.9)';
    ctx.fillRect(len / 2 - 4, -wid / 2 + 3, 3, 6);
    ctx.fillRect(len / 2 - 4, wid / 2 - 9, 3, 6);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-len / 2 + 1, -wid / 2 + 3, 3, 6);
    ctx.fillRect(-len / 2 + 1, wid / 2 - 9, 3, 6);
    if (opts && opts.taxi) {
      ctx.fillStyle = '#111';
      ctx.fillRect(-6, -wid / 2 + 2, 12, 8);
      text('TAXI', 0, -wid / 2 - 6, 9, '#111', 'center', true);
    }
    if (opts && opts.cop) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-len * 0.18, -wid / 2 + 3, len * 0.36, wid - 6);
      const flash = Math.floor((opts.siren || 0) * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f6df6';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawEntities(state, city, light) {
    const s = state;
    // Pickups.
    for (const pk of s.pickups) {
      if (pk.taken) continue;
      const bob = Math.sin(s.elapsed * 3 + pk.bob) * 3;
      ctx.fillStyle = pk.kind === 'cash' ? PALETTE.money : '#ff6b81';
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 10, 0, Math.PI * 2); ctx.fill();
      text(pk.kind === 'cash' ? '$' : '+', pk.x, pk.y + bob + 5, 14, '#0b1020', 'center', true);
    }
    // Mission marker.
    if (s.missionMarker) {
      const m = s.missionMarker;
      const pulse = 1 + Math.sin(s.elapsed * 4) * 0.15;
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.radius * 0.4 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(m.x, m.y - 46); ctx.lineTo(m.x - 10, m.y - 22); ctx.lineTo(m.x + 10, m.y - 22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2); ctx.stroke();
    }
    // Peds.
    for (const ped of s.peds) {
      if (!ped.alive) continue;
      const bob = ped.panic > 0 ? 0 : Math.sin(ped.walkPhase) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(ped.x, ped.y + 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.arc(ped.x, ped.y + bob, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3 + bob - 2, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Traffic + parked cars.
    for (const car of s.cars) {
      drawCarShape(car.x, car.y, car.angle, car.len, car.wid, car.color, { taxi: car.model.name === 'Island Taxi' });
    }
    // Cops.
    for (const cop of s.cops) drawCarShape(cop.x, cop.y, cop.angle, cop.len, cop.wid, '#2f6df6', { cop: true, siren: cop.siren });
    // Heli.
    if (s.heli.active) {
      const hx = s.heli.x, hy = s.heli.y;
      ctx.fillStyle = 'rgba(255,255,200,0.10)';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(s.player.x - 40, s.player.y - 40); ctx.lineTo(s.player.x + 40, s.player.y + 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1c2733';
      ctx.beginPath(); ctx.ellipse(hx, hy, 26, 12, s.elapsed * 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 30, hy); ctx.lineTo(hx + 30, hy); ctx.stroke();
    }
    // Bullets.
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
    for (const b of s.bullets) {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); ctx.stroke();
    }
    // Particles.
    for (const p of s.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Player.
    const pl = s.player;
    if (!pl.inCar) {
      if (pl.hurtFlash <= 0 || Math.floor(pl.hurtFlash * 12) % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(pl.x, pl.y + 9, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(pl.angle);
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f2c9a0';
        ctx.beginPath(); ctx.arc(5, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.fillRect(8, -3, 10, 3); ctx.fillRect(8, 1, 10, 2);
        ctx.restore();
        // Aim line when armed.
        if (pl.weapon !== 'fists') {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pl.x + Math.cos(pl.angle) * 60, pl.y + Math.sin(pl.angle) * 60); ctx.stroke();
        }
      }
    } else {
      drawCarShape(pl.inCar.x, pl.inCar.y, pl.inCar.angle, pl.inCar.len, pl.inCar.wid, pl.inCar.color, { taxi: pl.inCar.model.name === 'Island Taxi' });
      // Player outline on their car.
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pl.inCar.x, pl.inCar.y, 34, 0, Math.PI * 2); ctx.stroke();
    }
    // Night / sunset tint.
    if (light < 1) {
      ctx.fillStyle = 'rgba(8,10,40,' + ((1 - light) * 0.55).toFixed(2) + ')';
      ctx.fillRect(cam.x - 40, cam.y - 40, VW + 80, VH + 80);
    }
    if (light < 0.7) {
      // Headlight cones at night.
      for (const car of s.cars) {
        if (!car.traffic && !car.driver) continue;
        ctx.fillStyle = 'rgba(255,255,190,0.12)';
        ctx.beginPath();
        ctx.moveTo(car.x, car.y);
        ctx.lineTo(car.x + Math.cos(car.angle - 0.25) * 170, car.y + Math.sin(car.angle - 0.25) * 170);
        ctx.lineTo(car.x + Math.cos(car.angle + 0.25) * 170, car.y + Math.sin(car.angle + 0.25) * 170);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  function drawMinimap(state, city) {
    const cx = VIEW_W - 118, cy = 182, r = 92;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const scale = (r * 2) / 1500;
    const px = state.player.x, py = state.player.y;
    ctx.fillStyle = '#22303f';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#1d7fa8';
    ctx.fillRect(cx - r, cy - r, (WORLD.beachX - (px - 750)) * scale, r * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    for (const rx of city.roadsV) {
      const x = cx + (rx - px) * scale;
      ctx.beginPath(); ctx.moveTo(x, cy - r); ctx.lineTo(x, cy + r); ctx.stroke();
    }
    for (const ry of city.roadsH) {
      const y = cy + (ry - py) * scale;
      ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); ctx.stroke();
    }
    if (state.missionMarker) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(cx + (state.missionMarker.x - px) * scale, cy + (state.missionMarker.y - py) * scale, 6, 0, Math.PI * 2); ctx.fill();
    }
    for (const cop of state.cops) {
      ctx.fillStyle = '#2f6df6';
      ctx.beginPath(); ctx.arc(cx + (cop.x - px) * scale, cy + (cop.y - py) * scale, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // North tick.
    text('N', cx, cy - r - 8, 13, '#fff', 'center', true);
  }

  function drawHud(state, ui) {
    const s = state, pl = s.player;
    // Top-left: money + district + clock.
    panel(16, 14, 250, 74);
    text(fmtMoney(pl.money), 30, 44, 26, PALETTE.money, 'left', true);
    text(s.district, 30, 68, 14, PALETTE.text, 'left', true);
    const hh = Math.floor(s.time), mm = Math.floor((s.time - hh) * 60);
    text(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), 252, 44, 20, PALETTE.text, 'right', true);
    text(s.time >= 20 || s.time < 6 ? 'NIGHT' : s.time >= 16.5 ? 'SUNSET' : 'DAY', 252, 68, 12, PALETTE.muted, 'right');
    // Top-right: wanted stars.
    panel(VIEW_W - 266, 14, 250, 46);
    text('WANTED', VIEW_W - 252, 44, 15, PALETTE.text, 'left', true);
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < s.wanted ? '#ffd166' : 'rgba(255,255,255,0.18)';
      const sx = VIEW_W - 150 + i * 24, sy = 32;
      ctx.beginPath();
      for (let k = 0; k < 5; k += 1) {
        const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
        const a2 = a + Math.PI / 5;
        ctx.lineTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10);
        ctx.lineTo(sx + Math.cos(a2) * 4.5, sy + Math.sin(a2) * 4.5);
      }
      ctx.closePath(); ctx.fill();
    }
    // Bottom-left: health / armor.
    panel(16, VIEW_H - 92, 250, 78);
    text('HEALTH', 30, VIEW_H - 62, 13, PALETTE.text, 'left', true);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(96, VIEW_H - 74, 150, 12);
    ctx.fillStyle = pl.health > 30 ? '#2ecc71' : '#ff5a5a';
    ctx.fillRect(96, VIEW_H - 74, 150 * clamp(pl.health / 100, 0, 1), 12);
    text('ARMOR', 30, VIEW_H - 36, 13, PALETTE.text, 'left', true);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(96, VIEW_H - 48, 150, 12);
    ctx.fillStyle = '#4fa8c9';
    ctx.fillRect(96, VIEW_H - 48, 150 * clamp(pl.armor / 100, 0, 1), 12);
    // Bottom-right: weapon / ammo / speed.
    panel(VIEW_W - 266, VIEW_H - 92, 250, 78);
    const wname = pl.weapon === 'fists' ? 'FISTS' : { pistol: 'P9 PISTOL', smg: 'VK-9 SMG', shotgun: 'STREET SWEEPER' }[pl.weapon];
    text(wname, VIEW_W - 252, VIEW_H - 62, 17, PALETTE.text, 'left', true);
    const ammo = pl.weapon === 'fists' ? '∞' : String(pl.ammo[pl.weapon]);
    text('AMMO ' + ammo, VIEW_W - 252, VIEW_H - 36, 14, PALETTE.muted, 'left');
    if (pl.inCar) {
      const kmh = Math.round(Math.abs(pl.inCar.speed) * 0.45);
      text(kmh + ' km/h', VIEW_W - 30, VIEW_H - 62, 22, PALETTE.text, 'right', true);
      text(pl.inCar.model.name.toUpperCase(), VIEW_W - 30, VIEW_H - 36, 12, PALETTE.muted, 'right');
    } else {
      text('ON FOOT', VIEW_W - 30, VIEW_H - 62, 16, PALETTE.text, 'right', true);
      text(pl.inCar ? '' : 'E near a car to drive', VIEW_W - 30, VIEW_H - 36, 12, PALETTE.muted, 'right');
    }
    // Mission tracker (top centre).
    if (ui.objective) {
      const w = Math.min(640, ctx.measureText(ui.objective).width + 60);
      panel((VIEW_W - 640) / 2, 14, 640, 46);
      text('◆ ' + ui.objective, VIEW_W / 2, 44, 15, '#ffd166', 'center', true);
    }
    // Radio strip (bottom centre).
    panel((VIEW_W - 460) / 2, VIEW_H - 40, 460, 28);
    text('♪ ' + ui.radio + (ui.muted ? '  (muted)' : ''), VIEW_W / 2, VIEW_H - 20, 13, '#ffd166', 'center');
    // Banner.
    if (ui.banner && ui.bannerAge < 3.5) {
      ctx.globalAlpha = clamp(3.5 - ui.bannerAge, 0, 1);
      text(ui.banner, VIEW_W / 2, 150, 30, '#ffd166', 'center', true);
      ctx.globalAlpha = 1;
    }
    // Context prompt.
    if (ui.prompt) {
      panel((VIEW_W - 420) / 2, VIEW_H - 150, 420, 34);
      text(ui.prompt, VIEW_W / 2, VIEW_H - 127, 15, PALETTE.text, 'center', true);
    }
    // Damage vignette.
    if (pl.hurtFlash > 0) {
      ctx.fillStyle = 'rgba(255,30,30,' + (pl.hurtFlash * 0.5).toFixed(2) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    drawMinimap(state, ui.city);
  }

  function drawDialogue(lines, at) {
    if (!lines || lines.length === 0) return;
    const line = lines[Math.min(at, lines.length - 1)];
    panel(140, VIEW_H - 190, VIEW_W - 280, 86);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(140, VIEW_H - 190, 6, 86);
    text(line, 168, VIEW_H - 158, 17, PALETTE.text, 'left');
    text('SPACE — continue', VIEW_W - 168, VIEW_H - 118, 12, PALETTE.muted, 'right');
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 680;
    const h = 150 + lines.length * 30;
    const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
    panel(x, y, w, h, 0.88);
    text(title, VIEW_W / 2, y + 62, 44, accent || '#ffd166', 'center', true);
    lines.forEach((ln, i) => text(ln, VIEW_W / 2, y + 108 + i * 30, 17, PALETTE.muted, 'center'));
    text(prompt, VIEW_W / 2, y + h - 26, 17, PALETTE.text, 'center', true);
  }

  function worldTransform() {
    ctx.setTransform(view.scale * ZOOM, 0, 0, view.scale * ZOOM, view.x - cam.x * view.scale * ZOOM, view.y - cam.y * view.scale * ZOOM);
  }
  function screenTransform() {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  }
  function centreCamera(state) {
    cam.x = clamp(state.player.x - VW / 2, 0, WORLD.width - VW);
    cam.y = clamp(state.player.y - VH / 2, 0, WORLD.height - VH);
  }

  function drawTitle(state, ui) {
    // Sunset backdrop: the city at golden hour with traffic.
    centreCamera(state);
    worldTransform();
    drawCity(state, ui.city, 0.85);
    drawEntities(state, ui.city, 0.85);
    screenTransform();
    ctx.fillStyle = 'rgba(10,8,30,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('SOLMAR BAY', VIEW_W / 2, 190, 84, '#ffd166', 'center', true);
    text('A N   O P E N - W O R L D   C R I M E   S T O R Y', VIEW_W / 2, 232, 18, '#ffffff', 'center');
    panel((VIEW_W - 560) / 2, 300, 560, 150, 0.8);
    text('Dario Cruz is back in town. Steal cars, take missions,', VIEW_W / 2, 336, 16, PALETTE.text, 'center');
    text('outrun Chief Duarte, and own the sun-soaked coast.', VIEW_W / 2, 362, 16, PALETTE.text, 'center');
    text('WASD move / drive · Mouse aim · Click shoot · E enter car', VIEW_W / 2, 396, 14, PALETTE.muted, 'center');
    text('F interact · Q radio · R reload · 1-4 weapons · P pause', VIEW_W / 2, 420, 14, PALETTE.muted, 'center');
    text('PRESS SPACE OR CLICK TO START', VIEW_W / 2, 520, 22, '#ffd166', 'center', true);
    text('An original game. No assets, names or music from any commercial game.', VIEW_W / 2, 690, 12, 'rgba(255,255,255,0.6)', 'center');
  }

  function draw(state, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sky = skyColor(state.time);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    centreCamera(state);
    worldTransform();
    drawCity(state, ui.city, sky.light);
    drawEntities(state, ui.city, sky.light);
    screenTransform();
    // Sunset wash over the whole frame.
    if (sky.sun > 0) {
      ctx.fillStyle = 'rgba(255,140,60,' + (sky.sun * 0.10).toFixed(2) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    drawHud(state, ui);
    if (ui.dialogue && ui.dialogue.length > 0) drawDialogue(ui.dialogue, ui.dialogueAt);
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(5,8,18,0.6)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawPanel('PAUSED', ['The city waits for no one — except right now.', 'Missions: ' + state.missionsDone + ' complete · ' + fmtMoney(state.player.money) + ' in pocket'], 'Press P or SPACE to resume', '#ffffff');
    } else if (screen === SCREEN_OVER) {
      ctx.fillStyle = 'rgba(20,4,4,0.65)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawPanel('WASTED', ['Dario went down in ' + state.district + '.', 'Missions complete: ' + state.missionsDone + ' · ' + fmtMoney(state.player.money) + ' earned'], 'Press SPACE to try again', '#ff5a5a');
    } else if (screen === SCREEN_BUSTED) {
      ctx.fillStyle = 'rgba(4,8,30,0.65)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawPanel('BUSTED', ['Chief Duarte books you at the station. $100 bail.', 'Missions complete: ' + state.missionsDone], 'Press SPACE to walk free', '#4fa8c9');
    } else if (screen === SCREEN_WIN) {
      ctx.fillStyle = 'rgba(8,20,8,0.6)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawPanel('SOLMAR BAY IS YOURS', ['All six missions complete. The Big Score is done.', 'The sun rises over a city that finally belongs to Dario Cruz.'], 'Press SPACE to keep roaming free', '#7ee787');
    }
    if (ui.shop) {
      panel((VIEW_W - 520) / 2, 200, 520, 220, 0.92);
      text(ui.shop.name, VIEW_W / 2, 240, 26, '#ffd166', 'center', true);
      ui.shop.lines.forEach((ln, i) => text(ln, VIEW_W / 2, 278 + i * 28, 16, PALETTE.text, 'center'));
      text(ui.shop.prompt, VIEW_W / 2, 392, 15, PALETTE.muted, 'center');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
