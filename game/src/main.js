// Cinderworks — boot, loop, shooting, bomb, wiring. One fixed 60 Hz sim;
// render at display rate. Owns the game state machine and glues the modules.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createEconomy } from './economy.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { PALETTE } from './palette.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot'); // start | play | bomb | end | buy | null
const shotSeed = Number(params.get('seed') || 7);

// --- Boot ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world);
const weapons = createWeapons(camera);
const economy = createEconomy();
const hud = createHud();
const audio = createAudio();
const input = createInput();

const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

// Bot names for the kill feed.
let emberIdx = 0, wardenIdx = 0;

// Bomb ownership (rounds.js owns the round timer; this owns the carrier).
const bomb = { state: 'none', carrier: null, site: null, pos: new THREE.Vector3() };
let plantProgress = 0, defuseProgress = 0;

// Bomb visual: a small dark box with a blinking light.
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.25),
  new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 }));
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xff2020 }));
bombLight.position.set(0, 0.14, 0);
bombMesh.add(bombBody, bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// Tracers: a pool of fading lines.
const tracers = [];
for (let i = 0; i < 10; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push(line);
}
let tracerIdx = 0;
function addTracer(from, to) {
  const line = tracers[tracerIdx++ % tracers.length];
  line.geometry.setFromPoints([from, to]);
  line.material.opacity = 0.85;
}

// Explosion effects.
const effects = [];
function addExplosion(pos) {
  const light = new THREE.PointLight(0xffa040, 6, 14);
  light.position.copy(pos).y += 0.5;
  scene.add(light);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 32),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(pos).y = 0.05;
  scene.add(ring);
  effects.push({ light, ring, t: 0 });
  audio.explode();
}

// --- Events ---
function botName(b) { return b.name || (b.team === 'ember' ? 'Ember' : 'Warden'); }
function damagePlayer(amount, attacker, isHead) {
  if (!player.state.alive) return;
  const p = player.state;
  let dmg = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, dmg * 0.5);
    p.armor -= absorbed;
    dmg -= absorbed;
  }
  p.health -= dmg;
  audio.hurt();
  if (attacker) {
    const dx = attacker.pos.x - p.pos.x;
    const dz = attacker.pos.z - p.pos.z;
    const worldAngle = Math.atan2(dx, dz);
    const rel = worldAngle - p.yaw;
    hud.damageFrom((rel * 180) / Math.PI);
  }
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
    hud.banner('YOU ARE DOWN — SPECTATING', 3000);
    hud.killfeed(`${attacker ? botName(attacker) : 'Warden'} ✕ You`);
  }
}

const bots = createBots(scene, world, {
  onShoot(bot, from, to) {
    addTracer(from, to);
    const d = from.distanceTo(player.state.pos);
    if (d < 25) audio.shoot('vk47');
  },
  onDamage(victim, amount, attacker, isHead) {
    if (victim === 'player') damagePlayer(amount, attacker, isHead);
  },
  onKill(victim, attacker) {
    const vName = victim === 'player' ? 'You' : botName(victim);
    const aName = attacker === 'player' ? 'You' : botName(attacker);
    hud.killfeed(`${aName} ✕ ${vName}`);
    if (attacker === 'player') { economy.onKill(); audio.kill(); }
    if (victim === 'player') audio.roundLose();
  },
  onPlant(site) {
    bomb.state = 'planted';
    bomb.site = site;
    bomb.pos.copy(world.sites[site].center);
    bombMesh.position.copy(bomb.pos);
    bombMesh.visible = true;
    bots.setBombState('planted', site, bomb.pos);
    hud.banner(`BOMB PLANTED — SITE ${site}`, 3000);
    audio.plant();
  },
  onDefuse() {
    bomb.state = 'defused';
    bombMesh.visible = false;
    audio.defuse();
  },
  onBombDropped(pos) {
    bomb.state = 'dropped';
    bomb.carrier = null;
    bomb.pos.copy(pos);
    bombMesh.position.copy(pos);
    bombMesh.visible = true;
    hud.banner('BOMB DROPPED', 2000);
  },
  onBombPickup(bot) {
    bomb.state = 'carried';
    bomb.carrier = bot;
    bombMesh.visible = false;
    hud.killfeed(`${botName(bot)} picked up the bomb`);
  },
});
bots.bots.forEach((b) => {
  b.name = b.team === 'ember' ? `Ember-${++emberIdx}` : `Warden-${++wardenIdx}`;
});
const hitMap = new Map();
for (const h of bots.hitMeshes) hitMap.set(h.mesh, h);

