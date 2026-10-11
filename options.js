(async function () {
  "use strict";
  const settings = await NFC.loadSettings();
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ settings ----

  let savedTimer = 0;
  async function persist() {
    await NFC.saveSettings(settings);
    $("saved").classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => $("saved").classList.remove("show"), 1200);
  }

  document.querySelectorAll("[data-key]").forEach((input) => {
    const key = input.dataset.key;
    const out = document.querySelector(`output[data-for="${key}"]`);
    const show = () => out && (out.textContent = input.value);
    if (input.type === "checkbox") input.checked = !!settings[key];
    else input.value = settings[key];
    show();
    input.addEventListener("input", () => {
      settings[key] = input.type === "checkbox" ? input.checked : parseFloat(input.value);
      show();
      persist();
    });
  });

  // -------------------------------------------------------- button icons ----

  const glyphSelect = $("glyphs");
  glyphSelect.value = settings.glyphs || "auto";
  function renderGlyphPreview() {
    const style = glyphSelect.value === "auto" ? NFC.detectGlyphStyle(NFC.getPads()[0]) : glyphSelect.value;
    const items = [["dpad", "Navigate"], ["confirm", "Select"], ["back", "Back"], ["x", "Search"], ["y", "My List"], ["lb+rb", "Scroll row"], ["start", "Help"]];
    $("glyph-preview").innerHTML = items.map(([keys, label]) =>
      `<span class="item">${keys.split("+").map((k) => NFC.glyph(k, style)).join("")}<span>${label}</span></span>`).join("");
  }
  glyphSelect.addEventListener("change", () => { settings.glyphs = glyphSelect.value; renderGlyphPreview(); persist(); });
  renderGlyphPreview();
  window.addEventListener("gamepadconnected", renderGlyphPreview);

  // --------------------------------------------------------- live tester ----

  const chips = {};
  for (const a of NFC.ACTIONS) {
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = a.label;
    $("actions").appendChild(el);
    chips[a.id] = el;
  }

  let wizard = null; // { pad, index, baseline, waitRelease, bindings }

  function describeBinding(b) {
    if (!b) return "-";
    if (b.type === "button") return `button ${b.index}`;
    if (b.type === "axis") return `axis ${b.index}${b.dir > 0 ? "+" : "−"}`;
    return `axis ${b.index} = ${b.value}`;
  }

  function pickPad() {
    const pads = NFC.getPads();
    return pads.find((p) => p.buttons.some((b) => b.pressed)) || pads[0] || null;
  }

  let currentPadId = null;
  function frame() {
    const pad = wizard ? NFC.getPads().find((p) => p.id === wizard.padId) : pickPad();
    if (pad) {
      if (pad.id !== currentPadId) {
        currentPadId = pad.id;
        $("pad-status").className = "status ok";
        $("pad-name").textContent = pad.id;
        const custom = settings.customBindings && settings.customBindings[pad.id];
        $("pad-mapping").textContent = custom
          ? "Using your custom button layout."
          : pad.mapping === "standard"
            ? "Standard layout detected - buttons should work out of the box."
            : "Non-standard layout - using a generic guess. If buttons are wrong, click Remap buttons.";
      }
      const bindings = NFC.bindingsFor(pad, settings);
      for (const a of NFC.ACTIONS) {
        const on = (bindings[a.id] || []).some((b) => NFC.bindingActive(pad, b));
        chips[a.id].classList.toggle("on", on);
      }
      $("raw").innerHTML =
        pad.buttons.map((b, i) => `<span class="${b.pressed ? "on" : ""}">B${i}</span>`).join("") +
        pad.axes.map((v, i) => `<span class="${Math.abs(v) > 0.5 ? "on" : ""}">A${i} ${v.toFixed(2)}</span>`).join("");
      if (wizard) wizardFrame(pad);
    } else if (currentPadId !== null) {
      currentPadId = null;
      $("pad-status").className = "status waiting";
      $("pad-name").textContent = "No controller detected - press any button on your controller.";
      $("pad-mapping").textContent = "";
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // -------------------------------------------------------- remap wizard ----

  function snapshot(pad) {
    return { buttons: pad.buttons.map((b) => b.pressed || b.value > 0.5), axes: pad.axes.slice() };
  }

  function anythingHeld(pad, base) {
    return pad.buttons.some((b, i) => (b.pressed || b.value > 0.5) && !base.buttons[i]) ||
      pad.axes.some((v, i) => Math.abs(v - base.axes[i]) > 0.35);
  }

  function showStep() {
    const a = NFC.ACTIONS[wizard.index];
    $("wizard-step").textContent = `(${wizard.index + 1}/${NFC.ACTIONS.length})  Press: ${a.label}`;
  }

  function nextStep() {
    wizard.index++;
    wizard.waitRelease = true;
    if (wizard.index >= NFC.ACTIONS.length) return finishWizard();
    showStep();
  }

  function wizardFrame(pad) {
    if (wizard.waitRelease) {
      if (!anythingHeld(pad, wizard.baseline)) wizard.waitRelease = false;
      return;
    }
    const base = wizard.baseline;
    let binding = null;
    pad.buttons.forEach((b, i) => {
      if (!binding && (b.pressed || b.value > 0.5) && !base.buttons[i]) binding = { type: "button", index: i };
    });
    if (!binding) {
      pad.axes.forEach((v, i) => {
        if (binding || Math.abs(v - base.axes[i]) < 0.5) return;
        binding = Math.abs(base.axes[i]) < 0.2 && Math.abs(v) > 0.85
          ? { type: "axis", index: i, dir: Math.sign(v) }
          : { type: "axisValue", index: i, value: Math.round(v * 100) / 100 };
      });
    }
    if (binding) {
      const id = NFC.ACTIONS[wizard.index].id;
      wizard.bindings[id] = [binding];
      $("wizard-step").textContent = `${NFC.ACTIONS[wizard.index].label} → ${describeBinding(binding)}`;
      nextStep();
    }
  }

  function startWizard() {
    const pad = pickPad();
    if (!pad) { alert("Press a button on your controller first so Firefox can see it."); return; }
    wizard = { padId: pad.id, index: 0, baseline: snapshot(pad), waitRelease: true, bindings: {} };
    $("wizard").hidden = false;
    showStep();
  }

  async function finishWizard() {
    const { padId, bindings } = wizard;
    // Anything skipped falls back to the default layout for that pad.
    const pad = NFC.getPads().find((p) => p.id === padId);
    const defaults = pad && pad.mapping === "standard" ? NFC.STANDARD_BINDINGS : NFC.GENERIC_BINDINGS;
    for (const a of NFC.ACTIONS) if (!bindings[a.id]) bindings[a.id] = defaults[a.id];
    settings.customBindings = Object.assign({}, settings.customBindings, { [padId]: bindings });
    wizard = null;
    $("wizard").hidden = true;
    currentPadId = null; // refresh status text
    await persist();
  }

  $("remap").addEventListener("click", startWizard);
  $("wizard-skip").addEventListener("click", () => wizard && nextStep());
  $("wizard-cancel").addEventListener("click", () => { wizard = null; $("wizard").hidden = true; });
  $("reset-map").addEventListener("click", async () => {
    const pad = pickPad();
    if (settings.customBindings) {
      if (pad) delete settings.customBindings[pad.id];
      else settings.customBindings = null;
    }
    currentPadId = null;
    await persist();
  });
})();
