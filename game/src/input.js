// Keyboard + mouse + pointer lock input. One job: report what the player did.
export function createInput() {
  const keys = new Set();
  const pressedSet = new Set();
  const look = { dx: 0, dy: 0 };
  const mouse = { down: false, clicked: false };
  let locked = false;
  let lockEl = null;

  const onKeyDown = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressedSet.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onMouseMove = (e) => {
    if (!locked) return;
    look.dx += e.movementX || 0;
    look.dy += e.movementY || 0;
  };
  const onMouseDown = (e) => {
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
  };
  const onMouseUp = (e) => { if (e.button === 0) mouse.down = false; };
  const onLockChange = () => { locked = document.pointerLockElement === lockEl; };
  const onBlur = () => { keys.clear(); mouse.down = false; };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', onBlur);

  return {
    get locked() { return locked; },
    get mouse() { return mouse; },
    isDown(code) { return keys.has(code); },
    // Edge-triggered: true once per physical press; reading it consumes it,
    // so one press fires exactly one action even when the sim runs several
    // substeps per frame. Cleared by endFrame() if never read.
    pressed(code) {
      if (!pressedSet.has(code)) return false;
      pressedSet.delete(code);
      return true;
    },
    // Accumulated mouse movement since the last call (pointer-locked only).
    consumeLook() {
      const out = { dx: look.dx, dy: look.dy };
      look.dx = 0; look.dy = 0;
      return out;
    },
    requestLock(el) {
      lockEl = el;
      el.requestPointerLock();
    },
    exitLock() { document.exitPointerLock(); },
    endFrame() {
      pressedSet.clear();
      mouse.clicked = false;
    },
  };
}
