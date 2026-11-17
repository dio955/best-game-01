// Weapons: definitions, state, view model, grenades.
// Shooting itself (raycast + damage) lives in main.js; this module owns
// ammo, cooldown, reload, spread, recoil, the view model and grenade sim.
import * as THREE from 'three';

export const WEAPONS = [
  { id: 'p9', name: 'P9', price: 0, damage: 34, headDamage: 100, fireGap: 0.16, magSize: 12, reserve: 48, reloadTime: 1.1, spreadStill: 0.006, spreadMoving: 0.02, auto: false, range: 60, kick: 0.006 },
  { id: 'vk47', name: 'VK-47', price: 2700, damage: 34, headDamage: 136, fireGap: 0.1, magSize: 30, reserve: 90, reloadTime: 2.2, spreadStill: 0.008, spreadMoving: 0.03, auto: true, range: 80, kick: 0.009 },
  { id: 'hornet', name: 'Hornet', price: 1500, damage: 26, headDamage: 104, fireGap: 0.07, magSize: 32, reserve: 96, reloadTime: 1.9, spreadStill: 0.012, spreadMoving: 0.04, auto: true, range: 50, kick: 0.005 },
  { id: 'longshot', name: 'Longshot', price: 4750, damage: 115, headDamage: 400, fireGap: 1.1, magSize: 5, reserve: 15, reloadTime: 3.0, spreadStill: 0.001, spreadMoving: 0.09, auto: false, range: 120, kick: 0.03 },
  { id: 'breacher', name: 'Breacher', price: 1200, damage: 12, headDamage: 24, fireGap: 0.85, magSize: 6, reserve: 24, reloadTime: 2.4, spreadStill: 0.03, spreadMoving: 0.06, auto: false, range: 25, kick: 0.02, pellets: 8 },
  { id: 'frag', name: 'Frag', price: 300, damage: 120, headDamage: 120, fireGap: 0.5, magSize: 0, reserve: 0, reloadTime: 0, spreadStill: 0, spreadMoving: 0, auto: false, range: 5, kick: 0 },
];

