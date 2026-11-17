// Cinderworks map: an abandoned foundry hall, 44 x 34 m.
// Built only from boxes. All colliders are THREE.Box3; shootables are the
// meshes bullets stop on. Exports createWorld, collideMove and findPath.
import * as THREE from 'three';
import { PALETTE, LIGHTS } from './palette.js';

function box(scene, group, mat, cx, cy, cz, sx, sy, sz, colliders, shootables) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  if (colliders) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)));
  }
  if (shootables) shootables.push(mesh);
  return mesh;
}

// Move an AABB (feet at pos.y, half extents hx/hz, height h) one axis at a
// time; any axis that would intersect a collider is reverted. Returns pos.
export function collideMove(pos, dx, dy, dz, hx, h, hz, colliders) {
  const test = (x, y, z) => {
    for (const c of colliders) {
      if (x - hx < c.max.x && x + hx > c.min.x &&
          y < c.max.y && y + h > c.min.y &&
          z - hz < c.max.z && z + hz > c.min.z) return true;
    }
    return false;
  };
  if (dx !== 0 && !test(pos.x + dx, pos.y, pos.z)) pos.x += dx;
  if (dz !== 0 && !test(pos.x, pos.y, pos.z + dz)) pos.z += dz;
  if (dy !== 0 && !test(pos.x, pos.y + dy, pos.z)) pos.y += dy;
  return pos;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const matFloor = new THREE.MeshStandardMaterial({ color: 0x262a31, roughness: 0.95 });
  const matWall = new THREE.MeshStandardMaterial({ color: 0x31363e, roughness: 0.9 });
  const matCrate = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.85 });
  const matPillar = new THREE.MeshStandardMaterial({ color: 0x2e3239, roughness: 0.8 });
  const matAmber = new THREE.MeshStandardMaterial({ color: 0x8a5a20, roughness: 0.6, emissive: 0x542f08, emissiveIntensity: 0.9 });
  const matPipe = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.6 });

  // Floor (visual only, y = 0).
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  group.add(floor);

  // Outer walls (height 4, thickness 1).
  box(scene, group, matWall, 0, 2, -17.5, 45, 4, 1, colliders, shootables); // north
  box(scene, group, matWall, 0, 2, 17.5, 45, 4, 1, colliders, shootables);  // south
  box(scene, group, matWall, -22.5, 2, 0, 1, 4, 36, colliders, shootables); // west
  box(scene, group, matWall, 22.5, 2, 0, 1, 4, 36, colliders, shootables);  // east

  // Central pillar — blocks the straight mid sightline.
  box(scene, group, matPillar, 0, 2, 1.5, 2.5, 4, 2.5, colliders, shootables);
  // Furnace glow: molten strips on the pillar's north face.
  box(scene, group, matAmber, 0, 1.2, 0.2, 1.6, 0.5, 0.2, null, null);

  // Mid cover crates.
  box(scene, group, matCrate, -8, 1, 6, 2, 2, 2, colliders, shootables);
  box(scene, group, matCrate, 8, 1, 6, 2, 2, 2, colliders, shootables);
  box(scene, group, matCrate, -8, 0.7, -6, 2.5, 1.4, 1.5, colliders, shootables);
  box(scene, group, matCrate, 8, 0.7, -6, 2.5, 1.4, 1.5, colliders, shootables);
  box(scene, group, matCrate, 0, 0.8, -8, 3, 1.6, 1.2, colliders, shootables);
  // Low walls near the sites.
  box(scene, group, matWall, -15, 0.6, -8, 3.5, 1.2, 0.6, colliders, shootables);
  box(scene, group, matWall, 15, 0.6, -8, 3.5, 1.2, 0.6, colliders, shootables);
  box(scene, group, matWall, -12, 0.6, -11, 0.6, 1.2, 3, colliders, shootables);
  box(scene, group, matWall, 12, 0.6, -11, 0.6, 1.2, 3, colliders, shootables);
  // A-long corridor cover (west).
  box(scene, group, matCrate, -19, 1, 4, 2, 2, 6, colliders, shootables);
  box(scene, group, matCrate, -19, 0.9, -4, 2, 1.8, 3, colliders, shootables);
  // B-short corridor cover (east).
  box(scene, group, matCrate, 19, 1, 4, 2, 2, 6, colliders, shootables);
  box(scene, group, matCrate, 19, 0.9, -4, 2, 1.8, 3, colliders, shootables);
  // Pipes along the north wall (visual + cover).
  box(scene, group, matPipe, -8, 2.6, -16.8, 14, 0.7, 0.7, colliders, shootables);
  box(scene, group, matPipe, 8, 2.6, -16.8, 14, 0.7, 0.7, colliders, shootables);
  // Furnace body at A (glowing) and vault blocks at B.
  box(scene, group, matAmber, -17, 1.5, -13, 3, 3, 2, colliders, shootables);
  box(scene, group, matPillar, 17, 1.5, -13, 3, 3, 2, colliders, shootables);
  box(scene, group, matPillar, 17, 1, -8.5, 1.5, 2, 1.5, colliders, shootables);

  // Site rings (flat, on the floor) + glow beams.
  const sites = {
    A: { center: new THREE.Vector3(-15, 0, -11), radius: 3 },
    B: { center: new THREE.Vector3(15, 0, -11), radius: 3 },
  };
  for (const key of ['A', 'B']) {
    const s = sites[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.radius - 0.25, s.radius, 40),
      new THREE.MeshBasicMaterial({
        color: key === 'A' ? 0xe8703a : 0x5fb8d8, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.center.x, 0.02, s.center.z);
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 4, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: key === 'A' ? 0xe8703a : 0x5fb8d8, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
      }));
    beam.position.set(s.center.x, 2, s.center.z);
    group.add(beam);
  }

  // Lighting.
  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x1a1c20, LIGHTS.hemi);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe0b0, LIGHTS.key);
  key.position.set(12, 18, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fb8d8, LIGHTS.fill);
  fill.position.set(-10, 12, -8);
  scene.add(fill);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas).getHex(), 30, 95);
  scene.background = new THREE.Color(PALETTE.canvas);

  // Waypoint graph (id, x, z, links).
  const nodes = [
    { id: 0, pos: new THREE.Vector3(0, 0, 14), links: [1, 6, 10] },
    { id: 1, pos: new THREE.Vector3(0, 0, 8), links: [0, 2, 3] },
    { id: 2, pos: new THREE.Vector3(-2, 0, 2), links: [1, 4, 15] },
    { id: 3, pos: new THREE.Vector3(2, 0, 2), links: [1, 4, 16] },
    { id: 4, pos: new THREE.Vector3(0, 0, -4), links: [2, 3, 5, 15, 16] },
    { id: 5, pos: new THREE.Vector3(0, 0, -8), links: [4, 14, 19, 20] },
    { id: 6, pos: new THREE.Vector3(-19, 0, 10), links: [0, 7] },
    { id: 7, pos: new THREE.Vector3(-19, 0, 0), links: [6, 8, 15] },
    { id: 8, pos: new THREE.Vector3(-19, 0, -8), links: [7, 9, 17] },
    { id: 9, pos: new THREE.Vector3(-15, 0, -11), links: [8, 17] },
    { id: 10, pos: new THREE.Vector3(19, 0, 10), links: [0, 11] },
    { id: 11, pos: new THREE.Vector3(19, 0, 0), links: [10, 12, 16] },
    { id: 12, pos: new THREE.Vector3(19, 0, -8), links: [11, 13, 18] },
    { id: 13, pos: new THREE.Vector3(15, 0, -11), links: [12, 18] },
    { id: 14, pos: new THREE.Vector3(0, 0, -14), links: [5, 17, 18, 19, 20] },
    { id: 15, pos: new THREE.Vector3(-8, 0, -6), links: [2, 4, 7] },
    { id: 16, pos: new THREE.Vector3(8, 0, -6), links: [3, 4, 11] },
    { id: 17, pos: new THREE.Vector3(-12, 0, -14), links: [8, 9, 14] },
    { id: 18, pos: new THREE.Vector3(12, 0, -14), links: [12, 13, 14] },
    { id: 19, pos: new THREE.Vector3(-6, 0, -12), links: [5, 14] },
    { id: 20, pos: new THREE.Vector3(6, 0, -12), links: [5, 14] },
  ];
  const waypoints = { nodes };

  function nearestNode(pos) {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      const d = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best.id;
  }
  // Breadth-first path over the waypoint graph; returns node ids.
  function findPath(fromPos, toPos) {
    const start = nearestNode(fromPos);
    const goal = nearestNode(toPos);
    if (start === goal) return [goal];
    const prev = new Map([[start, -1]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const nb of nodes[cur].links) {
        if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb); }
      }
    }
    if (!prev.has(goal)) return [goal];
    const path = [];
    let cur = goal;
    while (cur !== -1) { path.unshift(cur); cur = prev.get(cur); }
    return path;
  }

  const spawns = {
    ember: [
      new THREE.Vector3(-3, 0, 14), new THREE.Vector3(-1, 0, 14.5),
      new THREE.Vector3(1, 0, 14.5), new THREE.Vector3(3, 0, 14),
      new THREE.Vector3(0, 0, 15),
    ],
    wardens: [
      new THREE.Vector3(-3, 0, -14), new THREE.Vector3(-1, 0, -14.5),
      new THREE.Vector3(1, 0, -14.5), new THREE.Vector3(3, 0, -14),
      new THREE.Vector3(0, 0, -15),
    ],
  };

  return { colliders, shootables, group, sites, spawns, waypoints, nearestNode, findPath };
}
