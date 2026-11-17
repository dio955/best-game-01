// Bots: 4 friendly Ember + 5 enemy Wardens, vs the player (5th Ember).
// Waypoint paths, line-of-sight combat, bursts, hearing, bomb carrier,
// plant/defuse channels, death fall + fade. Meshes are box-built humanoids;
// the head mesh is a separate hit mesh (headshot).
import * as THREE from 'three';
import { collideMove } from './world.js';
import { TEAM_COLOR } from './palette.js';

const WALK_SPEED = 3.2;
const REACT_TIME = 0.35;
const SIGHT_RANGE = 40;
const HEAR_RANGE = 25;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBots(scene, world, onEvent) {
  const bots = [];
  const hitMeshes = [];
  let bombState = 'none';
  let bombSite = null;
  let bombPos = new THREE.Vector3();
  let carrier = null;
  const rng = mulberry32(1337);

  function makeMesh(team) {
    const group = new THREE.Group();
    const color = TEAM_COLOR[team];
    const matBody = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8, transparent: true });
    const matVisor = new THREE.MeshStandardMaterial({
      color: team === 'ember' ? 0xffd27a : 0xbfe8ff, roughness: 0.3, emissive: color, emissiveIntensity: 0.5, transparent: true,
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), matBody);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), matDark);
    head.position.y = 1.62;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), matVisor);
    visor.position.set(0, 1.64, -0.18);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), matDark);
    legL.position.set(-0.15, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.7), matDark);
    gun.position.set(0.2, 1.15, -0.3);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(group);
    return { group, head, torso, mats: [matBody, matDark, matVisor] };
  }

  function spawnBot(team, role, spawnIdx) {
    const spawn = world.spawns[team][spawnIdx % world.spawns[team].length];
    const parts = makeMesh(team);
    const bot = {
      team, role, pos: spawn.clone(), yaw: team === 'ember' ? 0 : Math.PI,
      health: 100, alive: true, weapon: 'vk47',
      path: [], pathIndex: 0, state: 'move', target: null,
      scanTimer: rng() * 0.15, shootTimer: 0, burstLeft: 0, burstPause: 0,
      reactTimer: 0, aimError: 0.05, deathTimer: 0, plantTimer: 0, defuseTimer: 0,
      isCarrier: false, mesh: parts.group, headMesh: parts.head, bodyMesh: parts.torso,
      mats: parts.mats, speed: WALK_SPEED,
    };
    hitMeshes.push({ mesh: parts.head, bot, part: 'head' });
    hitMeshes.push({ mesh: parts.torso, bot, part: 'body' });
    bots.push(bot);
    return bot;
  }

  function roleTarget(bot) {
    const n = world.waypoints.nodes;
    switch (bot.role) {
      case 'rushA':
      case 'rushA2': return n[9].pos;
      case 'rushB': return n[13].pos;
      case 'mid': return n[5].pos;
      case 'holdA': return n[17].pos;
      case 'holdB': return n[18].pos;
      default: return n[5].pos;
    }
  }

  function setPath(bot, dest) {
    bot.path = world.findPath(bot.pos, dest);
    bot.pathIndex = 0;
  }

  function reset() {
    const emberRoles = ['rushA', 'rushB', 'mid', 'rushA2'];
    const wardenRoles = ['holdA', 'holdA2', 'holdB', 'holdB2', 'mid'];
    let ei = 0, wi = 0;
    for (const b of bots) {
      b.alive = true;
      b.health = 100;
      b.state = 'move';
      b.target = null;
      b.deathTimer = 0;
      b.plantTimer = 0;
      b.defuseTimer = 0;
      b.isCarrier = false;
      b.mesh.visible = true;
      b.mesh.rotation.set(0, 0, 0);
      b.mats.forEach((m) => { m.opacity = 1; });
      if (b.team === 'ember') {
        b.role = emberRoles[ei % emberRoles.length];
        b.pos.copy(world.spawns.ember[ei % world.spawns.ember.length]);
        ei++;
      } else {
        b.role = wardenRoles[wi % wardenRoles.length];
        b.pos.copy(world.spawns.wardens[wi % world.spawns.wardens.length]);
        wi++;
      }
      b.yaw = b.team === 'ember' ? 0 : Math.PI;
      setPath(b, roleTarget(b));
    }
    carrier = bots.find((b) => b.team === 'ember' && b.role === 'rushA') || null;
    if (carrier) carrier.isCarrier = true;
    bombState = 'carried';
  }

  // 2D line of sight: sample the segment; blocked by any collider taller than 1.3 m.
  function hasLOS(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.5));
    for (let i = 1; i < steps; i++) {
      const x = from.x + (dx * i) / steps;
      const z = from.z + (dz * i) / steps;
      for (const c of world.colliders) {
        if (c.max.y <= 1.3) continue;
        if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) return false;
      }
    }
    return true;
  }

  function eyePos(bot) {
    return new THREE.Vector3(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
  }

  function findTarget(bot, ctx) {
    // Nearest visible living enemy within range and a 100-degree cone.
    let best = null;
    let bestD = SIGHT_RANGE;
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    const consider = (pos, ref) => {
      const dx = pos.x - bot.pos.x;
      const dz = pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || d < 0.5) return;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < Math.cos((100 * Math.PI) / 360)) return; // outside the cone
      if (!hasLOS(eyePos(bot), new THREE.Vector3(pos.x, pos.y + 1.4, pos.z))) return;
      best = ref; bestD = d;
    };
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      consider(other.pos, { kind: 'bot', bot: other, dist: bestD });
    }
    if (bot.team === 'wardens' && ctx.playerAlive) {
      consider(ctx.playerPos, { kind: 'player', dist: bestD });
    }
    return best;
  }

  function aimAt(bot, targetPos, dt) {
    const want = Math.atan2(-(targetPos.x - bot.pos.x), -(targetPos.z - bot.pos.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, 10 * dt);
  }

  function moveAlongPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return;
    const node = world.waypoints.nodes[bot.path[bot.pathIndex]];
    const dx = node.pos.x - bot.pos.x;
    const dz = node.pos.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) { bot.pathIndex++; return; }
    const stepLen = Math.min(d, bot.speed * dt);
    const nx = bot.pos.x + (dx / d) * stepLen;
    const nz = bot.pos.z + (dz / d) * stepLen;
    collideMove(bot.pos, nx - bot.pos.x, 0, nz - bot.pos.z, 0.35, 1.7, 0.35, world.colliders);
    bot.yaw = Math.atan2(-(dx / d), -(dz / d));
  }

  function fireBurst(bot, ctx, dt) {
    if (bot.reactTimer > 0) { bot.reactTimer -= dt; return; }
    if (bot.burstPause > 0) { bot.burstPause -= dt; return; }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(rng() * 3);
      bot.burstPause = 0.5 + rng() * 0.5;
      return;
    }
    if (bot.shootTimer > 0) { bot.shootTimer -= dt; return; }
    bot.shootTimer = 0.1;
    bot.burstLeft -= 1;
    const t = bot.target;
    if (!t) return;
    const targetPos = t.kind === 'bot' ? t.bot.pos : ctx.playerPos;
    const dist = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
    const moving = t.kind === 'bot' ? 0.5 : (ctx.playerSpeed || 0) / 4;
    const hitChance = Math.max(0.2, 0.55 - (dist / SIGHT_RANGE) * 0.35 - moving * 0.15);
    const hit = rng() < hitChance;
    const isHead = rng() < 0.1;
    const from = eyePos(bot);
    const to = new THREE.Vector3(targetPos.x, targetPos.y + (isHead ? 1.6 : 1.1), targetPos.z);
    if (hit) {
      onEvent.onDamage(t.kind === 'bot' ? t.bot : 'player', isHead ? 136 : 34, bot, isHead);
    } else {
      // Miss: tracer lands near the target.
      to.x += (rng() - 0.5) * 2;
      to.z += (rng() - 0.5) * 2;
    }
    onEvent.onShoot(bot, from, to, hit);
  }

  function step(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.deathTimer > 0) {
          bot.deathTimer -= dt;
          const o = Math.max(0, bot.deathTimer / 2);
          bot.mats.forEach((m) => { m.opacity = o; });
          if (bot.deathTimer <= 0) bot.mesh.visible = false;
        }
        continue;
      }
      // Bomb pickup: a living Ember bot walks over a dropped bomb.
      if (bombState === 'dropped' && bot.team === 'ember') {
        const d = Math.hypot(bombPos.x - bot.pos.x, bombPos.z - bot.pos.z);
        if (d < 1.5) {
          bot.isCarrier = true;
          carrier = bot;
          bombState = 'carried';
          onEvent.onBombPickup(bot);
          setPath(bot, roleTarget(bot));
        }
      }
      // Defenders rotate to a planted bomb.
      if (bombState === 'planted' && bot.team === 'wardens' && bot.state !== 'defuse') {
        const d = Math.hypot(bombPos.x - bot.pos.x, bombPos.z - bot.pos.z);
        if (d < 1.6) {
          bot.state = 'defuse';
          bot.defuseTimer = 5;
        } else if (bot.state !== 'rotate') {
          bot.state = 'rotate';
          setPath(bot, bombPos);
        }
      }
      if (bot.state === 'defuse') {
        bot.defuseTimer -= dt;
        if (bot.defuseTimer <= 0) {
          bot.state = 'move';
          onEvent.onDefuse();
        }
        continue;
      }
      // Carrier plants at its site when clear.
      if (bot.isCarrier && bombState === 'carried') {
        const site = bot.role === 'rushB' ? world.sites.B : world.sites.A;
        const d = Math.hypot(site.center.x - bot.pos.x, site.center.z - bot.pos.z);
        if (d < site.radius && bot.state !== 'plant') {
          bot.state = 'plant';
          bot.plantTimer = 3;
        }
        if (bot.state === 'plant') {
          bot.plantTimer -= dt;
          if (bot.plantTimer <= 0) {
            bot.state = 'move';
            bombState = 'planted';
            bombSite = bot.role === 'rushB' ? 'B' : 'A';
            bombPos.set(site.center.x, 0, site.center.z);
            onEvent.onPlant(bombSite);
          }
          continue;
        }
      }
      // Combat scan (staggered).
      bot.scanTimer -= dt;
      if (bot.scanTimer <= 0) {
        bot.scanTimer = 0.15;
        const found = findTarget(bot, ctx);
        if (found) {
          if (bot.target !== found) { bot.reactTimer = REACT_TIME; bot.burstLeft = 0; }
          bot.target = found;
          bot.state = 'engage';
        } else if (bot.state === 'engage') {
          bot.target = null;
          bot.state = 'move';
        }
      }
      if (bot.state === 'engage' && bot.target) {
        const tp = bot.target.kind === 'bot' ? bot.target.bot.pos : ctx.playerPos;
        aimAt(bot, tp, dt);
        fireBurst(bot, ctx, dt);
      } else {
        moveAlongPath(bot, dt);
      }
      // Sync the mesh.
      bot.mesh.position.copy(bot.pos);
      bot.mesh.rotation.y = bot.yaw;
    }
  }

  function damage(mesh, amount, attacker, isHead) {
    const hit = hitMeshes.find((h) => h.mesh === mesh);
    if (!hit || !hit.bot.alive) return null;
    const bot = hit.bot;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.deathTimer = 2;
      bot.mesh.rotation.x = -Math.PI / 2;
      if (bot.isCarrier) {
        bot.isCarrier = false;
        carrier = null;
        bombState = 'dropped';
        bombPos.copy(bot.pos);
        onEvent.onBombDropped(bombPos.clone());
      }
      onEvent.onKill(bot, attacker);
    }
    return bot;
  }

  function aliveCount(team) {
    return bots.filter((b) => b.team === team && b.alive).length;
  }

  function setBombState(state, site, pos) {
    bombState = state;
    if (site) bombSite = site;
    if (pos) bombPos.copy(pos);
    if (state === 'planted') {
      for (const b of bots) {
        if (b.team === 'wardens' && b.alive && b.state !== 'defuse') {
          b.state = 'rotate';
          setPath(b, bombPos);
        }
      }
    }
  }

  function hearShot(pos) {
    for (const b of bots) {
      if (!b.alive || b.state === 'engage') continue;
      const d = Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z);
      if (d < HEAR_RANGE) {
        b.yaw = Math.atan2(-(pos.x - b.pos.x), -(pos.z - b.pos.z));
      }
    }
  }

  // Create the teams.
  for (let i = 0; i < 4; i++) spawnBot('ember', 'rushA', i);
  for (let i = 0; i < 5; i++) spawnBot('wardens', 'holdA', i);
  reset();

  return {
    bots, hitMeshes, step, reset, damage, aliveCount, setBombState, hearShot,
    get carrier() { return carrier; },
    get bombState() { return bombState; },
  };
}