export function createWeapons(camera) {
  const owned = new Set(['p9']);
  const ammo = {};
  for (const w of WEAPONS) ammo[w.id] = { mag: w.magSize, reserve: w.reserve };
  const state = {
    current: 'p9', primary: 'p9', cooldown: 0, reloadLeft: 0, kick: 0, flash: 0,
    grenades: 0, zoomed: false,
  };
  const grenades = [];

  // View model: a box-built gun hanging off the camera.
  const viewModel = new THREE.Group();
  const flashLight = new THREE.PointLight(0xffc060, 0, 6);
  const flashMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  flashLight.position.set(0.25, -0.18, -0.9);
  flashMesh.position.set(0.25, -0.18, -0.9);
  viewModel.add(flashLight, flashMesh);
  camera.add(viewModel);

  function buildViewModel() {
    // Remove old gun parts (keep flash light + mesh, the last two children).
    while (viewModel.children.length > 2) {
      const child = viewModel.children[0];
      viewModel.remove(child);
      child.geometry?.dispose();
    }
    const def = WEAPONS.find((w) => w.id === state.current);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.5 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.5, metalness: 0.4 });
    const barrelLen = def.id === 'longshot' ? 0.75 : def.id === 'breacher' ? 0.6 : 0.45;
    const bodyLen = def.id === 'p9' ? 0.22 : 0.42;
    const add = (mat, w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      viewModel.add(m);
      return m;
    };
    add(dark, 0.07, 0.09, bodyLen, 0.25, -0.22, -0.55);            // receiver
    add(dark, 0.045, 0.045, barrelLen, 0.25, -0.2, -0.55 - barrelLen / 2 - bodyLen / 2 + 0.1); // barrel
    add(grip, 0.06, 0.16, 0.08, 0.25, -0.32, -0.42);              // grip
    add(accent, 0.075, 0.02, 0.1, 0.25, -0.17, -0.6);             // amber strip
    if (def.id === 'longshot') add(dark, 0.06, 0.06, 0.18, 0.25, -0.14, -0.55); // scope
    if (def.id === 'breacher') add(dark, 0.09, 0.07, 0.3, 0.25, -0.24, -0.6);  // pump
    flashMesh.position.set(0.25, -0.2, -0.55 - barrelLen - bodyLen / 2 + 0.1);
    flashLight.position.copy(flashMesh.position);
  }
  buildViewModel();

  function def() { return WEAPONS.find((w) => w.id === state.current); }
  function ready() { return state.cooldown <= 0 && state.reloadLeft <= 0; }

  function pullTrigger() {
    const w = def();
    if (!ready() || ammo[w.id].mag <= 0) return null;
    ammo[w.id].mag -= 1;
    state.cooldown = w.fireGap;
    state.kick = w.kick;
    state.flash = 0.06;
    return { weapon: w, spread: spread(0), pellets: w.pellets || 1 };
  }

  function takeRound() { return pullTrigger(); }

  function reload() {
    const w = def();
    const a = ammo[w.id];
    if (state.reloadLeft > 0 || a.mag >= w.magSize || a.reserve <= 0) return;
    state.reloadLeft = w.reloadTime;
  }

  function spread(speed) {
    const w = def();
    const moving = Math.min(1, speed / 4);
    return w.spreadStill + (w.spreadMoving - w.spreadStill) * moving;
  }

  function select(id) {
    if (!owned.has(id) || id === 'frag') return false;
    if (state.current === id) return true;
    state.current = id;
    state.reloadLeft = 0;
    state.zoomed = false;
    buildViewModel();
    return true;
  }

  function owns(id) { return owned.has(id); }

  function buy(id) {
    const w = WEAPONS.find((x) => x.id === id);
    if (!w) return false;
    if (id === 'frag') {
      if (state.grenades >= 2) return false;
      state.grenades += 1;
      return true;
    }
    if (owned.has(id)) return false;
    owned.add(id);
    ammo[id] = { mag: w.magSize, reserve: w.reserve };
    // Buying a non-pistol weapon makes it the primary (slot 1) and equips it.
    if (id !== 'p9' && id !== 'frag') state.primary = id;
    state.current = id;
    buildViewModel();
    return true;
  }

  function refill() {
    for (const w of WEAPONS) ammo[w.id] = { mag: w.magSize, reserve: w.reserve };
    state.grenades = 0;
    state.reloadLeft = 0;
    state.cooldown = 0;
  }

  function throwGrenade(origin, dir) {
    if (state.grenades <= 0) return null;
    state.grenades -= 1;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6 }));
    mesh.position.copy(origin);
    const g = { mesh, vel: dir.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3.5, 0)), fuse: 3 };
    grenades.push(g);
    return g;
  }

  function step(dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.kick > 0) state.kick = Math.max(0, state.kick - dt * 0.12);
    if (state.flash > 0) {
      state.flash -= dt;
      flashMesh.material.opacity = state.flash > 0 ? 0.95 : 0;
      flashLight.intensity = state.flash > 0 ? 2.2 : 0;
    } else {
      flashMesh.material.opacity = 0;
      flashLight.intensity = 0;
    }
    if (state.reloadLeft > 0) {
      state.reloadLeft -= dt;
      if (state.reloadLeft <= 0) {
        const w = def();
        const a = ammo[w.id];
        const need = w.magSize - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  // Grenade sim: gravity, bounce, fuse, then onExplode(pos). Returns exploded list.
  function stepGrenades(dt, world, onExplode) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.vel.y -= 12 * dt;
      const p = g.mesh.position;
      const nx = p.x + g.vel.x * dt;
      const ny = p.y + g.vel.y * dt;
      const nz = p.z + g.vel.z * dt;
      // Simple bounce: test the new position against colliders, revert per axis.
      let hitX = false, hitY = false, hitZ = false;
      for (const c of world.colliders) {
        if (nx - 0.09 < c.max.x && nx + 0.09 > c.min.x && p.y - 0.09 < c.max.y && p.y + 0.09 > c.min.y && p.z - 0.09 < c.max.z && p.z + 0.09 > c.min.z) hitX = true;
        if (p.x - 0.09 < c.max.x && p.x + 0.09 > c.min.x && ny - 0.09 < c.max.y && ny + 0.09 > c.min.y && p.z - 0.09 < c.max.z && p.z + 0.09 > c.min.z) hitY = true;
        if (p.x - 0.09 < c.max.x && p.x + 0.09 > c.min.x && p.y - 0.09 < c.max.y && p.y + 0.09 > c.min.y && nz - 0.09 < c.max.z && nz + 0.09 > c.min.z) hitZ = true;
      }
      if (!hitX) p.x = nx; else g.vel.x *= -0.4;
      if (!hitY) p.y = ny; else { g.vel.y *= -0.4; if (Math.abs(g.vel.y) < 0.8) g.vel.y = 0; }
      if (!hitZ) p.z = nz; else g.vel.z *= -0.4;
      if (p.y < 0.09) { p.y = 0.09; g.vel.y = Math.abs(g.vel.y) > 0.8 ? -g.vel.y * 0.4 : 0; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        onExplode(p.clone());
        g.mesh.parent?.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  return {
    state, ammo, grenades, viewModel,
    list: WEAPONS, current: () => def(),
    buy, select, owns, step, ready, pullTrigger, takeRound, reload, spread, refill,
    throwGrenade, stepGrenades,
  };
}