const rounds = createRounds({
  onRoundEnd(winner, reason, score) {
    const won = winner === 'ember';
    economy.onRoundEnd(won);
    hud.banner(won ? `EMBER WINS THE ROUND — ${reason}` : `WARDENS WIN THE ROUND — ${reason}`, 4000);
    if (won) audio.roundWin(); else audio.roundLose();
    bomb.state = 'none';
    bomb.carrier = null;
    bombMesh.visible = false;
    weapons.refill();
    player.state.armor = 0;
  },
  onMatchEnd(winner, score) {
    hud.setEnd(winner, score);
    hud.showOverlay('overlayEnd');
    input.exitLock();
    if (winner === 'ember') audio.roundWin(); else audio.roundLose();
  },
  onBombPlanted(site) { /* handled by the bot event above */ },
  onBombExploded() { addExplosion(bomb.pos); },
  onRoundLive() { hud.banner(`ROUND ${rounds.roundNumber} — FIGHT`, 2000); },
  onRoundStart(n) {
    bots.reset();
    player.reset(world.spawns.ember[0]);
    bomb.state = 'carried';
    bomb.carrier = bots.carrier;
    hud.banner(`ROUND ${n} — BUY PHASE`, 2500);
  },
});

function startMatch() {
  economy.reset();
  bots.reset();
  player.reset(world.spawns.ember[0]);
  bomb.state = 'carried';
  bomb.carrier = bots.carrier;
  rounds.startMatch();
  hud.hideOverlay();
  hud.banner('ROUND 1 — BUY PHASE', 2500);
}

// --- Shooting ---
function shootOnce() {
  const shot = weapons.pullTrigger();
  if (!shot) return;
  const w = shot.weapon;
  audio.shoot(w.id);
  bots.hearShot(player.state.pos);
  const eye = player.eye();
  camera.getWorldDirection(tmpDir);
  const muzzle = tmpV.copy(eye).addScaledVector(tmpDir, 0.6);
  muzzle.y -= 0.15;
  for (let p = 0; p < shot.pellets; p++) {
    const dir = tmpV2.copy(tmpDir);
    const spread = shot.spread;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    dir.addScaledVector(right, (Math.random() - 0.5) * 2 * spread);
    dir.addScaledVector(up, (Math.random() - 0.5) * 2 * spread);
    dir.normalize();
    raycaster.set(eye, dir);
    raycaster.far = w.range;
    const targets = [...hitMap.keys(), ...world.shootables];
    const hits = raycaster.intersectObjects(targets, false);
    const hit = hits[0];
    const end = hit ? hit.point.clone() : eye.clone().addScaledVector(dir, w.range);
    addTracer(muzzle.clone(), end);
    if (hit && hitMap.has(hit.object)) {
      const entry = hitMap.get(hit.object);
      const isHead = entry.part === 'head';
      const dmg = isHead ? w.headDamage : w.damage;
      const dead = bots.damage(hit.object, dmg, 'player', isHead);
      hud.hitMarker(dead !== null && dead.health <= 0);
      audio.hit();
    }
  }
  // Recoil (once per trigger pull).
  player.state.pitch += w.kick * (0.8 + Math.random() * 0.4);
  player.state.yaw += (Math.random() - 0.5) * w.kick * 0.6;
}

function explodeGrenade(pos) {
  addExplosion(pos);
  const R = 5;
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
    if (d < R) bots.damage(b.bodyMesh, Math.round(120 * (1 - d / R)), 'player', false);
  }
  const pd = Math.hypot(player.state.pos.x - pos.x, player.state.pos.z - pos.z);
  if (pd < R && player.state.alive) damagePlayer(Math.round(120 * (1 - pd / R)), null, false);
}

