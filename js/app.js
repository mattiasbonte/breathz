/* breathz — app logic. No framework, no build step, no backend.
   Everything lives in this browser (localStorage) or in a share URL. */
(() => {
  "use strict";

  // ---------------------------------------------------------- utilities

  const $ = (id) => document.getElementById(id);
  const LS_SEQS = "breathz.sequences";
  const LS_SOUND = "breathz.sound";
  const LS_HAPTICS = "breathz.haptics";
  const LS_VOL = "breathz.volume";
  const LS_STYLE = "breathz.style";
  const LS_LAST = "breathz.lastSeq";
  const LS_JOURNAL = "breathz.journal";
  const LS_FAVS = "breathz.favorites";
  const LS_INTENTION = "breathz.intention";
  const LS_VISION = "breathz.visionImage";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const KIND_LABEL = { inhale: "in", hold: "hold", exhale: "out" };
  const KIND_SHORT = { inhale: "in", hold: "hold", exhale: "out" };

  // pure data logic lives in js/model.js (window.BreathModel)
  const M = window.BreathModel;
  const { fmtSecs, fmtCycles, fmtDuration, segmentsOf, isProgram,
          practiceDuration, practiceMeta, seqToText, textToSeq } = M;
  const seqDuration = practiceDuration;
  const validateSequence = M.validatePractice;

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function readLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  // ---------------------------------------------------------- practices

  const PRESETS = [
    { name: "Box Breathing", style: "box", cycles: 10,
      description: "Equal four-count breathing used by Navy SEALs to stay calm and focused. Inhale, hold, exhale, hold — each for 4 seconds.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }, { kind: "hold", seconds: 4 }] },
    { name: "4-7-8 Relaxing Breath", style: "bloom", cycles: 6,
      description: "Dr. Andrew Weil's tranquilizing breath. Great before sleep: inhale 4, hold 7, exhale slowly for 8.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 7 }, { kind: "exhale", seconds: 8 }] },
    { name: "Physiological Sigh", style: "orb", cycles: 6,
      description: "Two stacked inhales then a long sigh out — the fastest known way to calm a spiking nervous system.",
      phases: [{ kind: "inhale", seconds: 2.5 }, { kind: "inhale", seconds: 1 }, { kind: "exhale", seconds: 6 }] },
    { name: "Coherent Breathing", style: "sway", cycles: 15,
      description: "Slow, even breathing at ~5.5 breaths per minute to balance the nervous system and improve HRV.",
      phases: [{ kind: "inhale", seconds: 5.5 }, { kind: "exhale", seconds: 5.5 }] },
    { name: "Extended Exhale", style: "column", cycles: 12,
      description: "Exhaling longer than you inhale activates the parasympathetic system. Simple and effective stress relief.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
    { name: "Deep Sleep 4-8", style: "beacon", cycles: 12,
      description: "Exhaling twice as long as you inhale. A simple 2:1 rhythm that eases the body toward sleep.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 8 }] },
    { name: "Triangle Breathing", style: "triangle", cycles: 10,
      description: "A gentler cousin of box breathing: inhale, hold, exhale — three sides, four counts each.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }] },
    { name: "Equal Breathing", style: "rings", cycles: 15,
      description: "Sama Vritti — even, unforced breaths to steady attention and restore balance.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 4 }] },
    { name: "Wind Down", style: "cosmos", cycles: 8,
      description: "A slow settling pattern: deep inhale, brief pause, long releasing exhale.",
      phases: [{ kind: "inhale", seconds: 5 }, { kind: "hold", seconds: 1.5 }, { kind: "exhale", seconds: 8 }] },
    { name: "Ujjayi Pace", style: "tide", cycles: 12,
      description: "Slow oceanic yoga breathing: long steady inhales and exhales through the nose with a soft throat constriction.",
      phases: [{ kind: "inhale", seconds: 6 }, { kind: "exhale", seconds: 6 }] },
    { name: "Energize", style: "mandala", cycles: 20,
      description: "Faster rhythmic breathing to wake up body and mind. Stop if you feel light-headed.",
      phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 2 }] },
    { name: "Nadi Shodhana Pace", style: "sway", cycles: 12,
      description: "The timing of yogic alternate-nostril breathing: close one nostril, inhale, hold, exhale through the other, then switch sides each cycle. Balancing and clarifying.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
    { name: "Sufi Heart Rhythm", style: "mandala", cycles: 12,
      description: "Even, devotional breathing in the Sufi manner — steady counts with a soft pause at each turn, attention resting in the heart.",
      phases: [{ kind: "inhale", seconds: 5 }, { kind: "hold", seconds: 1 }, { kind: "exhale", seconds: 5 }, { kind: "hold", seconds: 1 }] },
    { name: "Rhythmic Journey", style: "cosmos", cycles: 40,
      description: "Shamanic-style connected breathing: no pauses, like breathing to a steady drum. Sit or lie down, and return to normal breath if you feel dizzy or tingly.",
      phases: [{ kind: "inhale", seconds: 2.5 }, { kind: "exhale", seconds: 2.5 }] },
    { name: "Bhastrika Bellows", style: "column", cycles: 30,
      description: "Yogic bellows breath — vigorous equal in and out through the nose. Practice seated on an empty stomach and stop at any dizziness. Not during pregnancy or with high blood pressure.",
      phases: [{ kind: "inhale", seconds: 1 }, { kind: "exhale", seconds: 1 }] },
    { name: "Kapalabhati Pace", style: "rings", cycles: 30,
      description: "Skull-shining breath: a passive inhale, then a short sharp exhale from the belly. A cleansing yogic kriya — seated, empty stomach, stop at any dizziness.",
      phases: [{ kind: "inhale", seconds: 1.5 }, { kind: "exhale", seconds: 0.5 }] },
    { name: "Buteyko Soft Breath", style: "beacon", cycles: 15,
      description: "Reduced, gentle nasal breathing with a relaxed pause after the exhale — the Buteyko way to quiet over-breathing and air hunger.",
      phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 3 }, { kind: "hold", seconds: 3 }] },
    { name: "Kumbhaka 1-4-2", style: "triangle", cycles: 5,
      description: "The classical pranayama ratio: hold four times the inhale, exhale twice it. Advanced — build up gently and never strain the hold.",
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 16 }, { kind: "exhale", seconds: 8 }] },
    { name: "Power Rounds", style: "cosmos",
      description: "Three rounds of deep rhythmic breathing, each ending in a long hold on empty lungs — release whenever your body asks — and a 15-second recovery hold. Powerful and intense. Only seated or lying down, never in or near water, never while driving. Stop at any strong dizziness.",
      segments: [
        { title: "round 1 · 30 deep breaths", cycles: 30, phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "hold on empty — release when you must", cycles: 1, phases: [{ kind: "hold", seconds: 60, open: true }] },
        { title: "recovery breath", cycles: 1, phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 3 }] },
        { title: "round 2 · 30 deep breaths", cycles: 30, phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "hold on empty", cycles: 1, phases: [{ kind: "hold", seconds: 75, open: true }] },
        { title: "recovery breath", cycles: 1, phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 3 }] },
        { title: "round 3 · 30 deep breaths", cycles: 30, phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "final hold on empty", cycles: 1, phases: [{ kind: "hold", seconds: 90, open: true }] },
        { title: "recovery — rest in the after-glow", cycles: 1, phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 4 }] },
      ] },
    { name: "Deep Hold Ladder", style: "moon",
      description: "Breath-hold training: easy breathing between progressively longer holds after a full inhale, ending with one open hold for as long as feels comfortable. Builds CO₂ tolerance gently — seated only, never strain, never practice holds in water.",
      segments: [
        { title: "settle", cycles: 4, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "hold · 30", cycles: 1, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 30 }, { kind: "exhale", seconds: 8 }] },
        { title: "breathe easy", cycles: 3, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "hold · 45", cycles: 1, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 45 }, { kind: "exhale", seconds: 8 }] },
        { title: "breathe easy", cycles: 3, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "long hold — as long as comfortable", cycles: 1, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 60, open: true }, { kind: "exhale", seconds: 8 }] },
        { title: "soften", cycles: 4, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 8 }] },
      ] },
    { name: "Full Journey", style: "veil",
      description: "A complete session arc: arrive with coherent breathing, deepen with long exhales, find stillness in the square, and return. A ready-made ten-minute class.",
      segments: [
        { title: "arrive", cycles: 8, phases: [{ kind: "inhale", seconds: 5.5 }, { kind: "exhale", seconds: 5.5 }] },
        { title: "deepen", cycles: 12, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "stillness", cycles: 6, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }, { kind: "hold", seconds: 4 }] },
        { title: "return", cycles: 4, phases: [{ kind: "inhale", seconds: 5.5 }, { kind: "exhale", seconds: 5.5 }] },
      ] },
  ].map((p) => ({ ...p, source: "preset" }));

  // Feeling-based selection. Practices are matched by exact preset name.
  const MOODS = [
    { id: "anxious", label: "anxious",
      note: "Long exhales and the physiological sigh switch on the body's own calming reflex.",
      practices: ["Physiological Sigh", "Extended Exhale", "4-7-8 Relaxing Breath"] },
    { id: "stressed", label: "stressed",
      note: "Steady, square rhythms give a racing mind one simple thing to hold on to.",
      practices: ["Box Breathing", "Coherent Breathing", "Extended Exhale"] },
    { id: "sleepless", label: "can't sleep",
      note: "Exhaling far longer than you inhale tells the body it's safe to power down.",
      practices: ["4-7-8 Relaxing Breath", "Deep Sleep 4-8", "Wind Down"] },
    { id: "tired", label: "low energy",
      note: "Brisk, even breaths gently raise alertness. Stop if you feel light-headed.",
      practices: ["Energize", "Bhastrika Bellows", "Kapalabhati Pace"] },
    { id: "scattered", label: "unfocused",
      note: "Counting edges and corners anchors attention back in the body.",
      practices: ["Box Breathing", "Triangle Breathing", "Nadi Shodhana Pace"] },
    { id: "balanced", label: "balanced",
      note: "Coherent breathing keeps a good day steady — about five and a half breaths a minute.",
      practices: ["Coherent Breathing", "Equal Breathing", "Ujjayi Pace"] },
    { id: "deep", label: "going deeper",
      note: "Older traditions — yogic, Sufi, shamanic — used breath as a doorway. Take these slowly and seated.",
      practices: ["Power Rounds", "Deep Hold Ladder", "Sufi Heart Rhythm", "Nadi Shodhana Pace", "Rhythmic Journey", "Kumbhaka 1-4-2", "Buteyko Soft Breath"] },
  ];

  const state = {
    local: [],      // this-device sequences
    favs: [],       // favorited preset names
    current: null,  // sequence shown in preview / session
    editing: null,  // sequence being edited in builder
    mood: null,     // selected mood id (per visit, deliberately not persisted)
    lastCardIndex: 0,
  };

  function loadLocal() {
    state.local = readLS(LS_SEQS, []);
    state.favs = readLS(LS_FAVS, []);
  }
  function saveLocal() { localStorage.setItem(LS_SEQS, JSON.stringify(state.local)); }

  function isFav(seq) { return seq.source === "preset" && state.favs.includes(seq.name); }
  function toggleFav(seq) {
    const i = state.favs.indexOf(seq.name);
    if (i >= 0) state.favs.splice(i, 1);
    else state.favs.push(seq.name);
    localStorage.setItem(LS_FAVS, JSON.stringify(state.favs));
  }

  function homeSeq() {
    const last = readLS(LS_LAST, null);
    if (last && !validateSequence(last)) return last;
    return PRESETS[0];
  }

  // ---------------------------------------------------------- journal

  function journal() { return readLS(LS_JOURNAL, []); }
  function journalAdd(entry) {
    const j = journal();
    j.push(entry);
    localStorage.setItem(LS_JOURNAL, JSON.stringify(j.slice(-300)));
  }
  function journalSetLastMood(mood) {
    const j = journal();
    if (j.length) {
      j[j.length - 1].mood = mood;
      localStorage.setItem(LS_JOURNAL, JSON.stringify(j));
    }
  }


  // ---------------------------------------------------------- share links
  // #s=i4-h4-e4-h4&c=10&n=Box%20Breathing&v=orb — the whole experience in a URL.

  function encodeShare(seq) {
    const hash = M.encodeShare(seq, {
      style: seq.style || currentStyleId,
      intention: seq.intention ?? localStorage.getItem(LS_INTENTION) ?? undefined,
    });
    return `${window.location.origin}${window.location.pathname}${hash}`;
  }

  function validStyleId(id) {
    return id && window.BreathStyles.some((s) => s.id === id) ? id : null;
  }

  function decodeShare(hash) {
    return M.decodeShare(hash, validStyleId);
  }

  // ---------------------------------------------------------- audio cues

  const audio = {
    ctx: null,
    enabled: localStorage.getItem(LS_SOUND) === "1",
    // 0..2 — up to 1 is the comfortable range, above overcranks the cue gain
    volume: (() => {
      const v = parseFloat(localStorage.getItem(LS_VOL));
      return isFinite(v) ? Math.min(2, Math.max(0, v)) : 0.6;
    })(),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.enabled = false; return; }
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    // Directional cues: inhale glides up, exhale glides down, hold is a
    // level suspended shimmer (two barely-detuned tones beating slowly).
    cue(kind, stacked) {
      if (!this.enabled || this.volume <= 0) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const peak = 0.13 * this.volume;

      // one soft bell note with the same gentle envelope as the original cues
      const note = (freq, at, level, decay = 1.3) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(level, at + 0.18);
        g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        o.connect(g).connect(this.ctx.destination);
        o.start(at); o.stop(at + decay + 0.1);
      };

      if (kind === "inhale") {
        if (stacked) { note(392, t, peak * 0.9, 0.9); return; } // one short sip on top (G4)
        // two warm notes stepping up — direction without a siren-like sweep
        note(261.63, t, peak * 0.7);         // C4…
        note(329.63, t + 0.22, peak);        // …E4
        return;
      } else if (kind === "exhale") {
        if (stacked) { note(233.08, t, peak * 0.9, 1.1); return; } // short settling Bb3
        note(329.63, t, peak * 0.7);         // E4…
        note(261.63, t + 0.26, peak, 1.6);   // …settling on C4
        return;
      } else {
        // hold: two barely-detuned tones beating slowly over a level plateau
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        osc.type = osc2.type = "sine";
        osc.connect(gain);
        osc2.connect(gain);
        osc.frequency.value = 329.63;  // E4
        osc2.frequency.value = 331.2;  // slightly sharp → ~1.6 Hz beat, "held" stillness
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peak * 0.8, t + 0.3);
        gain.gain.setValueAtTime(peak * 0.8, t + 0.9);                 // level plateau
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        osc.start(t); osc.stop(t + 2);
        osc2.start(t); osc2.stop(t + 2);
      }
    },
  };

  // Gentle vibration on phase changes — for breathing with closed eyes.
  const haptics = {
    supported: "vibrate" in navigator,
    enabled: localStorage.getItem(LS_HAPTICS) === "1",
    pulse(kind) {
      if (!this.enabled || !this.supported) return;
      navigator.vibrate(kind === "hold" ? 15 : [0, 35]);
    },
  };

  function renderToggles() {
    const pressed = audio.enabled ? "true" : "false";
    $("sound-toggle").setAttribute("aria-pressed", pressed);
    $("session-sound").setAttribute("aria-pressed", pressed);
    $("haptics-toggle").hidden = !haptics.supported;
    $("haptics-toggle").setAttribute("aria-pressed", haptics.enabled ? "true" : "false");
    document.querySelectorAll(".vol-slider").forEach((s) => {
      s.value = audio.volume;
      s.classList.toggle("boost", audio.volume > 1);
    });
  }

  function toggleSound() {
    audio.enabled = !audio.enabled;
    localStorage.setItem(LS_SOUND, audio.enabled ? "1" : "0");
    if (audio.enabled) { audio.ensure(); audio.cue("hold"); }
    renderToggles();
  }

  // ---------------------------------------------------------- wake lock

  const wakeLock = {
    sentinel: null,
    async acquire() {
      if (!("wakeLock" in navigator)) return;
      try { this.sentinel = await navigator.wakeLock.request("screen"); }
      catch { /* low battery or permission denied — non-fatal */ }
    },
    release() {
      this.sentinel?.release().catch(() => {});
      this.sentinel = null;
    },
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session.running && !session.paused) {
      wakeLock.acquire();
    }
  });

  // ---------------------------------------------------------- screens

  const SCREENS = ["home", "preview", "session", "builder", "practitioners"];
  function show(name) {
    for (const s of SCREENS) $(`screen-${s}`).classList.toggle("active", s === name);
    document.body.classList.toggle("in-session", name === "session");
    if (name !== "session") document.body.classList.remove("paused");
    styleDemo.stop(); // screens that want the demo restart it themselves
    // Don't leave focus on a control inside a now-hidden screen — a later
    // Space/Enter would "click" it invisibly.
    const focused = document.activeElement;
    if (focused && focused !== document.body && !$(`screen-${name}`).contains(focused)) {
      focused.blur();
    }
    window.scrollTo(0, 0);
  }

  function currentScreen() {
    return SCREENS.find((s) => $(`screen-${s}`).classList.contains("active"));
  }

  // ---------------------------------------------------------- style system

  const EASE = "cubic-bezier(0.37, 0, 0.63, 1)";

  let currentStyleId = localStorage.getItem(LS_STYLE) || "orb";
  let builtStyleId = null;

  function activeStyle() {
    return window.BreathStyles.find((s) => s.id === currentStyleId) || window.BreathStyles[0];
  }

  // Build the active style's DOM if needed and apply its static baseline.
  // Must be called with the session screen visible (styles measure the stage).
  function ensureStage(level, phaseIdx) {
    const stage = $("stage");
    const style = activeStyle();
    if (builtStyleId !== style.id) {
      stage.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      stage.innerHTML = "";
      style.build(stage);
      builtStyleId = style.id;
    }
    style.set(stage, level, phaseIdx);
  }

  function animatePhase(ctx) {
    const stage = $("stage");
    if (reducedMotion.matches) {
      // Gentle opacity pulse instead of movement, whatever the style.
      const o = ctx.kind === "inhale" ? [0.55, 1] : ctx.kind === "exhale" ? [1, 0.55] : [1, 1];
      return [stage.animate({ opacity: o }, { duration: ctx.durMs, easing: EASE, fill: "forwards" })];
    }
    return activeStyle().animate(stage, ctx);
  }

  // ---------------------------------------------------------- style demo
  // A small looping breath used on the home screen and in the preview so the
  // selected style can be felt before beginning. Breathes at the practice's
  // real pace when one is given.

  function demoPace(seq) {
    const first = seq ? segmentsOf(seq)[0].phases : [];
    const inS = first.find((p) => p.kind === "inhale")?.seconds || 3;
    const outS = first.find((p) => p.kind === "exhale")?.seconds || 3;
    return { inMs: Math.min(inS, 8) * 1000, outMs: Math.min(outS, 8) * 1000 };
  }

  const styleDemo = {
    el: null,
    timer: 0,
    anims: [],
    running: false,
    level: 0,
    phaseIdx: 0,
    inMs: 2800,
    outMs: 2800,

    start(stageEl, pace) {
      this.stop();
      this.el = stageEl;
      this.inMs = pace?.inMs || 2800;
      this.outMs = pace?.outMs || 2800;
      const style = activeStyle();
      stageEl.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      stageEl.innerHTML = "";
      style.build(stageEl);
      this.level = 0;
      this.phaseIdx = 0;
      if (reducedMotion.matches) {
        style.set(stageEl, 0.7, 0); // static impression, no motion
        return;
      }
      this.running = true;
      this.tick();
    },

    tick() {
      if (!this.running) return;
      const style = activeStyle();
      const to = this.level === 0 ? 1 : 0;
      const dur = to === 1 ? this.inMs : this.outMs;
      this.anims.forEach((a) => a.cancel());
      style.set(this.el, this.level, this.phaseIdx);
      this.anims = style.animate(this.el, {
        from: this.level, to, durMs: dur,
        kind: to === 1 ? "inhale" : "exhale",
        phaseIdx: this.phaseIdx,
      });
      this.level = to;
      this.phaseIdx++;
      this.timer = setTimeout(() => this.tick(), dur);
    },

    stop() {
      this.running = false;
      clearTimeout(this.timer);
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
    },
  };

  // ---------------------------------------------------------- style picker

  function renderStylePicker() {
    const row = $("style-row");
    row.innerHTML = "";
    for (const s of window.BreathStyles) {
      const btn = document.createElement("button");
      const selected = s.id === currentStyleId;
      btn.className = "style-chip" + (selected ? " selected" : "");
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", selected ? "true" : "false");
      btn.textContent = s.name;
      btn.addEventListener("click", () => {
        currentStyleId = s.id;
        localStorage.setItem(LS_STYLE, s.id);
        if (state.current) state.current.style = s.id; // override sticks to this practice
        renderStylePicker();
        styleDemo.start($("demo-stage"), demoPace(state.current));
      });
      row.appendChild(btn);
    }
    $("style-hint").textContent = activeStyle().hint;
  }

  // ---------------------------------------------------------- home

  function chipHTML(p) {
    return `<span class="chip ${p.kind}">${KIND_SHORT[p.kind]} ${fmtSecs(p.seconds)}</span>`;
  }

  function patternHTML(seq) {
    const segs = segmentsOf(seq);
    if (segs.length === 1) return segs[0].phases.map(chipHTML).join("");
    return segs.map((s) =>
      `<span class="chip seg">${escapeHTML(s.title || `${s.phases.length}-phase part`)}</span>`
    ).join("");
  }

  function cardHTML(seq) {
    return `
      <h3>${escapeHTML(seq.name)}</h3>
      <div class="pattern">${patternHTML(seq)}</div>
      <div class="meta">${practiceMeta(seq)}</div>`;
  }

  function escapeHTML(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderHomeHero() {
    const seq = homeSeq();
    $("home-seq-name").textContent = seq.name;
    $("home-seq-meta").textContent = practiceMeta(seq);
  }

  function startHomeDemo() {
    const seq = homeSeq();
    if (validStyleId(seq.style)) currentStyleId = seq.style;
    styleDemo.start($("home-stage"), demoPace(seq));
  }

  function renderMoodPicker() {
    const row = $("mood-chip-row");
    row.innerHTML = "";
    for (const m of MOODS) {
      const btn = document.createElement("button");
      const selected = state.mood === m.id;
      btn.className = "mood-chip" + (selected ? " selected" : "");
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      btn.textContent = m.label;
      btn.addEventListener("click", () => {
        state.mood = selected ? null : m.id;
        renderMoodPicker();
        renderHome();
      });
      row.appendChild(btn);
    }
    const mood = MOODS.find((m) => m.id === state.mood);
    $("mood-note").textContent = mood ? mood.note : "";
  }

  function visiblePresets() {
    const mood = MOODS.find((m) => m.id === state.mood);
    if (!mood) return PRESETS;
    return mood.practices
      .map((name) => PRESETS.find((p) => p.name === name))
      .filter(Boolean);
  }

  // Cards are divs with role=button (not <button>) so the favorite star can
  // be a real button inside without invalid nesting.
  function makeCard(seq, idx) {
    const card = document.createElement("div");
    card.className = "seq-card";
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.innerHTML = cardHTML(seq);
    if (seq.source === "preset") {
      const star = document.createElement("button");
      star.className = "fav-star" + (isFav(seq) ? " faved" : "");
      star.setAttribute("aria-label", isFav(seq) ? "Remove from yours" : "Add to yours");
      star.innerHTML = "★";
      star.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFav(seq);
        renderHome();
      });
      card.appendChild(star);
    }
    card.addEventListener("click", () => { state.lastCardIndex = idx; openPreview(seq); });
    return card;
  }

  function renderHome() {
    renderHomeHero();
    const mood = MOODS.find((m) => m.id === state.mood);
    $("deck-title").textContent = mood ? `for when you feel ${mood.label}` : "Practices";

    // Yours: own creations + favorited presets, shown first. With a mood
    // active it narrows to related practices, same as the deck below.
    let yours = [...state.local, ...PRESETS.filter(isFav)];
    if (mood) yours = yours.filter((s) => mood.practices.includes(s.name));
    let cardIndex = 0;
    $("mine-deck").hidden = yours.length === 0;
    const mineGrid = $("mine-grid");
    mineGrid.innerHTML = "";
    for (const seq of yours) mineGrid.appendChild(makeCard(seq, cardIndex++));

    const grid = $("preset-grid");
    grid.innerHTML = "";
    for (const seq of visiblePresets()) grid.appendChild(makeCard(seq, cardIndex++));

    const n = journal().length;
    $("foot-log").hidden = n === 0;
    if (n) $("log-count").textContent = `${n} session${n === 1 ? "" : "s"} breathed`;
  }

  // ------------------------------------------------ keyboard helpers

  function homeCards() {
    return [...document.querySelectorAll("#preset-grid .seq-card, #mine-grid .seq-card")];
  }

  // How many cards share the first row (the grid is auto-fill, so measure).
  function gridColumns() {
    const cards = document.querySelectorAll("#preset-grid .seq-card");
    if (!cards.length) return 1;
    const top = cards[0].offsetTop;
    let n = 0;
    for (const c of cards) {
      if (c.offsetTop === top) n++;
      else break;
    }
    return n || 1;
  }

  function moveCardFocus(delta) {
    const cards = homeCards();
    if (!cards.length) return;
    const idx = cards.indexOf(document.activeElement);
    const next = idx === -1
      ? (delta > 0 ? 0 : cards.length - 1)
      : Math.max(0, Math.min(cards.length - 1, idx + delta));
    cards[next].focus();
  }

  function backToHome(focusCard = true) {
    show("home");
    renderHome();
    startHomeDemo();
    if (focusCard) {
      const cards = homeCards();
      const target = cards[state.lastCardIndex] || cards[0];
      if (target) target.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------- practitioners page

  function practitionerExampleHash() {
    return "#s=i4-h7-e8&c=6&n=Evening%20wind-down&v=bloom&i=let%20the%20day%20go&by=Your%20Name";
  }

  function openPractitioners() {
    $("pr-example-url").textContent =
      `${window.location.origin}${window.location.pathname}`.replace(/index\.html$/, "") +
      "#s=i4-h7-e8&c=6&n=Evening wind-down&v=bloom&i=let the day go&by=Your Name";
    show("practitioners");
  }

  // ---------------------------------------------------------- preview

  function openPreview(seq) {
    state.current = structuredClone(seq);
    // each practice opens in its natural animation; the picker still overrides
    if (validStyleId(seq.style)) currentStyleId = seq.style;
    $("preview-name").textContent = seq.name;
    $("preview-by").textContent = seq.by ? `prepared for you by ${seq.by}` : "";
    $("preview-by").hidden = !seq.by;
    $("preview-desc").textContent = seq.description || "";
    $("preview-pattern").innerHTML = patternHTML(seq);
    document.querySelector(".cycles-label").hidden = isProgram(seq);
    if (!isProgram(seq)) $("preview-cycles").value = segmentsOf(seq)[0].cycles;
    updatePreviewDuration();
    $("edit-btn").hidden = false; // editing a preset saves a personal copy
    $("delete-btn").hidden = seq.source !== "local";
    renderFavBtn();
    renderStylePicker();
    show("preview");
    styleDemo.start($("demo-stage"), demoPace(state.current));
    $("start-btn").focus({ preventScroll: true });
  }

  function renderFavBtn() {
    const seq = state.current;
    const btn = $("fav-btn");
    btn.hidden = !seq || seq.source !== "preset";
    if (btn.hidden) return;
    const faved = isFav(seq);
    btn.setAttribute("aria-pressed", faved ? "true" : "false");
    btn.classList.toggle("faved", faved);
    btn.title = faved ? "Remove from yours" : "Add to yours";
  }

  function updatePreviewDuration() {
    if (!state.current) return;
    if (!isProgram(state.current)) {
      const c = parseInt($("preview-cycles").value, 10);
      if (Number.isInteger(c) && c >= 1) state.current.cycles = Math.min(500, c);
    }
    $("preview-duration").textContent = `≈ ${fmtDuration(seqDuration(state.current))}`;
  }

  // ---------------------------------------------------------- session engine

  const session = {
    running: false,
    paused: false,
    seq: null,
    flat: [],          // flattened [{kind, seconds, cycle}]
    idx: 0,
    level: 0,          // breath level 0 (exhaled) .. 1 (inhaled) at phase start
    anims: [],
    phaseStart: 0,     // performance.now() at phase start
    phaseDur: 0,       // ms
    pausedAt: 0,
    raf: 0,

    start(seq) {
      this.seq = seq;
      state.current = seq;
      if (validStyleId(seq.style)) {
        currentStyleId = seq.style;
        localStorage.setItem(LS_STYLE, seq.style);
      }
      const snap = {
        name: seq.name, description: seq.description || "",
        source: seq.source, style: seq.style || currentStyleId,
      };
      if (seq.segments) snap.segments = seq.segments;
      else { snap.phases = seq.phases; snap.cycles = seq.cycles; }
      localStorage.setItem(LS_LAST, JSON.stringify(snap));
      // flatten parts × cycles × phases into one timeline
      this.flat = [];
      const segs = segmentsOf(seq);
      segs.forEach((seg, segIdx) => {
        const cycles = seg.cycles || 1;
        const next = segs[segIdx + 1];
        for (let c = 0; c < cycles; c++) {
          for (const p of seg.phases) {
            const entry = { ...p, cycle: c + 1, cycles, segIdx, segCount: segs.length, segTitle: seg.title };
            // announce the upcoming part, but only once this one is ending
            if (next && c === cycles - 1) entry.nextTitle = next.title || `part ${segIdx + 2}`;
            this.flat.push(entry);
          }
        }
      });
      // Precompute breath levels. A run of consecutive same-kind phases
      // (e.g. the physiological sigh's double inhale) shares the range,
      // weighted by duration: big swell first, then the sip tops it up —
      // so stacked phases are visible instead of reading as a stutter.
      let lvl = 0;
      for (let i = 0; i < this.flat.length; i++) {
        const p = this.flat[i];
        if (p.fromLevel !== undefined) { lvl = p.toLevel; continue; }
        if (p.kind === "hold") { p.fromLevel = p.toLevel = lvl; continue; }
        let j = i;
        while (j < this.flat.length && this.flat[j].kind === p.kind) j++;
        const run = this.flat.slice(i, j);
        const total = run.reduce((a, e) => a + e.seconds, 0);
        const start = lvl;
        const target = p.kind === "inhale" ? 1 : 0;
        let done = 0;
        run.forEach((e, k) => {
          e.stacked = k > 0;
          e.fromLevel = start + (target - start) * (done / total);
          done += e.seconds;
          e.toLevel = start + (target - start) * (done / total);
        });
        lvl = run[run.length - 1].toLevel;
      }
      this.idx = 0;
      this.level = 0;
      this.running = true;
      this.paused = false;
      this.anims.forEach((a) => a.cancel()); // leftovers from a finished run
      this.anims = [];
      $("session-done").hidden = true;
      document.querySelector(".session-stage").style.display = "";
      const intention = seq.intention ?? localStorage.getItem(LS_INTENTION);
      $("intention-line").textContent = intention || "";
      $("intention-line").hidden = !intention;
      show("session");
      ensureStage(0, 0); // after show(): styles measure the visible stage
      $("pause-btn").textContent = "Pause";
      wakeLock.acquire();
      audio.ensure();
      if (!localStorage.getItem("breathz.swipeHintShown")) {
        localStorage.setItem("breathz.swipeHintShown", "1");
        setTimeout(() => { if (this.running) toast("swipe ⟷ to change the scenery"); }, 4500);
      }
      // a settling countdown before the first breath (breathz.preroll seconds)
      const preRaw = parseFloat(localStorage.getItem("breathz.preroll"));
      let pre = isFinite(preRaw) ? Math.min(10, Math.max(0, Math.round(preRaw))) : 3;
      if (pre === 0) { this.preRolling = false; this.runPhase(); return; }
      this.preRolling = true;
      $("phase-label").textContent = "ready";
      $("cycle-indicator").textContent =
        `${fmtCycles(seq.cycles)} · ${fmtDuration(seqDuration(seq))}`;
      const countdown = (n) => {
        if (!this.running) return;
        if (n === 0) { this.preRolling = false; this.runPhase(); return; }
        $("phase-count").textContent = n;
        this.preTimer = setTimeout(() => countdown(n - 1), 1000);
      };
      countdown(pre);
    },

    runPhase() {
      if (!this.running) return;
      if (this.idx >= this.flat.length) return this.finish();

      const phase = this.flat[this.idx];
      const target = phase.toLevel ?? (phase.kind === "inhale" ? 1
                   : phase.kind === "exhale" ? 0
                   : this.level);
      this.level = phase.fromLevel ?? this.level;

      $("phase-label").textContent = KIND_LABEL[phase.kind];
      $("cycle-indicator").textContent = this.phaseIndicator(phase);
      $("next-up").textContent = phase.nextTitle ? `then · ${phase.nextTitle}` : "";
      $("next-up").hidden = !phase.nextTitle;
      $("hold-release").hidden = !phase.open;
      audio.cue(phase.kind, phase.stacked);
      haptics.pulse(phase.kind);

      this.phaseDur = phase.open ? Infinity : phase.seconds * 1000;
      this.phaseStart = performance.now();
      this.phaseFrom = this.level;
      this.phaseTo = target;
      // Cancel the previous phase's animations (hold shimmers run forever,
      // fill:'forwards' ones stay retained), re-apply the static baseline the
      // cancelled animations fall back to, then start this phase's animations.
      this.anims.forEach((a) => a.cancel());
      activeStyle().set($("stage"), this.level, this.idx);
      this.anims = animatePhase({
        from: this.level, to: target,
        durMs: phase.open ? 4000 : this.phaseDur, kind: phase.kind, phaseIdx: this.idx,
      });
      this.level = target;
      this.tickLoop();
    },

    phaseIndicator(phase) {
      if (phase.segCount > 1) {
        const t = phase.segTitle || `part ${phase.segIdx + 1} of ${phase.segCount}`;
        return phase.cycles > 1 ? `${t} · ${phase.cycle} of ${phase.cycles}` : t;
      }
      return `cycle ${phase.cycle} of ${phase.cycles}`;
    },

    // one countdown loop for phases and open holds alike (open holds count up)
    tickLoop() {
      cancelAnimationFrame(this.raf);
      const tick = () => {
        if (!this.running || this.paused) return;
        const phase = this.flat[this.idx];
        const elapsed = performance.now() - this.phaseStart;
        if (phase.open) {
          const s = Math.floor(elapsed / 1000);
          $("phase-count").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        } else {
          $("phase-count").textContent = Math.ceil(Math.max(0, this.phaseDur - elapsed) / 1000);
          if (elapsed >= this.phaseDur) { this.idx++; this.runPhase(); return; }
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    },

    // ends the current open hold (tap on the stage, Space, or the release button)
    releaseHold() {
      if (!this.running || !this.flat[this.idx]?.open) return;
      if (this.paused) this.resume();
      haptics.pulse("exhale");
      this.idx++;
      this.runPhase();
    },

    pause() {
      if (!this.running || this.paused || this.preRolling) return;
      this.paused = true;
      this.pausedAt = performance.now();
      this.anims.forEach((a) => a.pause());
      cancelAnimationFrame(this.raf);
      document.body.classList.add("paused");
      $("pause-btn").textContent = "Resume";
      $("phase-label").textContent = "paused";
      wakeLock.release();
    },

    resume() {
      if (!this.running || !this.paused) return;
      this.paused = false;
      this.phaseStart += performance.now() - this.pausedAt;
      this.anims.forEach((a) => a.play());
      document.body.classList.remove("paused");
      $("pause-btn").textContent = "Pause";
      $("phase-label").textContent = KIND_LABEL[this.flat[this.idx].kind];
      wakeLock.acquire();
      this.tickLoop();
    },

    // Switch the animation style while breathing (swipe / arrow keys). The
    // new style picks the breath up at its current level and finishes the
    // phase, so the rhythm never stutters.
    switchStyle(step) {
      if (!this.running) return;
      const styles = window.BreathStyles;
      const i = styles.findIndex((s) => s.id === currentStyleId);
      currentStyleId = styles[(i + step + styles.length) % styles.length].id;
      localStorage.setItem(LS_STYLE, currentStyleId);
      if (state.current) state.current.style = currentStyleId;
      if (this.seq) this.seq.style = currentStyleId;

      const stage = $("stage");
      stage.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      stage.innerHTML = "";
      activeStyle().build(stage);
      builtStyleId = currentStyleId;

      if (this.preRolling) { // still counting down — just show the new style
        activeStyle().set(stage, 0, 0);
        toast(activeStyle().name);
        return;
      }

      const phase = this.flat[this.idx];
      const elapsed = this.paused
        ? this.pausedAt - this.phaseStart
        : performance.now() - this.phaseStart;
      const frac = Math.min(1, Math.max(0, elapsed / this.phaseDur));
      const eased = -(Math.cos(Math.PI * frac) - 1) / 2; // easeInOutSine
      const cur = this.phaseFrom + (this.phaseTo - this.phaseFrom) * eased;

      activeStyle().set(stage, cur, 0); // phaseIdx 0 resets stateful styles
      this.anims = animatePhase({
        from: cur, to: this.phaseTo,
        durMs: phase.open ? 4000 : Math.max(150, this.phaseDur - elapsed),
        kind: phase.kind, phaseIdx: this.idx,
      });
      if (this.paused) this.anims.forEach((a) => a.pause());
      toast(activeStyle().name);
    },

    stop(goHome = true) {
      this.running = false;
      this.paused = false;
      this.preRolling = false;
      clearTimeout(this.preTimer);
      cancelAnimationFrame(this.raf);
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      wakeLock.release();
      $("hold-release").hidden = true;
      document.body.classList.remove("paused");
      // openPreview repopulates the whole screen — required when the session
      // was started straight from home and the preview was never rendered.
      if (goHome) openPreview(state.current);
    },

    finish() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      wakeLock.release();
      $("hold-release").hidden = true;
      journalAdd({ t: Date.now(), seq: this.seq.name, detail: practiceMeta(this.seq) });
      const n = journal().length;
      $("done-summary").textContent =
        `${this.seq.name} — ${practiceMeta(this.seq)} of mindful breathing.` +
        (n > 1 ? ` Breath session #${n}.` : "");
      $("mood-row").hidden = false;
      $("mood-thanks").hidden = true;
      document.querySelector(".session-stage").style.display = "none";
      $("session-done").hidden = false;
    },
  };


  // ---------------------------------------------------------- builder

  let builderMode = "visual";

  function setBuilderMode(mode) {
    if (mode === "text" && builderMode === "visual") {
      // capture slider state into the text
      state.editing.name = $("builder-name").value.trim() || "";
      state.editing.cycles = Math.min(500, Math.max(1, parseInt($("builder-cycles").value, 10) || 10));
      $("builder-text").value = seqToText({ ...state.editing, name: state.editing.name || "My sequence" });
    }
    if (mode === "visual" && builderMode === "text") {
      const r = textToSeq($("builder-text").value);
      if (r.error) { $("builder-error").textContent = r.error; return; } // stay in text mode
      if (M.isProgram(r.seq)) {
        $("builder-error").textContent = "Multi-part sessions are edited as text.";
        return;
      }
      delete state.editing.segments;
      Object.assign(state.editing, r.seq);
      $("builder-name").value = state.editing.name;
      $("builder-cycles").value = state.editing.cycles;
      renderPhaseRows();
    }
    builderMode = mode;
    $("builder-visual").hidden = mode === "text";
    $("builder-text-field").hidden = mode === "visual";
    $("builder-mode-toggle").textContent = mode === "text" ? "edit with sliders" : "edit as text";
    $("builder-error").textContent = "";
    if (mode === "text") $("builder-text").focus({ preventScroll: true });
  }

  function openBuilder(seq) {
    state.editing = seq
      ? structuredClone(seq)
      : { name: "", phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }], cycles: 10, source: "adhoc" };
    $("builder-title").textContent = seq ? "Shape this sequence" : "Create a sequence";
    $("builder-error").textContent = "";
    $("builder-note").textContent = "Sequences are saved in this browser — share one as a link to keep it anywhere.";
    const program = isProgram(state.editing);
    $("builder-mode-toggle").hidden = program;
    builderMode = program ? "text" : "visual";
    $("builder-visual").hidden = program;
    $("builder-text-field").hidden = !program;
    $("builder-mode-toggle").textContent = "edit as text";
    if (program) {
      // multi-part sessions live in the text editor — parts, cycles, open holds
      $("builder-text").value = seqToText(state.editing);
      updateBuilderSummary();
      show("builder");
      $("builder-text").focus({ preventScroll: true });
      return;
    }
    $("builder-name").value = state.editing.name || "";
    $("builder-cycles").value = state.editing.cycles;
    renderPhaseRows();
    show("builder");
    $("builder-name").focus({ preventScroll: true });
  }

  function renderPhaseRows() {
    const wrap = $("phase-rows");
    wrap.innerHTML = "";
    state.editing.phases.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = `phase-row ${p.kind}`;
      row.innerHTML = `
        <span class="kind">${KIND_SHORT[p.kind]}</span>
        <input type="range" min="0.5" max="20" step="0.5" value="${p.seconds}" aria-label="${p.kind} duration">
        <span class="secs">${fmtSecs(p.seconds)}s</span>
        <button class="remove" aria-label="Remove phase">×</button>`;
      row.querySelector("input").addEventListener("input", (e) => {
        p.seconds = parseFloat(e.target.value);
        row.querySelector(".secs").textContent = `${fmtSecs(p.seconds)}s`;
        updateBuilderSummary();
      });
      row.querySelector(".remove").addEventListener("click", () => {
        state.editing.phases.splice(i, 1);
        renderPhaseRows();
      });
      wrap.appendChild(row);
    });
    updateBuilderSummary();
  }

  function updateBuilderSummary() {
    if (isProgram(state.editing)) {
      $("builder-summary").textContent = practiceMeta(state.editing);
      return;
    }
    const cycles = parseInt($("builder-cycles").value, 10) || 1;
    state.editing.cycles = Math.min(500, Math.max(1, cycles));
    const dur = seqDuration(state.editing);
    $("builder-summary").textContent = state.editing.phases.length
      ? `One cycle: ${fmtDuration(dur / state.editing.cycles)} · full session: ${fmtDuration(dur)}`
      : "";
  }

  function builderCollect() {
    const seq = state.editing;
    if (builderMode === "text") {
      const r = textToSeq($("builder-text").value);
      if (r.error) { $("builder-error").textContent = r.error; return null; }
      delete seq.phases; delete seq.cycles; delete seq.segments;
      Object.assign(seq, r.seq);
      return seq;
    }
    seq.name = $("builder-name").value.trim() || "My sequence";
    seq.cycles = Math.min(500, Math.max(1, parseInt($("builder-cycles").value, 10) || 10));
    return seq;
  }

  function builderSave() {
    const seq = builderCollect();
    if (!seq) return;
    const err = validateSequence(seq);
    if (err) { $("builder-error").textContent = err; return; }
    $("builder-error").textContent = "";

    seq.style = validStyleId(seq.style) || currentStyleId;
    if (seq.source === "local" && seq.id) {
      const i = state.local.findIndex((s) => s.id === seq.id);
      if (i >= 0) state.local[i] = { ...seq };
    } else {
      seq.id = "local_" + Math.random().toString(36).slice(2, 10);
      seq.source = "local";
      state.local.unshift({ ...seq });
    }
    saveLocal();
    renderHome();
    toast("Saved on this device");
    openPreview({ ...seq });
  }

  // ---------------------------------------------------------- wire-up

  function bind() {
    $("brand-link").addEventListener("click", (e) => { e.preventDefault(); backToHome(false); });

    $("sound-toggle").addEventListener("click", toggleSound);
    $("session-sound").addEventListener("click", toggleSound);

    document.querySelectorAll(".vol-slider").forEach((slider) =>
      slider.addEventListener("input", () => {
        audio.volume = parseFloat(slider.value);
        localStorage.setItem(LS_VOL, String(audio.volume));
        // dragging the volume implies wanting sound
        if (!audio.enabled && audio.volume > 0) {
          audio.enabled = true;
          localStorage.setItem(LS_SOUND, "1");
        }
        renderToggles();
        // audible feedback while dragging, lightly throttled
        const now = performance.now();
        if (!slider._lastCue || now - slider._lastCue > 350) {
          slider._lastCue = now;
          audio.cue("hold");
        }
      }));

    $("haptics-toggle").addEventListener("click", () => {
      haptics.enabled = !haptics.enabled;
      localStorage.setItem(LS_HAPTICS, haptics.enabled ? "1" : "0");
      if (haptics.enabled) navigator.vibrate?.(35);
      renderToggles();
    });

    // home
    $("home-begin").addEventListener("click", () => {
      const seq = homeSeq();
      const err = validateSequence(seq);
      if (err) { toast(err); return; }
      session.start(structuredClone(seq));
    });
    $("home-customize").addEventListener("click", () => openPreview(homeSeq()));

    // preview
    $("preview-back").addEventListener("click", () => backToHome());
    $("preview-cycles").addEventListener("input", updatePreviewDuration);
    $("start-btn").addEventListener("click", () => {
      const err = validateSequence(state.current);
      if (err) { toast(err); return; }
      session.start(state.current);
    });
    // Share opens one dialog holding everything: QR, copy, native share
    $("share-btn").addEventListener("click", () => {
      const url = encodeShare(state.current);
      const qr = window.qrcode(0, "M"); // type 0 = auto-size
      qr.addData(url);
      qr.make();
      $("qr-holder").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      $("qr-caption").textContent = state.current.name;
      $("share-native").hidden = !navigator.share;
      $("qr-dialog").showModal();
    });
    $("share-copy").addEventListener("click", async () => {
      const url = encodeShare(state.current);
      try { await navigator.clipboard.writeText(url); toast("Link copied — share your rhythm"); }
      catch { prompt("Copy this link:", url); }
    });
    $("share-native").addEventListener("click", async () => {
      const url = encodeShare(state.current);
      try { await navigator.share({ title: `${state.current.name} — breathz`, url }); }
      catch { /* dismissed */ }
    });
    $("qr-close").addEventListener("click", () => $("qr-dialog").close());
    $("qr-dialog").addEventListener("click", (e) => {
      if (e.target === $("qr-dialog")) $("qr-dialog").close(); // backdrop click
    });

    $("fav-btn").addEventListener("click", () => {
      toggleFav(state.current);
      renderFavBtn();
      toast(isFav(state.current) ? "Added to yours" : "Removed from yours");
    });
    $("edit-btn").addEventListener("click", () => openBuilder(state.current));
    $("delete-btn").addEventListener("click", () => {
      const seq = state.current;
      if (!confirm(`Delete “${seq.name}”?`)) return;
      state.local = state.local.filter((s) => s.id !== seq.id);
      saveLocal();
      backToHome(false);
      toast("Deleted");
    });

    // session
    $("pause-btn").addEventListener("click", () => session.paused ? session.resume() : session.pause());
    $("hold-release").addEventListener("click", () => session.releaseHold());
    $("end-btn").addEventListener("click", () => session.stop());
    $("again-btn").addEventListener("click", () => session.start(state.current));
    $("done-home-btn").addEventListener("click", () => backToHome(false));
    document.querySelectorAll(".mood-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        journalSetLastMood(btn.dataset.mood);
        $("mood-row").hidden = true;
        const thanks = $("mood-thanks");
        thanks.textContent = btn.dataset.mood === "tense"
          ? "noted — a longer exhale can help. Try the Physiological Sigh next."
          : "noted — see you at the next breath";
        thanks.hidden = false;
      }));

    // intention: phrase persists; an image becomes the Vision style
    $("intention-toggle").addEventListener("click", () => {
      const panel = $("intention-panel");
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        $("intention-text").value = localStorage.getItem(LS_INTENTION) || "";
        $("intention-clear").hidden = !localStorage.getItem(LS_VISION);
        $("intention-text").focus({ preventScroll: true });
      }
    });
    $("intention-text").addEventListener("input", () => {
      const v = $("intention-text").value.trim().slice(0, 120);
      if (v) localStorage.setItem(LS_INTENTION, v);
      else localStorage.removeItem(LS_INTENTION);
    });
    $("intention-image").addEventListener("change", () => {
      const file = $("intention-image").files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        // downscale so the data URI stays comfortably inside localStorage
        const max = 640;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        try {
          localStorage.setItem(LS_VISION, canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          toast("That image is too large to keep — try a smaller one");
          return;
        }
        currentStyleId = "vision";
        localStorage.setItem(LS_STYLE, "vision");
        if (state.current) state.current.style = "vision";
        builtStyleId = null; // force the session stage to rebuild with the new image
        $("intention-clear").hidden = false;
        renderStylePicker();
        styleDemo.start($("demo-stage"), demoPace(state.current));
        toast("Your vision now breathes with you");
      };
      img.onerror = () => toast("Couldn't read that image");
      img.src = URL.createObjectURL(file);
      $("intention-image").value = "";
    });
    $("intention-clear").addEventListener("click", () => {
      localStorage.removeItem(LS_VISION);
      $("intention-clear").hidden = true;
      if (currentStyleId === "vision") {
        renderStylePicker();
        styleDemo.start($("demo-stage"), demoPace(state.current));
      }
      toast("Image removed");
    });

    // practitioners
    $("practitioners-link").addEventListener("click", openPractitioners);
    $("practitioners-back").addEventListener("click", () => backToHome(false));
    $("pr-example-open").addEventListener("click", () => {
      const seq = decodeShare(practitionerExampleHash());
      if (seq) openPreview(seq);
    });
    $("pr-example-copy").addEventListener("click", async () => {
      const url = `${window.location.origin}${window.location.pathname}${practitionerExampleHash()}`;
      try { await navigator.clipboard.writeText(url); toast("Example link copied"); }
      catch { prompt("Copy this link:", url); }
    });

    // practice log — a text summary the client can paste to their practitioner
    $("copy-log").addEventListener("click", async () => {
      const lines = journal().map((e) => {
        const d = new Date(e.t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
        return `${d} — ${e.seq}, ${e.detail || fmtCycles(e.cycles)}${e.mood ? ` — felt ${e.mood}` : ""}`;
      });
      const text = `my breathz practice log\n${lines.join("\n")}`;
      try { await navigator.clipboard.writeText(text); toast("Practice log copied"); }
      catch { prompt("Copy your log:", text); }
    });

    // swipe left/right anywhere on the session screen to change the scenery
    let swipeStart = null;
    const sessionScreen = $("screen-session");
    sessionScreen.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, input")) return;
      swipeStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    sessionScreen.addEventListener("pointerup", (e) => {
      if (!swipeStart || e.pointerId !== swipeStart.id) { swipeStart = null; return; }
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > 1.8 * Math.abs(dy)) {
        session.switchStyle(dx < 0 ? 1 : -1);
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 &&
                 session.running && !session.paused && !session.preRolling &&
                 session.flat[session.idx]?.open) {
        session.releaseHold();
      }
    });
    sessionScreen.addEventListener("pointercancel", () => { swipeStart = null; });

    // builder
    $("new-sequence-btn").addEventListener("click", () => openBuilder(null));
    $("builder-back").addEventListener("click", () => backToHome());
    $("builder-cycles").addEventListener("input", updateBuilderSummary);
    document.querySelectorAll("[data-add-kind]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (state.editing.phases.length >= 12) { $("builder-error").textContent = "Maximum 12 phases."; return; }
        const kind = btn.dataset.addKind;
        state.editing.phases.push({ kind, seconds: kind === "hold" ? 4 : 5 });
        renderPhaseRows();
      }));
    $("builder-save").addEventListener("click", builderSave);
    $("builder-try").addEventListener("click", () => {
      const seq = builderCollect();
      if (!seq) return;
      const err = validateSequence(seq);
      if (err) { $("builder-error").textContent = err; return; }
      openPreview(seq);
    });
    $("builder-mode-toggle").addEventListener("click", () =>
      setBuilderMode(builderMode === "text" ? "visual" : "text"));
    $("builder-text").addEventListener("input", () => {
      const r = textToSeq($("builder-text").value);
      if (r.error) {
        $("builder-error").textContent = r.error;
        $("builder-summary").textContent = "";
      } else {
        $("builder-error").textContent = "";
        $("builder-summary").textContent = practiceMeta(r.seq);
      }
    });

    // ---- full keyboard navigation ----
    // home: arrows move between cards, Enter/Space begins, N = new sequence
    // preview: Space/Enter/→ begins, ← back, E = edit, S = share, Esc = back
    // session: Space = pause/resume, Esc = end; done: Space/→ = again, ←/Esc = home
    // builder: Esc = back (form itself is Tab-navigable)
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
      // Let a focused button handle its own Space/Enter (native click).
      const onButton = t.tagName === "BUTTON" && (e.code === "Space" || e.code === "Enter");
      const screen = currentScreen();

      if (screen === "session") {
        if (onButton) return;
        if (session.running) {
          if (e.code === "Space") {
            e.preventDefault();
            if (!session.paused && !session.preRolling && session.flat[session.idx]?.open) session.releaseHold();
            else session.paused ? session.resume() : session.pause();
          }
          else if (e.code === "Escape") session.stop();
          else if (e.code === "ArrowRight") { e.preventDefault(); session.switchStyle(1); }
          else if (e.code === "ArrowLeft") { e.preventDefault(); session.switchStyle(-1); }
          else if (e.key === "m" || e.key === "M") toggleSound();
        } else { // "well done" overlay
          if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowRight") {
            e.preventDefault(); session.start(state.current);
          } else if (e.code === "Escape" || e.code === "ArrowLeft") backToHome(false);
        }
        return;
      }

      if (e.code === "Escape") {
        if (typing) { t.blur(); return; }
        if (screen === "preview" || screen === "builder" || screen === "practitioners") backToHome();
        return;
      }

      if (typing || onButton) return;

      if (screen === "home") {
        const cols = gridColumns();
        if (e.code === "ArrowRight") { e.preventDefault(); moveCardFocus(1); }
        else if (e.code === "ArrowLeft") { e.preventDefault(); moveCardFocus(-1); }
        else if (e.code === "ArrowDown") { e.preventDefault(); moveCardFocus(cols); }
        else if (e.code === "ArrowUp") { e.preventDefault(); moveCardFocus(-cols); }
        else if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          if (t.classList?.contains("seq-card")) t.click();
          else $("home-begin").click();
        }
        else if (e.key === "n" || e.key === "N") { e.preventDefault(); openBuilder(null); }
      } else if (screen === "preview") {
        const beginSession = () => {
          const err = validateSequence(state.current);
          if (err) toast(err); else session.start(state.current);
        };
        // on a style chip, left/right cycle through the styles
        if (t.classList?.contains("style-chip") &&
            (e.code === "ArrowRight" || e.code === "ArrowLeft")) {
          e.preventDefault();
          const styles = window.BreathStyles;
          const i = styles.findIndex((s) => s.id === currentStyleId);
          const step = e.code === "ArrowRight" ? 1 : -1;
          currentStyleId = styles[(i + step + styles.length) % styles.length].id;
          localStorage.setItem(LS_STYLE, currentStyleId);
          if (state.current) state.current.style = currentStyleId;
          renderStylePicker();
          styleDemo.start($("demo-stage"), demoPace(state.current));
          document.querySelector(".style-chip.selected")?.focus();
        } else if (e.code === "ArrowRight") {
          e.preventDefault(); beginSession();
        } else if (e.code === "ArrowLeft") {
          e.preventDefault(); backToHome();
        } else if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault(); beginSession();
        } else if ((e.key === "e" || e.key === "E") && !$("edit-btn").hidden) {
          openBuilder(state.current);
        } else if (e.key === "s" || e.key === "S") {
          $("share-btn").click();
        }
      }
    });
  }

  // ---------------------------------------------------------- boot

  function boot() {
    loadLocal();
    renderToggles();
    bind();
    renderMoodPicker();
    renderHome();
    startHomeDemo();

    // shared link? (also handle links opened while the app is already running)
    const handleSharedHash = () => {
      if (window.location.hash === "#practitioners") {
        openPractitioners();
        history.replaceState(null, "", window.location.pathname);
        return;
      }
      const shared = decodeShare(window.location.hash);
      if (shared) {
        if (session.running) session.stop(false);
        openPreview(shared);
        history.replaceState(null, "", window.location.pathname);
      }
    };
    handleSharedHash();
    window.addEventListener("hashchange", handleSharedHash);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // Assets refresh in the background (stale-while-revalidate), so the
        // first load after a deploy can be one version behind. Say so quietly.
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              toast("breathz was updated — reload when you like");
            }
          });
        });
      }).catch(() => {});
    }
  }

  boot();
})();
