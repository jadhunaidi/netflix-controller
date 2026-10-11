/*
 * Shared gamepad layer used by both the Netflix content script and the
 * options page. Turns raw Gamepad API state into logical "actions"
 * (up/down/confirm/back/...) with edge detection and hold-to-repeat.
 */
(function (global) {
  "use strict";

  // Logical actions, in the order the remap wizard asks for them.
  const ACTIONS = [
    { id: "up", label: "D-pad Up" },
    { id: "down", label: "D-pad Down" },
    { id: "left", label: "D-pad Left" },
    { id: "right", label: "D-pad Right" },
    { id: "confirm", label: "A / Cross (select)" },
    { id: "back", label: "B / Circle (back)" },
    { id: "x", label: "X / Square" },
    { id: "y", label: "Y / Triangle" },
    { id: "lb", label: "Left bumper (LB / L1)" },
    { id: "rb", label: "Right bumper (RB / R1)" },
    { id: "lt", label: "Left trigger (LT / L2)" },
    { id: "rt", label: "Right trigger (RT / R2)" },
    { id: "select", label: "View / Select / Share" },
    { id: "start", label: "Menu / Start / Options" },
    { id: "l3", label: "Left stick click (L3)" },
    { id: "r3", label: "Right stick click (R3)" },
  ];

  const btn = (index) => ({ type: "button", index });

  // W3C "standard" mapping - what Firefox reports for XInput pads
  // (Xbox, 8BitDo in X-input mode, most PC pads) and DualShock/DualSense.
  const STANDARD_BINDINGS = {
    confirm: [btn(0)], back: [btn(1)], x: [btn(2)], y: [btn(3)],
    lb: [btn(4)], rb: [btn(5)], lt: [btn(6)], rt: [btn(7)],
    select: [btn(8)], start: [btn(9)], l3: [btn(10)], r3: [btn(11)],
    up: [btn(12)], down: [btn(13)], left: [btn(14)], right: [btn(15)],
  };

  // Best guess for DirectInput pads with no standard mapping. Users can
  // fix anything wrong with the remap wizard on the options page.
  const GENERIC_BINDINGS = {
    confirm: [btn(1)], back: [btn(2)], x: [btn(0)], y: [btn(3)],
    lb: [btn(4)], rb: [btn(5)], lt: [btn(6)], rt: [btn(7)],
    select: [btn(8)], start: [btn(9)], l3: [btn(10)], r3: [btn(11)],
    up: [btn(12), { type: "axisValue", index: 9, value: -1 }],
    down: [btn(13), { type: "axisValue", index: 9, value: 0.14 }],
    left: [btn(14), { type: "axisValue", index: 9, value: 0.71 }],
    right: [btn(15), { type: "axisValue", index: 9, value: -0.43 }],
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    deadzone: 0.35,          // analog stick deadzone
    repeatDelay: 380,        // ms before a held direction starts repeating
    repeatRate: 110,         // ms between repeats
    seekSmall: 10,           // seconds, D-pad left/right in player
    seekLarge: 30,           // seconds, bumpers in player
    volumeStep: 0.1,
    showHints: true,         // controls bar along the bottom
    glyphs: "auto",          // button icons: auto | xbox | playstation | nintendo | generic
    tvMode: true,            // TV-style focus, info panel, fixed row, no hover pop-ups
    customBindings: null,    // { [gamepadId]: { action: [binding, ...] } }
  };

  async function loadSettings() {
    try {
      const stored = await browser.storage.local.get("settings");
      return Object.assign({}, DEFAULT_SETTINGS, stored.settings || {});
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  async function saveSettings(settings) {
    await browser.storage.local.set({ settings });
  }

  function bindingsFor(pad, settings) {
    const custom = settings.customBindings && settings.customBindings[pad.id];
    if (custom) return custom;
    return pad.mapping === "standard" ? STANDARD_BINDINGS : GENERIC_BINDINGS;
  }

  function bindingActive(pad, b) {
    if (b.type === "button") {
      const button = pad.buttons[b.index];
      return !!button && (button.pressed || button.value > 0.5);
    }
    if (b.type === "axis") {
      const v = pad.axes[b.index];
      return v !== undefined && v * b.dir > 0.5;
    }
    if (b.type === "axisValue") {
      const v = pad.axes[b.index];
      return v !== undefined && Math.abs(v - b.value) < 0.1;
    }
    return false;
  }

  function getPads() {
    let pads = [];
    try {
      pads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []);
    } catch (e) { /* gamepad API disabled */ }
    return pads.filter((p) => p && p.connected);
  }

  /**
   * Polls all connected pads every animation frame and emits:
   *   onAction(actionId, { repeat })  - on press, and on repeat for directions
   *   onStick({ lx, ly, rx, ry })      - analog values past the deadzone, every frame
   */
  class GamepadInput {
    constructor(settings, handlers) {
      this.settings = settings;
      this.handlers = handlers;
      this.state = {};        // actionId -> { down, since, lastRepeat }
      this.running = false;
      this.activePadId = null;
      this._tick = this._tick.bind(this);
    }

    start() {
      if (this.running) return;
      this.running = true;
      requestAnimationFrame(this._tick);
    }

    stop() { this.running = false; }

    _tick(now) {
      if (!this.running) return;
      try { this._poll(now); } catch (e) { console.error("[NetflixController]", e); }
      requestAnimationFrame(this._tick);
    }

    _poll(now) {
      const pads = getPads();
      const s = this.settings;
      const active = {};
      let lx = 0, ly = 0, rx = 0, ry = 0;

      for (const pad of pads) {
        const bindings = bindingsFor(pad, s);
        for (const action of Object.keys(bindings)) {
          if (bindings[action].some((b) => bindingActive(pad, b))) {
            active[action] = true;
            this.activePadId = pad.id;
          }
        }
        const dz = (v) => (Math.abs(v || 0) > s.deadzone ? v : 0);
        lx = lx || dz(pad.axes[0]); ly = ly || dz(pad.axes[1]);
        rx = rx || dz(pad.axes[2]); ry = ry || dz(pad.axes[3]);
      }

      // Left stick doubles as a D-pad.
      if (Math.abs(lx) > 0.6 || Math.abs(ly) > 0.6) {
        if (Math.abs(lx) > Math.abs(ly)) active[lx > 0 ? "right" : "left"] = true;
        else active[ly > 0 ? "down" : "up"] = true;
      }

      const repeatable = { up: 1, down: 1, left: 1, right: 1, lt: 1, rt: 1 };
      for (const { id } of ACTIONS) {
        const st = this.state[id] || (this.state[id] = { down: false, since: 0, lastRepeat: 0 });
        if (active[id] && !st.down) {
          st.down = true; st.since = now; st.lastRepeat = now;
          this.handlers.onAction && this.handlers.onAction(id, { repeat: false });
        } else if (active[id] && st.down && repeatable[id]) {
          if (now - st.since > s.repeatDelay && now - st.lastRepeat > s.repeatRate) {
            st.lastRepeat = now;
            this.handlers.onAction && this.handlers.onAction(id, { repeat: true });
          }
        } else if (!active[id] && st.down) {
          st.down = false;
        }
      }

      if (this.handlers.onStick && (rx || ry || lx || ly)) {
        this.handlers.onStick({ lx, ly, rx, ry });
      }
    }
  }

  global.NFC = {
    ACTIONS, STANDARD_BINDINGS, GENERIC_BINDINGS, DEFAULT_SETTINGS,
    loadSettings, saveSettings, bindingsFor, bindingActive, getPads, GamepadInput,
  };
})(typeof window !== "undefined" ? window : this);