// --- Buy menu ---
const BUY_ITEMS = [
  { key: '1', id: 'vk47' }, { key: '2', id: 'hornet' }, { key: '3', id: 'longshot' },
  { key: '4', id: 'breacher' }, { key: '5', id: 'frag' }, { key: '6', id: 'armor' },
];
let buyOpen = false;
function openBuy() {
  if (rounds.state() !== 'buy') return;
  buyOpen = true;
  const items = BUY_ITEMS.map((it) => {
    if (it.id === 'armor') return { name: 'Armor (50% damage cut)', price: 650, owned: player.state.armor > 0, afford: economy.canAfford(650) };
    const w = WEAPONS.find((x) => x.id === it.id);
    const owned = it.id === 'frag' ? false : weapons.owns(it.id);
    return { name: w.name, price: w.price, owned, afford: economy.canAfford(w.price) };
  });
  hud.showBuy(items, economy.money);
}
function tryBuy(key) {
  const it = BUY_ITEMS.find((x) => x.key === key);
  if (!it || !buyOpen) return;
  if (it.id === 'armor') {
    if (player.state.armor > 0) return;
    if (economy.buy(650)) { player.state.armor = 100; audio.buy(); }
    return;
  }
  const w = WEAPONS.find((x) => x.id === it.id);
  if (!w || !economy.canAfford(w.price)) return;
  if (it.id === 'frag') {
    if (weapons.state.grenades >= 2) return;
    if (economy.buy(w.price)) { weapons.buy('frag'); audio.buy(); }
    return;
  }
  if (weapons.owns(it.id)) { weapons.select(it.id); audio.click(); openBuy(); return; }
  if (economy.buy(w.price)) { weapons.buy(it.id); audio.buy(); }
  openBuy();
}

