/*
 * Controller button glyphs: flat, single-colour shapes with the lettering
 * stamped out (an SVG mask makes the letters transparent, so the page shows
 * through). Colour comes from CSS `currentColor`. Styles: xbox, playstation,
 * nintendo, generic.
 *
 *   NFC.glyph(button, style) -> "<svg ...>"
 *   button: confirm | back | x | y | lb | rb | lt | rt | select | start |
 *           l3 | rs | dpad | dpad-h | dpad-v
 */
(function (global) {
  "use strict";

  let uid = 0;
  const nextId = () => `nfcg${++uid}`;

  // Face buttons by physical position (W3C standard mapping).
  const FACE_POS = { confirm: "s", back: "e", x: "w", y: "n" };

  // Geometric letters, centred in a 64×64 box.
  const LETTER = {
    A: "M22.5 44.5 L32 19.5 L41.5 44.5 M25.8 36 H38.2",
    B: "M24.5 19 V45 H33.5 A6.5 6.5 0 0 0 33.5 32 H24.5 M24.5 32 H32.5 A6.5 6.5 0 0 0 32.5 19 H24.5",
    X: "M23.5 19.5 L40.5 44.5 M40.5 19.5 L23.5 44.5",
    Y: "M23 19.5 L32 32.5 L41 19.5 M32 32.5 V44.5",
  };

  // Small letters for shoulder/stick labels, in a 16-unit-tall cell: [path, width].
  const SMALL = {
    L: ["M1 0 V16 H9", 10],
    R: ["M1 16 V0 H6 A4.25 4.25 0 0 1 6 8.5 H1 M5.5 8.5 L9.5 16", 10.5],
    B: ["M1 0 V16 H6.5 A4 4 0 0 0 6.5 8 H1 M1 8 H6 A4 4 0 0 0 6 0 H1", 10.5],
    T: ["M0 0 H10 M5 0 V16", 10],
    Z: ["M0.5 0 H9.5 L0.5 16 H9.5", 10],
    1: ["M2 3.5 L6 0 V16", 8],
    2: ["M0.8 4.2 A4.3 4.2 0 1 1 8.2 7.4 L0.5 16 H9.5", 10],
  };

  // Everything drawn inside a mask is a cut-out: black = transparent.
  const cut = (w = 5) => `fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

  function smallLabel(text, cx, cy, scale) {
    const chars = text.split("").map((c) => SMALL[c]);
    const gap = 3;
    const w = chars.reduce((s, c) => s + c[1], 0) + gap * (chars.length - 1);
    let x = 0;
    const paths = chars.map(([d, cw]) => {
      const p = `<path d="${d}" transform="translate(${x} 0)"/>`;
      x += cw + gap;
      return p;
    }).join("");
    return `<g transform="translate(${cx - (w * scale) / 2} ${cy - (16 * scale) / 2}) scale(${scale})" ${cut(2.4 / scale)}>${paths}</g>`;
  }

  const svg = (body, wide) =>
    `<svg class="nfc-glyph${wide ? " nfc-wide" : ""}" viewBox="0 0 ${wide ? 88 : 64} 64" aria-hidden="true" focusable="false">${body}</svg>`;

  // A solid shape with `cutout` stamped out of it.
  function stamped(shape, cutout, wide) {
    const id = nextId();
    return svg(`<mask id="${id}"><rect width="100%" height="100%" fill="#fff"/>${cutout}</mask>
      <g fill="currentColor" mask="url(#${id})">${shape}</g>`, wide);
  }

  const DISC = `<circle cx="32" cy="32" r="27"/>`;
  const RING = `<path fill-rule="evenodd" d="M32 5 A27 27 0 1 0 32 59 A27 27 0 1 0 32 5 Z M32 11.5 A20.5 20.5 0 1 1 32 52.5 A20.5 20.5 0 1 1 32 11.5 Z"/>`;

  // ---------------------------------------------------------- face buttons --

  const XBOX_FACE = { s: "A", e: "B", w: "X", n: "Y" };
  const NINTENDO_FACE = { s: "B", e: "A", w: "Y", n: "X" };

  function face(pos, style) {
    if (style === "playstation") {
      const shape = {
        s: `<path d="M22.5 22.5 L41.5 41.5 M41.5 22.5 L22.5 41.5" ${cut(5)}/>`,
        e: `<circle cx="32" cy="32" r="10.5" ${cut(5)}/>`,
        w: `<rect x="22" y="22" width="20" height="20" rx="1.5" ${cut(5)}/>`,
        n: `<path d="M32 19.5 L43.5 39.5 H20.5 Z" ${cut(5)}/>`,
      }[pos];
      return stamped(DISC, shape);
    }
    if (style === "generic") {
      // Button position: the one that matters is a hole, the others faint dimples.
      const dots = { n: [32, 18], e: [46, 32], s: [32, 46], w: [18, 32] };
      const body = Object.entries(dots).map(([p, [x, y]]) =>
        `<circle cx="${x}" cy="${y}" r="${p === pos ? 6.5 : 4}" fill="${p === pos ? "#000" : "#999"}"/>`).join("");
      return stamped(DISC, body);
    }
    const letter = (style === "nintendo" ? NINTENDO_FACE : XBOX_FACE)[pos];
    return stamped(DISC, `<path d="${LETTER[letter]}" ${cut(5.5)}/>`);
  }

  // ---------------------------------------------------------------- d-pad --

  const CROSS = `<path d="M24 4 H40 Q42.5 4 42.5 6.5 V21.5 H57.5 Q60 21.5 60 24 V40 Q60 42.5 57.5 42.5 H42.5 V57.5 Q42.5 60 40 60 H24 Q21.5 60 21.5 57.5 V42.5 H6.5 Q4 42.5 4 40 V24 Q4 21.5 6.5 21.5 H21.5 V6.5 Q21.5 4 24 4 Z"/>`;

  function dpad(active) {
    // Active directions are stamped right through; inactive ones only dented.
    const arm = (on) => (on ? "#000" : "#8a8a8a");
    return stamped(CROSS, `
      <path d="M32 9.5 L38 17.5 H26 Z" fill="${arm(active.up)}"/>
      <path d="M32 54.5 L26 46.5 H38 Z" fill="${arm(active.down)}"/>
      <path d="M9.5 32 L17.5 26 V38 Z" fill="${arm(active.left)}"/>
      <path d="M54.5 32 L46.5 38 V26 Z" fill="${arm(active.right)}"/>`);
  }

  // ------------------------------------------------------------- shoulders --

  const SHOULDER_LABELS = {
    xbox: { lb: "LB", rb: "RB", lt: "LT", rt: "RT" },
    playstation: { lb: "L1", rb: "R1", lt: "L2", rt: "R2" },
    nintendo: { lb: "L", rb: "R", lt: "ZL", rt: "ZR" },
    generic: { lb: "L1", rb: "R1", lt: "L2", rt: "R2" },
  };

  function shoulder(btn, style) {
    const right = btn === "rb" || btn === "rt";
    const trigger = btn === "lt" || btn === "rt";
    const shape = trigger
      ? "M16 54 V30 Q16 11 36 10 H52 Q72 11 72 30 V54 Q72 57 69 57 H19 Q16 57 16 54 Z"
      : "M9 45 V31 Q9 19.5 22.5 18.5 L63 16 Q79 15.5 79 28.5 V45 Q79 49 75 49 H13 Q9 49 9 45 Z";
    const mirror = right ? ` transform="translate(88 0) scale(-1 1)"` : "";
    const label = (SHOULDER_LABELS[style] || SHOULDER_LABELS.xbox)[btn];
    return stamped(`<path d="${shape}"${mirror}/>`, smallLabel(label, 44, trigger ? 35 : 33, 1.25), true);
  }

  // ---------------------------------------------------------------- sticks --

  function stick(side, variant) {
    const pressed = variant === "press";
    const chevrons = variant === "move"
      ? `<path d="M27 9.5 L32 4.5 L37 9.5 M27 54.5 L32 59.5 L37 54.5" ${cut(3)}/>` : "";
    const shape = pressed ? DISC : RING + `<circle cx="32" cy="32" r="15"/>`;
    return stamped(shape, smallLabel(side === "l" ? "L" : "R", 32, 32, 1.05) + chevrons);
  }

  // ------------------------------------------------------------ view / menu --

  function system(btn, style) {
    const isStart = btn === "start";
    let icon;
    if (style === "nintendo") {
      icon = `<path d="${isStart ? "M23 32 H41 M32 23 V41" : "M23 32 H41"}" ${cut(4.5)}/>`;
    } else if (style === "playstation") {
      icon = isStart
        ? `<path d="M23 25.5 H41 M23 32 H41 M23 38.5 H41" ${cut(3.2)}/>`
        : `<path d="M32 21.5 V35 M26.5 27 L32 21.5 L37.5 27 M23.5 32 V40.5 H40.5 V32" ${cut(3)}/>`;
    } else {
      // Xbox (and generic): View = two overlapping windows, Menu = three lines.
      icon = isStart
        ? `<path d="M21.5 24.5 H42.5 M21.5 32 H42.5 M21.5 39.5 H42.5" ${cut(3.4)}/>`
        : `<rect x="18.5" y="27.5" width="17" height="13" rx="2" ${cut(3)}/>
           <path d="M25 27.5 V24 Q25 21.5 27.5 21.5 H43 Q45.5 21.5 45.5 24 V33 Q45.5 35.5 43 35.5 H35.5" ${cut(3)}/>`;
    }
    return stamped(DISC, icon);
  }

  // ------------------------------------------------------------------ api --

  function glyph(btn, style = "xbox") {
    if (FACE_POS[btn]) return face(FACE_POS[btn], style);
    switch (btn) {
      case "dpad": return dpad({ up: 1, down: 1, left: 1, right: 1 });
      case "dpad-h": return dpad({ left: 1, right: 1 });
      case "dpad-v": return dpad({ up: 1, down: 1 });
      case "lb": case "rb": case "lt": case "rt": return shoulder(btn, style);
      case "select": case "start": return system(btn, style);
      case "l3": return stick("l", "press");
      case "rs": return stick("r", "move");
      default: return "";
    }
  }

  // Guess the glyph family from the Gamepad API id string.
  function detectGlyphStyle(pad) {
    if (!pad) return "xbox";
    const id = (pad.id || "").toLowerCase();
    if (/054c|playstation|dualshock|dualsense|wireless controller/.test(id)) return "playstation";
    if (/057e|nintendo|pro controller|joy-con/.test(id)) return "nintendo";
    if (pad.mapping !== "standard" && !/xinput|xbox|045e/.test(id)) return "generic";
    return "xbox";
  }

  global.NFC = Object.assign(global.NFC || {}, { glyph, detectGlyphStyle });
})(typeof window !== "undefined" ? window : this);
