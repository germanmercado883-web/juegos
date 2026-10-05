/**
 * On-screen controls for phones and tablets. They drive the same Input
 * object as the keyboard and mouse:
 *  - left half: floating joystick -> WASD (push to the edge to sprint)
 *  - right half: drag to look (mouse delta)
 *  - buttons: fire, aim, jump, crouch, reload, pick up, heal, swap, pause
 */
export const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'];
const LOOK_SENS = 1.5;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.root = document.getElementById('touch');
    this.stick = document.getElementById('touch-stick');
    this.knob = document.getElementById('touch-knob');
    this.moveId = null;
    this.lookId = null;
    this.origin = { x: 0, y: 0 };
    this.last = { x: 0, y: 0 };
    document.body.classList.add('touch');

    const zone = document.getElementById('touch-zone');
    zone.addEventListener('touchstart', (e) => this._start(e), { passive: false });
    zone.addEventListener('touchmove', (e) => this._move(e), { passive: false });
    zone.addEventListener('touchend', (e) => this._end(e), { passive: false });
    zone.addEventListener('touchcancel', (e) => this._end(e), { passive: false });

    this._hold('tb-fire', () => {
      this.input.mouse.left = true;
      this.input.mouse.leftPressed = true;
    }, () => (this.input.mouse.left = false), true);
    this._tap('tb-aim', () => (this.input.mouse.right = !this.input.mouse.right));
    this._tap('tb-jump', () => this._press('Space'));
    this._tap('tb-crouch', () => this._press('KeyC'));
    this._tap('tb-reload', () => this._press('KeyR'));
    this._tap('tb-pick', () => this._press('KeyE'));
    this._tap('tb-heal', () => this._press('KeyH'));
    this._tap('tb-nade', () => this._press('KeyG'));
    this._tap('tb-swap', () => this._press('KeyQ'));
    this._tap('tb-pause', () => game.pause());
  }

  show(on) {
    this.root.classList.toggle('on', on);
    if (!on) this._releaseAll();
  }

  _press(code) {
    if (!this.input.enabled) return;
    this.input.pressed.add(code);
  }

  _tap(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('down');
      fn();
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      el.classList.remove('down');
    }, { passive: false });
  }

  /** Hold button; with look=true, dragging the finger also aims. */
  _hold(id, down, up, look = false) {
    const el = document.getElementById(id);
    let tid = null;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      tid = t.identifier;
      this.last = { x: t.clientX, y: t.clientY };
      el.classList.add('down');
      down();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!look) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== tid) continue;
        this.input.mouse.dx += (t.clientX - this.last.x) * LOOK_SENS;
        this.input.mouse.dy += (t.clientY - this.last.y) * LOOK_SENS;
        this.last = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === tid) tid = null;
      if (tid === null) {
        el.classList.remove('down');
        up();
      }
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  _start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.42 && this.moveId === null) {
        this.moveId = t.identifier;
        this.origin = { x: t.clientX, y: t.clientY };
        this.stick.style.left = `${t.clientX}px`;
        this.stick.style.top = `${t.clientY}px`;
        this.stick.classList.add('on');
        this.knob.style.transform = 'translate(-50%, -50%)';
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.last = { x: t.clientX, y: t.clientY };
      }
    }
  }

  _move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        const R = 56;
        let dx = t.clientX - this.origin.x;
        let dy = t.clientY - this.origin.y;
        const len = Math.hypot(dx, dy);
        const k = len > R ? R / len : 1;
        dx *= k;
        dy *= k;
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this._setMove(dx / R, dy / R, len > R * 1.25);
      } else if (t.identifier === this.lookId) {
        this.input.mouse.dx += (t.clientX - this.last.x) * LOOK_SENS;
        this.input.mouse.dy += (t.clientY - this.last.y) * LOOK_SENS;
        this.last = { x: t.clientX, y: t.clientY };
      }
    }
  }

  _end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        this.moveId = null;
        this.stick.classList.remove('on');
        this._setMove(0, 0, false);
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  _setMove(x, y, sprint) {
    const keys = this.input.keys;
    const set = (code, on) => (on ? keys.add(code) : keys.delete(code));
    const dead = 0.3;
    set('KeyW', y < -dead);
    set('KeyS', y > dead);
    set('KeyA', x < -dead);
    set('KeyD', x > dead);
    set('ShiftLeft', sprint && y < -dead);
  }

  _releaseAll() {
    for (const k of MOVE_KEYS) this.input.keys.delete(k);
    this.input.mouse.left = this.input.mouse.right = false;
    this.moveId = this.lookId = null;
    this.stick?.classList.remove('on');
  }
}