// --- Input wiring ---
hud.onPlay(() => {
  audio.unlock();
  audio.click();
  input.requestLock(renderer.domElement);
  startMatch();
});
hud.onAgain(() => {
  audio.click();
  input.requestLock(renderer.domElement);
  startMatch();
});
hud.onResume(() => {
  audio.click();
  input.requestLock(renderer.domElement);
  hud.hideOverlay();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && rounds.state() !== 'menu' && rounds.state() !== 'match' && !shotMode) {
    hud.showOverlay('overlayPause');
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
let rightDown = false;
document.addEventListener('mousedown', (e) => { if (e.button === 2) rightDown = true; });
document.addEventListener('mouseup', (e) => { if (e.button === 2) rightDown = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Sim step (fixed 60 Hz) ---
function simStep(dt) {
  const st = rounds.state();
  if (st === 'menu' || st === 'match') return;
  const look = input.consumeLook();
  player.look(look.dx, look.dy);
  player.step(dt, input);

  // Weapon switching (1/2/3) and actions.
  if (input.pressed('Digit1')) weapons.select('p9');
  if (input.pressed('Digit2')) weapons.select('vk47');
  if (input.pressed('Digit3')) weapons.select('hornet');
  if (input.pressed('KeyR')) { weapons.reload(); audio.reload(); }
  if (input.pressed('KeyB')) { buyOpen ? (buyOpen = false, hud.hideBuy()) : openBuy(); }
  if (buyOpen) {
    for (const it of BUY_ITEMS) if (input.pressed(`Digit${it.key}`)) tryBuy(it.key);
    if (input.pressed('Escape')) { buyOpen = false; hud.hideBuy(); }
  }
  if (input.pressed('KeyG') && weapons.state.grenades > 0) {
    const eye = player.eye();
    camera.getWorldDirection(tmpDir);
    const g = weapons.throwGrenade(eye, tmpDir);
    if (g) scene.add(g.mesh);
  }
  // Zoom for the Longshot (hold right mouse).
  const wantZoom = rightDown && weapons.state.current === 'longshot';
  if (wantZoom !== weapons.state.zoomed) {
    weapons.state.zoomed = wantZoom;
    camera.fov = wantZoom ? 75 / 2.2 : 75;
    camera.updateProjectionMatrix();
  }
  // Shooting.
  const w = weapons.current();
  if (input.mouse.down && player.state.alive && rounds.isLive()) {
    if (w.auto) shootOnce();
    else if (input.mouse.clicked) shootOnce();
  }
  weapons.step(dt);
  weapons.stepGrenades(dt, world, explodeGrenade);

  // Bomb: player pickup, plant, defuse.
  if (bomb.state === 'dropped' && player.state.alive) {
    const d = Math.hypot(bomb.pos.x - player.state.pos.x, bomb.pos.z - player.state.pos.z);
    if (d < 1.5) {
      bomb.state = 'carried';
      bomb.carrier = 'player';
      bombMesh.visible = false;
      bots.setBombState('carried');
      hud.banner('YOU HAVE THE BOMB — PLANT AT A OR B', 2500);
    }
  }
  const inSite = (site) => {
    const s = world.sites[site];
    return Math.hypot(s.center.x - player.state.pos.x, s.center.z - player.state.pos.z) < s.radius;
  };
  if (bomb.state === 'carried' && bomb.carrier === 'player' && rounds.isLive() && player.state.alive) {
    const site = inSite('A') ? 'A' : inSite('B') ? 'B' : null;
    if (site && input.isDown('KeyE')) {
      plantProgress += dt / 3;
      if (plantProgress >= 1) {
        plantProgress = 0;
        rounds.plant(site);
        bomb.state = 'planted';
        bomb.site = site;
        bomb.pos.copy(world.sites[site].center);
        bombMesh.position.copy(bomb.pos);
        bombMesh.visible = true;
        bots.setBombState('planted', site, bomb.pos);
        hud.banner(`BOMB PLANTED — SITE ${site}`, 3000);
        audio.plant();
      }
    } else plantProgress = Math.max(0, plantProgress - dt);
  }
  if (bomb.state === 'planted' && player.state.alive) {
    const d = Math.hypot(bomb.pos.x - player.state.pos.x, bomb.pos.z - player.state.pos.z);
    if (d < 1.6 && input.isDown('KeyE')) {
      defuseProgress += dt / 5;
      if (defuseProgress >= 1) {
        defuseProgress = 0;
        rounds.defuse();
        bomb.state = 'defused';
        bombMesh.visible = false;
        audio.defuse();
      }
    } else defuseProgress = Math.max(0, defuseProgress - dt);
  }

  // Bots.
  bots.step(dt, {
    time: performance.now() / 1000,
    playerPos: player.state.pos,
    playerAlive: player.state.alive,
    playerSpeed: player.groundSpeed(),
    bombState: bomb.state,
    onShoot: null, onDamage: null, onKill: null, onPlant: null, onDefuse: null,
  });

  // Round end by elimination.
  if (rounds.isLive()) {
    const emberAlive = bots.aliveCount('ember') + (player.state.alive ? 1 : 0);
    const wardensAlive = bots.aliveCount('wardens');
    if (bomb.state === 'planted') {
      if (wardensAlive === 0) rounds.endRound('ember', 'elimination');
    } else {
      if (emberAlive === 0) rounds.endRound('wardens', 'elimination');
      else if (wardensAlive === 0) rounds.endRound('ember', 'elimination');
    }
  }
  rounds.step(dt);

  // Bomb blink.
  if (bombMesh.visible) bombLight.material.color.setHex(Math.sin(performance.now() / 150) > 0 ? 0xff2020 : 0x551010);

  // Tracers fade.
  for (const t of tracers) if (t.material.opacity > 0) t.material.opacity = Math.max(0, t.material.opacity - dt * 3);
  // Effects fade.
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    e.light.intensity = Math.max(0, 6 - e.t * 10);
    e.ring.scale.setScalar(1 + e.t * 6);
    e.ring.material.opacity = Math.max(0, 0.9 - e.t * 1.5);
    if (e.t > 0.7) {
      scene.remove(e.light, e.ring);
      effects.splice(i, 1);
    }
  }
}

// --- HUD push (every frame) ---
function updateHud() {
  const p = player.state;
  const w = weapons.current();
  const a = weapons.ammo[w.id];
  hud.setHealth(p.health, p.armor);
  hud.setAmmo(a.mag, a.reserve, w.name);
  hud.setGrenades(weapons.state.grenades);
  hud.setMoney(economy.money);
  const st = rounds.state();
  const phase = st === 'buy' ? 'BUY' : st === 'live' ? 'LIVE' : st === 'planted' ? 'PLANTED' : st;
  hud.setTimer(rounds.timeLeft(), phase);
  hud.setScore(rounds.score.ember, rounds.score.wardens, rounds.roundNumber);
  hud.setAlive(bots.aliveCount('ember') + (p.alive ? 1 : 0), bots.aliveCount('wardens'));
  let bombText = '';
  if (bomb.state === 'carried' && bomb.carrier === 'player') bombText = 'BOMB — YOU CARRY IT — PLANT AT A OR B (HOLD E)';
  else if (bomb.state === 'carried' && bomb.carrier) bombText = `BOMB CARRIED BY ${botName(bomb.carrier)}`;
  else if (bomb.state === 'dropped') bombText = 'BOMB DROPPED — PICK IT UP';
  else if (bomb.state === 'planted') bombText = `BOMB PLANTED — SITE ${bomb.site} — ${rounds.timeLeft()}s${defuseProgress > 0 ? ` — DEFUSING ${Math.round(defuseProgress * 100)}%` : ''}`;
  else if (plantProgress > 0) bombText = `PLANTING ${Math.round(plantProgress * 100)}%`;
  hud.setBomb(bombText);
  hud.setCrosshair(weapons.spread(player.groundSpeed()) * 800);
  // Camera follows the player.
  const eye = player.eye();
  camera.position.copy(eye);
  camera.rotation.y = player.state.yaw;
  camera.rotation.x = player.state.pitch;
}

// --- Shot modes (deterministic frames for screenshots) ---
function renderShot(mode) {
  // Configure the scene per mode, render twice, freeze.
  economy.reset();
  bots.reset();
  player.reset(world.spawns.ember[0]);
  rounds.startMatch();
  const warden = bots.bots.find((b) => b.team === 'wardens');
  const emberMate = bots.bots.find((b) => b.team === 'ember' && b !== bots.carrier);
  if (mode === 'start') {
    // Buy phase, title screen over the foundry.
    hud.showOverlay('overlayStart');
  } else if (mode === 'play') {
    // Mid-round: player aims at a warden bot down mid, muzzle flash + tracer.
    // (x = -2: the central pillar at x = 0 blocks the straight mid line.)
    rounds.setShotState('live', 85);
    player.state.pos.set(-2, 0, 8);
    player.state.yaw = 0;
    player.state.pitch = 0;
    if (warden) {
      warden.pos.set(-2, 0, -4);
      warden.mesh.position.copy(warden.pos);
      warden.mesh.rotation.y = Math.PI;
    }
    if (emberMate) { emberMate.pos.set(3, 0, 6); emberMate.mesh.position.copy(emberMate.pos); }
    hud.hideOverlay();
    // Sync the camera to the player BEFORE shooting, so the raycast and
    // tracer go where the player is aiming.
    updateHud();
    // Fire one shot for the flash + tracer, then freeze before it decays.
    shootOnce();
    weapons.step(0);
  } else if (mode === 'bomb') {
    // Bomb planted at A; player near the site; kill feed shows action.
    rounds.setShotState('planted', 32);
    rounds.bomb.state = 'planted';
    rounds.bomb.site = 'A';
    rounds.bomb.timer = 32;
    bomb.state = 'planted';
    bomb.site = 'A';
    bomb.pos.copy(world.sites.A.center);
    bombMesh.position.copy(bomb.pos);
    bombMesh.visible = true;
    player.state.pos.set(-12, 0, -7);
    player.state.yaw = 0.5;
    if (warden) {
      warden.pos.set(-14, 0, -9);
      warden.mesh.position.copy(warden.pos);
      warden.mesh.rotation.y = Math.PI * 0.75;
    }
    hud.killfeed('You ✕ Warden-2');
    hud.killfeed('Ember-1 ✕ Warden-4');
    hud.hideOverlay();
  } else if (mode === 'end') {
    // Match end: Ember 5 – Wardens 3, Play again visible.
    rounds.score.ember = 5;
    rounds.score.wardens = 3;
    hud.setEnd('ember', { ember: 5, wardens: 3 });
    hud.showOverlay('overlayEnd');
  } else if (mode === 'buy') {
    openBuy();
  }
  updateHud();
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- Main loop ---
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  const STEP = 1 / 60;
  let n = 0;
  while (acc >= STEP && n < 5) { simStep(STEP); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  updateHud();
  renderer.render(scene, camera);
  input.endFrame();
}

if (shotMode) {
  renderShot(shotMode);
} else {
  hud.showOverlay('overlayStart');
  requestAnimationFrame(frame);
}
