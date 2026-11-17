// Player movement: acceleration, friction, gravity, crouch, jump.
// AABB collision one axis at a time against the world colliders.
import * as THREE from 'three';
import { collideMove } from './world.js';

const WALK_SPEED = 4.2;
const SLOW_SPEED = 2.2;   // Shift = walk, Ctrl/C = crouch
const JUMP_VELOCITY = 5.2;
const GRAVITY = -14;
const STAND_HEIGHT = 1.7;
const CROUCH_HEIGHT = 1.1;
const HALF = 0.35;

export function createPlayer(world) {
  const state = {
    pos: new THREE.Vector3(0, 0, 14),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
  };

  function look(dx, dy) {
    state.yaw -= dx * 0.0022;
    state.pitch -= dy * 0.0022;
    const lim = Math.PI / 2 - 0.02;
    state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
  }

  function eye() {
    return new THREE.Vector3(state.pos.x, state.pos.y + state.height * 0.92, state.pos.z);
  }

  function groundSpeed() {
    return Math.hypot(state.vel.x, state.vel.z);
  }

  function step(dt, input) {
    if (!state.alive) return;
    const crouch = input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC');
    state.crouching = crouch;
    state.height = crouch ? CROUCH_HEIGHT : STAND_HEIGHT;

    const slow = crouch || input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = slow ? SLOW_SPEED : WALK_SPEED;

    let fwd = 0;
    let strafe = 0;
    if (input.isDown('KeyW')) fwd += 1;
    if (input.isDown('KeyS')) fwd -= 1;
    if (input.isDown('KeyD')) strafe += 1;
    if (input.isDown('KeyA')) strafe -= 1;
    const len = Math.hypot(fwd, strafe) || 1;
    fwd /= len; strafe /= len;

    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    const wishX = (-sin * fwd + cos * strafe) * speed;
    const wishZ = (-cos * fwd - sin * strafe) * speed;

    // Accelerate toward the wish velocity; friction when no input.
    const accel = state.onGround ? 14 : 4;
    state.vel.x += (wishX - state.vel.x) * Math.min(1, accel * dt);
    state.vel.z += (wishZ - state.vel.z) * Math.min(1, accel * dt);

    if (input.isDown('Space') && state.onGround) {
      state.vel.y = JUMP_VELOCITY;
      state.onGround = false;
    }
    state.vel.y += GRAVITY * dt;

    collideMove(state.pos, state.vel.x * dt, state.vel.y * dt, state.vel.z * dt,
      HALF, state.height, HALF, world.colliders);

    if (state.pos.y <= 0) {
      state.pos.y = 0;
      state.vel.y = 0;
      state.onGround = true;
    } else if (state.vel.y !== 0) {
      // Landed on a crate top or still falling: onGround only when y == 0
      // or when the downward move was blocked. Approximate with y == 0.
      state.onGround = false;
    }
  }

  function reset(spawn) {
    state.pos.copy(spawn);
    state.vel.set(0, 0, 0);
    state.yaw = 0; // face north (-Z), toward the sites
    state.pitch = 0;
    state.health = 100;
    state.alive = true;
    state.crouching = false;
    state.height = STAND_HEIGHT;
  }

  return { state, step, look, eye, groundSpeed, reset };
}
