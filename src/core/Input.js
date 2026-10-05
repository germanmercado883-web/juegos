/** Keyboard + mouse state with pointer lock. */
export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0, leftPressed: false };
    this.locked = false;
    this.enabled = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this._ignoreMouseUntil = 0;
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // browsers can emit one huge bogus delta right when pointer lock engages
      if (performance.now() < this._ignoreMouseUntil) return;
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
      this.mouse.dx += mx;
      this.mouse.dy += my;
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      }
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    element.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this._ignoreMouseUntil = performance.now() + 120;
      this.mouse.dx = this.mouse.dy = 0;
      if (!this.locked) {
        this.mouse.left = this.mouse.right = false;
      }
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    try {
      const p = this.el.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock not available (e.g. headless) */
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Call at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.mouse.leftPressed = false;
  }
}
