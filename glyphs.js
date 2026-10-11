/*
 * Controller button glyphs as inline SVG, drawn from vector paths (no fonts)
 * so they stay crisp at any size. Styles: xbox, playstation, nintendo, generic.
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

  // Geometric letters for face buttons, centred in a 64×64 box.
  const LETTER = {
    A: "M22 45 L32 19 L42 45 M25.5 36 H38.5",
    B: "M24 18.5 V45.5 H33.5 A6.75 6.75 0 0 0 33.5 32 H24 M24 32 H32.5 A6.75 6.75 0 0 0 32.5 18.5 H24",
    X: "M23 19 L41 45 M41 19 L23 45",
    Y: "M22.5 19 L32 32.5 L41.5 19 M32 32.5 V45",
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

  function smallLabel(text, cx, cy, scale, color) {
    const chars = text.split("").map((c) => SMALL[c]);
    const gap = 3;
    const w = chars.reduce((s, c) => s + c[1], 0) + gap * (chars.length - 1);
    let x = 0;
    const paths = chars.map(([d, cw]) => {
      const p = `<path d="${d}" transform="translate(${x} 0)"/>`;
      x += cw + gap;
      return p;
    }).join("");
    return `<g transform="translate(${cx - (w * scale) / 2} ${cy - (16 * scale) / 2}) scale(${scale})"
      fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
  }

  const svg = (body, wide) =>
    `<svg class="nfc-glyph${wide ? " nfc-wide" : ""}" viewBox="0 0 ${wide ? 88 : 64} 64" aria-hidden="true" focusable="false">${body}</svg>`;

  function darkGradient(id) {
    return `<radialGradient id="${id}" cx="50%" cy="28%" r="78%">
      <stop offset="0" stop-color="#505056"/><stop offset=".55" stop-color="#29292e"/><stop offset="1" stop-color="#131316"/>
    </radialGradient>`;
  }

  // Round button body: shadow, gradient fill, rim and a soft top highlight.
  function roundBase(rim, rimWidth = 2.2) {
    const g = nextId();
    return `<defs>${darkGradient(g)}</defs>
      <circle cx="32" cy="33.5" r="29" fill="#000" opacity=".35"/>
      <circle cx="32" cy="32" r="29" fill="url(#${g})"/>
      <circle cx="32" cy="32" r="28" fill="none" stroke="${rim}" stroke-width="${rimWidth}"/>
      <path d="M13 25 A20 20 0 0 1 51 25" fill="none" stroke="#fff" stroke-opacity=".11" stroke-width="5" stroke-linecap="round"/>`;
  }

  const stroke = (color, w = 4.6) =>
    `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

  // ---------------------------------------------------------- face buttons --

  const XBOX_FACE = {
    s: ["A", "#62c932"], e: ["B", "#ff5145"], w: ["X", "#3aa0ff"], n: ["Y", "#ffc624"],
  };
  const NINTENDO_FACE = { s: "B", e: "A", w: "Y", n: "X" };

  function face(pos, style) {
    if (style === "playstation") {
      const c = { s: "#93b9ff", e: "#ff7474", w: "#f6a6d8", n: "#62e2c0" }[pos];
      const shape = {
        s: `<path d="M22.5 22.5 L41.5 41.5 M41.5 22.5 L22.5 41.5" ${stroke(c)}/>`,
        e: `<circle cx="32" cy="32" r="11" ${stroke(c)}/>`,
        w: `<rect x="21.5" y="21.5" width="21" height="21" rx="1.5" ${stroke(c)}/>`,
        n: `<path d="M32 18.5 L44 39.5 H20 Z" ${stroke(c)}/>`,
      }[pos];
      return svg(roundBase("#5e5e66", 1.6) + shape);
    }
    if (style === "nintendo") {
      return svg(roundBase("#6a6a72", 1.6) + `<path d="${LETTER[NINTENDO_FACE[pos]]}" ${stroke("#f2f2f2")}/>`);
    }
    if (style === "generic") {
      const dots = { n: [32, 17], e: [47, 32], s: [32, 47], w: [17, 32] };
      const body = Object.entries(dots).map(([p, [x, y]]) => p === pos
        ? `<circle cx="${x}" cy="${y}" r="7" fill="#fff"/>`
        : `<circle cx="${x}" cy="${y}" r="5.8" fill="none" stroke="#8a8a92" stroke-width="2"/>`).join("");
      return svg(roundBase("#5e5e66", 1.6) + body);
    }
    const [letter, color] = XBOX_FACE[pos];
    return svg(roundBase(color) + `<path d="${LETTER[letter]}" ${stroke(color)}/>`);
  }

  // ---------------------------------------------------------------- d-pad --

  function dpad(active) {
    const g = nextId();
    const arm = (on) => (on ? "#ffffff" : "#45454c");
    return svg(`<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#47474d"/><stop offset="1" stop-color="#1b1b1f"/></linearGradient></defs>
      <path transform="translate(0 1.6)" opacity=".35" fill="#000"
        d="M24 5 H40 Q42 5 42 7 V22 H57 Q59 22 59 24 V40 Q59 42 57 42 H42 V57 Q42 59 40 59 H24 Q22 59 22 57 V42 H7 Q5 42 5 40 V24 Q5 22 7 22 H22 V7 Q22 5 24 5 Z"/>
      <path fill="url(#${g})" stroke="#64646c" stroke-width="1.5"
        d="M24 5 H40 Q42 5 42 7 V22 H57 Q59 22 59 24 V40 Q59 42 57 42 H42 V57 Q42 59 40 59 H24 Q22 59 22 57 V42 H7 Q5 42 5 40 V24 Q5 22 7 22 H22 V7 Q22 5 24 5 Z"/>
      <circle cx="32" cy="32" r="5" fill="#000" opacity=".28"/>
      ${active.up ? '<rect x="23" y="6" width="18" height="17" rx="1.5" fill="#fff" opacity=".13"/>' : ""}
      ${active.down ? '<rect x="23" y="41" width="18" height="17" rx="1.5" fill="#fff" opacity=".13"/>' : ""}
      ${active.left ? '<rect x="6" y="23" width="17" height="18" rx="1.5" fill="#fff" opacity=".13"/>' : ""}
      ${active.right ? '<rect x="41" y="23" width="17" height="18" rx="1.5" fill="#fff" opacity=".13"/>' : ""}
      <path d="M32 10 L37.5 17.5 H26.5 Z" fill="${arm(active.up)}"/>
      <path d="M32 54 L26.5 46.5 H37.5 Z" fill="${arm(active.down)}"/>
      <path d="M10 32 L17.5 26.5 V37.5 Z" fill="${arm(active.left)}"/>
      <path d="M54 32 L46.5 37.5 V26.5 Z" fill="${arm(active.right)}"/>`);
  }

  // ------------------------------------------------------------- shoulders --

  const SHOULDER_LABELS = {
    xbox: { lb: "LB", rb: "RB", lt: "LT", rt: "RT" },
    playstation: { lb: "L1", rb: "R1", lt: "L2", rt: "R2" },
    nintendo: { lb: "L", rb: "R", lt: "ZL", rt: "ZR" },
    generic: { lb: "L1", rb: "R1", lt: "L2", rt: "R2" },
  };

  function shoulder(btn, style) {
    const g = nextId();
    const right = btn === "rb" || btn === "rt";
    const trigger = btn === "lt" || btn === "rt";
    const shape = trigger
      ? "M15 55 V31 Q15 10 37 9 H51 Q73 10 73 31 V55 Q73 58 70 58 H18 Q15 58 15 55 Z"
      : "M8 46 V31 Q8 18.5 22 17.5 L64 15 Q80 14.5 80 28 V46 Q80 50 76 50 H12 Q8 50 8 46 Z";
    const mirror = right ? ` transform="translate(88 0) scale(-1 1)"` : "";
    const label = (SHOULDER_LABELS[style] || SHOULDER_LABELS.xbox)[btn];
    return svg(`<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#55555c"/><stop offset=".5" stop-color="#2c2c31"/><stop offset="1" stop-color="#18181b"/></linearGradient></defs>
      <g${mirror}>
        <path d="${shape}" fill="#000" opacity=".35" transform="translate(0 1.6)"/>
        <path d="${shape}" fill="url(#${g})" stroke="#66666e" stroke-width="1.5"/>
        <path d="${trigger ? "M24 22 Q26 15 37 14.5 H51" : "M15 25 Q17 21.5 24 21 L62 19"}" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="3.5" stroke-linecap="round"/>
      </g>
      ${smallLabel(label, 44, trigger ? 35 : 33, 1.3, "#f2f2f2")}`, true);
  }

  // ---------------------------------------------------------------- sticks --

  function stick(side, variant) {
    const cap = nextId();
    const pressed = variant === "press";
    const chevrons = variant === "move"
      ? `<path d="M26.5 10 L32 5 L37.5 10 M26.5 54 L32 59 L37.5 54" ${stroke("#ffffff", 2.6)}/>` : "";
    return svg(`<defs><radialGradient id="${cap}" cx="45%" cy="35%" r="70%">
        <stop offset="0" stop-color="${pressed ? "#7a7a82" : "#5c5c63"}"/><stop offset="1" stop-color="#232327"/></radialGradient></defs>
      ${roundBase(pressed ? "#ffffff" : "#5e5e66", pressed ? 2.4 : 1.6)}
      <circle cx="32" cy="33" r="18.5" fill="#000" opacity=".35"/>
      <circle cx="32" cy="32" r="18" fill="url(#${cap})" stroke="#7b7b83" stroke-width="1.4"/>
      <circle cx="32" cy="32" r="13.5" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="1.2"/>
      ${chevrons}
      ${smallLabel(side === "l" ? "L" : "R", 32, 32, 1, "#f2f2f2")}`);
  }

  // ------------------------------------------------------------ view / menu --

  function system(btn, style) {
    const isStart = btn === "start";
    if (style === "nintendo") {
      const icon = isStart ? "M23 32 H41 M32 23 V41" : "M23 32 H41";
      return svg(roundBase("#6a6a72", 1.6) + `<path d="${icon}" ${stroke("#f2f2f2", 4)}/>`);
    }
    if (style === "playstation") {
      const g = nextId();
      const icon = isStart
        ? `<path d="M23 25 H41 M23 32 H41 M23 39 H41" ${stroke("#f2f2f2", 3)}/>`
        : `<path d="M32 21 V35 M26.5 26.5 L32 21 L37.5 26.5 M23.5 32 V40.5 H40.5 V32" ${stroke("#f2f2f2", 2.8)}/>`;
      return svg(`<defs>${darkGradient(g)}</defs>
        <rect x="11" y="15.5" width="42" height="35" rx="13" fill="#000" opacity=".35"/>
        <rect x="11" y="14" width="42" height="35" rx="13" fill="url(#${g})" stroke="#64646c" stroke-width="1.5"/>
        <g transform="translate(0 -0.5)">${icon}</g>`);
    }
    // Xbox (and generic): View = two overlapping windows, Menu = three lines.
    const icon = isStart
      ? `<path d="M21 24 H43 M21 32 H43 M21 40 H43" ${stroke("#f2f2f2", 3.2)}/>`
      : `<rect x="18" y="27" width="18" height="14" rx="2.5" ${stroke("#f2f2f2", 2.8)}/>
         <path d="M24.5 27 V23.5 Q24.5 21 27 21 H43.5 Q46 21 46 23.5 V32.5 Q46 35 43.5 35 H36" ${stroke("#f2f2f2", 2.8)}/>`;
    return svg(roundBase("#5e5e66", 1.6) + icon);
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
