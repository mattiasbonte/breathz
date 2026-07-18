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
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const KIND_LABEL = { inhale: "in", hold: "hold", exhale: "out" };
  const KIND_SHORT = { inhale: "in", hold: "hold", exhale: "out" };

  const fmtSecs = (s) => (Number.isInteger(s) ? String(s) : s.toFixed(1));
  const fmtCycles = (n) => `${n} cycle${n === 1 ? "" : "s"}`;

  function fmtDuration(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = Math.round(totalSecs % 60);
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m} min`;
    return `${m} min ${s}s`;
  }

  function seqDuration(seq) {
    const cycle = seq.phases.reduce((a, p) => a + p.seconds, 0);
    return cycle * (seq.cycles || 1);
  }

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
      practices: ["Energize", "Equal Breathing"] },
    { id: "scattered", label: "unfocused",
      note: "Counting edges and corners anchors attention back in the body.",
      practices: ["Box Breathing", "Triangle Breathing", "Ujjayi Pace"] },
    { id: "balanced", label: "balanced",
      note: "Coherent breathing keeps a good day steady — about five and a half breaths a minute.",
      practices: ["Coherent Breathing", "Equal Breathing", "Ujjayi Pace"] },
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

  // ---------------------------------------------------------- validation

  function validateSequence(seq) {
    if (!seq || !Array.isArray(seq.phases) || seq.phases.length === 0) return "Add at least one phase.";
    if (seq.phases.length > 12) return "Maximum 12 phases per cycle.";
    for (const p of seq.phases) {
      if (!["inhale", "hold", "exhale"].includes(p.kind)) return "Unknown phase type.";
      if (typeof p.seconds !== "number" || !(p.seconds >= 0.5 && p.seconds <= 120)) {
        return "Each phase must last between 0.5 and 120 seconds.";
      }
    }
    if (!seq.phases.some((p) => p.kind !== "hold")) return "Add an inhale or exhale.";
    const cycles = seq.cycles;
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 500) return "Cycles must be between 1 and 500.";
    return null;
  }

  // ---------------------------------------------------------- share links
  // #s=i4-h4-e4-h4&c=10&n=Box%20Breathing&v=orb — the whole experience in a URL.

  function encodeShare(seq) {
    const s = seq.phases.map((p) => p.kind[0] + fmtSecs(p.seconds)).join("-");
    let hash = `#s=${s}&c=${seq.cycles}`;
    if (seq.name) hash += `&n=${encodeURIComponent(seq.name)}`;
    hash += `&v=${seq.style || currentStyleId}`;
    return `${window.location.origin}${window.location.pathname}${hash}`;
  }

  function validStyleId(id) {
    return id && window.BreathStyles.some((s) => s.id === id) ? id : null;
  }

  function decodeShare(hash) {
    try {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const s = params.get("s");
      if (!s) return null;
      const kinds = { i: "inhale", h: "hold", e: "exhale" };
      const phases = s.split("-").map((tok) => {
        const kind = kinds[tok[0]];
        const seconds = parseFloat(tok.slice(1));
        if (!kind || !isFinite(seconds)) throw new Error("bad token");
        return { kind, seconds: Math.round(seconds * 10) / 10 };
      });
      const cycles = Math.min(500, Math.max(1, parseInt(params.get("c") || "10", 10) || 10));
      const seq = {
        name: params.get("n") || "Shared sequence",
        description: "Opened from a shared link.",
        phases, cycles, source: "link",
      };
      if (validateSequence(seq)) return null;
      seq.style = validStyleId(params.get("v"));
      return seq;
    } catch { return null; }
  }

  // ---------------------------------------------------------- audio cues

  const audio = {
    ctx: null,
    enabled: localStorage.getItem(LS_SOUND) === "1",
    volume: (() => {
      const v = parseFloat(localStorage.getItem(LS_VOL));
      return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
    })(),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.enabled = false; return; }
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    // A soft chime: gentle sine with slow attack/release. Different pitch per phase.
    cue(kind) {
      if (!this.enabled || this.volume <= 0) return;
      this.ensure();
      if (!this.ctx) return;
      const freqs = { inhale: 392, hold: 329.63, exhale: 261.63 }; // G4, E4, C4
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freqs[kind] || 329.63;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.13 * this.volume, t + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
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
    document.querySelectorAll(".vol-slider").forEach((s) => { s.value = audio.volume; });
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

  const SCREENS = ["home", "preview", "session", "builder"];
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
    const inS = seq?.phases?.find((p) => p.kind === "inhale")?.seconds || 3;
    const outS = seq?.phases?.find((p) => p.kind === "exhale")?.seconds || 3;
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

  function cardHTML(seq) {
    return `
      <h3>${escapeHTML(seq.name)}</h3>
      <div class="pattern">${seq.phases.map(chipHTML).join("")}</div>
      <div class="meta">${fmtCycles(seq.cycles)} · ${fmtDuration(seqDuration(seq))}</div>`;
  }

  function escapeHTML(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderHomeHero() {
    const seq = homeSeq();
    $("home-seq-name").textContent = seq.name;
    $("home-seq-meta").textContent = `${fmtCycles(seq.cycles)} · ${fmtDuration(seqDuration(seq))}`;
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

    // Yours: own creations + favorited presets, shown first.
    const yours = [...state.local, ...PRESETS.filter(isFav)];
    let cardIndex = 0;
    $("mine-deck").hidden = yours.length === 0;
    const mineGrid = $("mine-grid");
    mineGrid.innerHTML = "";
    for (const seq of yours) mineGrid.appendChild(makeCard(seq, cardIndex++));

    const grid = $("preset-grid");
    grid.innerHTML = "";
    for (const seq of visiblePresets()) grid.appendChild(makeCard(seq, cardIndex++));
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

  // ---------------------------------------------------------- preview

  function openPreview(seq) {
    state.current = { ...seq, phases: seq.phases.map((p) => ({ ...p })) };
    // each practice opens in its natural animation; the picker still overrides
    if (validStyleId(seq.style)) currentStyleId = seq.style;
    $("preview-name").textContent = seq.name;
    $("preview-desc").textContent = seq.description || "";
    $("preview-pattern").innerHTML = seq.phases.map(chipHTML).join("");
    $("preview-cycles").value = seq.cycles;
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
    const c = parseInt($("preview-cycles").value, 10);
    if (state.current && Number.isInteger(c) && c >= 1) {
      state.current.cycles = Math.min(500, c);
      $("preview-duration").textContent = `≈ ${fmtDuration(seqDuration(state.current))}`;
    }
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
      localStorage.setItem(LS_LAST, JSON.stringify({
        name: seq.name, description: seq.description || "",
        phases: seq.phases, cycles: seq.cycles, source: seq.source,
        style: seq.style || currentStyleId,
      }));
      this.flat = [];
      for (let c = 0; c < seq.cycles; c++) {
        for (const p of seq.phases) this.flat.push({ ...p, cycle: c + 1 });
      }
      this.idx = 0;
      this.level = 0;
      this.running = true;
      this.paused = false;
      this.anims.forEach((a) => a.cancel()); // leftovers from a finished run
      this.anims = [];
      $("session-done").hidden = true;
      document.querySelector(".session-stage").style.display = "";
      show("session");
      ensureStage(0, 0); // after show(): styles measure the visible stage
      $("pause-btn").textContent = "Pause";
      wakeLock.acquire();
      audio.ensure();
      this.runPhase();
    },

    runPhase() {
      if (!this.running) return;
      if (this.idx >= this.flat.length) return this.finish();

      const phase = this.flat[this.idx];
      const target = phase.kind === "inhale" ? 1
                   : phase.kind === "exhale" ? 0
                   : this.level;

      $("phase-label").textContent = KIND_LABEL[phase.kind];
      $("cycle-indicator").textContent = `cycle ${phase.cycle} of ${this.seq.cycles}`;
      audio.cue(phase.kind);
      haptics.pulse(phase.kind);

      this.phaseDur = phase.seconds * 1000;
      this.phaseStart = performance.now();
      // Cancel the previous phase's animations (hold shimmers run forever,
      // fill:'forwards' ones stay retained), re-apply the static baseline the
      // cancelled animations fall back to, then start this phase's animations.
      this.anims.forEach((a) => a.cancel());
      activeStyle().set($("stage"), this.level, this.idx);
      this.anims = animatePhase({
        from: this.level, to: target,
        durMs: this.phaseDur, kind: phase.kind, phaseIdx: this.idx,
      });
      this.level = target;

      cancelAnimationFrame(this.raf);
      const tick = () => {
        if (!this.running || this.paused) return;
        const elapsed = performance.now() - this.phaseStart;
        const remain = Math.max(0, this.phaseDur - elapsed);
        $("phase-count").textContent = Math.ceil(remain / 1000);
        if (elapsed >= this.phaseDur) {
          this.idx++;
          this.runPhase();
        } else {
          this.raf = requestAnimationFrame(tick);
        }
      };
      this.raf = requestAnimationFrame(tick);
    },

    pause() {
      if (!this.running || this.paused) return;
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
      const tick = () => {
        if (!this.running || this.paused) return;
        const elapsed = performance.now() - this.phaseStart;
        const remain = Math.max(0, this.phaseDur - elapsed);
        $("phase-count").textContent = Math.ceil(remain / 1000);
        if (elapsed >= this.phaseDur) {
          this.idx++;
          this.runPhase();
        } else {
          this.raf = requestAnimationFrame(tick);
        }
      };
      this.raf = requestAnimationFrame(tick);
    },

    stop(goHome = true) {
      this.running = false;
      this.paused = false;
      cancelAnimationFrame(this.raf);
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      wakeLock.release();
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
      journalAdd({ t: Date.now(), seq: this.seq.name, cycles: this.seq.cycles });
      const n = journal().length;
      const total = fmtDuration(seqDuration(this.seq));
      $("done-summary").textContent =
        `${fmtCycles(this.seq.cycles)} of ${this.seq.name} — about ${total} of mindful breathing.` +
        (n > 1 ? ` Breath session #${n}.` : "");
      $("mood-row").hidden = false;
      $("mood-thanks").hidden = true;
      document.querySelector(".session-stage").style.display = "none";
      $("session-done").hidden = false;
    },
  };

  // ---------------------------------------------------------- text format
  // A forgiving plain-text sequence format, so sessions can be written or
  // generated as text and pasted in. Accepted in one textarea:
  //   name: Evening wind-down       (optional)
  //   cycles: 8                     (optional)
  //   in 4 / hold 7 / out 8         (one phase per line; i/h/e work too)
  // …or a JSON object, or a compact pattern: "i4-h7-e8", or bare "4-7-8"
  // (2 numbers = in-out, 3 = in-hold-out, 4 = in-hold-out-hold).

  const TEXT_KINDS = {
    i: "inhale", in: "inhale", inhale: "inhale",
    h: "hold", hold: "hold", pause: "hold",
    e: "exhale", ex: "exhale", out: "exhale", exhale: "exhale",
  };
  const BARE_PATTERNS = {
    2: ["inhale", "exhale"],
    3: ["inhale", "hold", "exhale"],
    4: ["inhale", "hold", "exhale", "hold"],
  };

  function seqToText(seq) {
    const lines = [`name: ${seq.name || "My sequence"}`, `cycles: ${seq.cycles}`, ""];
    for (const p of seq.phases) lines.push(`${KIND_SHORT[p.kind]} ${fmtSecs(p.seconds)}`);
    return lines.join("\n");
  }

  function parsePattern(line) {
    const toks = line.split("-").map((t) => t.trim());
    const parsed = [];
    for (const t of toks) {
      const m = t.match(/^([a-z]+)?\s*(\d+(?:\.\d+)?)$/i);
      if (!m) return null;
      const kind = m[1] ? TEXT_KINDS[m[1].toLowerCase()] : null;
      if (m[1] && !kind) return null;
      parsed.push({ kind, seconds: Math.round(parseFloat(m[2]) * 10) / 10 });
    }
    if (parsed.every((p) => p.kind)) return parsed;
    if (parsed.every((p) => !p.kind) && BARE_PATTERNS[parsed.length]) {
      return parsed.map((p, i) => ({ kind: BARE_PATTERNS[parsed.length][i], seconds: p.seconds }));
    }
    return null;
  }

  function textToSeq(text) {
    text = (text || "").trim();
    if (!text) return { error: "Nothing to read yet." };

    if (text.startsWith("{")) {
      try {
        const o = JSON.parse(text);
        const seq = {
          name: String(o.name || "My sequence").slice(0, 100),
          cycles: parseInt(o.cycles, 10) || 10,
          phases: (Array.isArray(o.phases) ? o.phases : []).map((p) => ({
            kind: TEXT_KINDS[String(p.kind || "").toLowerCase()],
            seconds: Math.round(Number(p.seconds) * 10) / 10,
          })),
        };
        const err = validateSequence(seq);
        return err ? { error: err } : { seq };
      } catch { return { error: "That JSON doesn't parse." }; }
    }

    const seq = { name: "My sequence", cycles: 10, phases: [] };
    let sawName = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      let m;
      if ((m = line.match(/^name\s*:\s*(.+)$/i))) { seq.name = m[1].trim().slice(0, 100); sawName = true; continue; }
      if ((m = line.match(/^cycles\s*:\s*(\d+)\s*$/i))) { seq.cycles = parseInt(m[1], 10); continue; }
      if ((m = line.match(/^([a-z]+)[\s:]+(\d+(?:\.\d+)?)\s*(?:s(?:ec(?:onds)?)?)?$/i)) && TEXT_KINDS[m[1].toLowerCase()]) {
        seq.phases.push({ kind: TEXT_KINDS[m[1].toLowerCase()], seconds: Math.round(parseFloat(m[2]) * 10) / 10 });
        continue;
      }
      const pattern = parsePattern(line);
      if (pattern) { seq.phases.push(...pattern); continue; }
      return { error: `Can't read this line: “${line}”` };
    }
    if (!sawName && seq.phases.length) {
      const secs = seq.phases.map((p) => fmtSecs(p.seconds)).join("-");
      seq.name = secs.length <= 20 ? `${secs} breath` : "My sequence";
    }
    const err = validateSequence(seq);
    return err ? { error: err } : { seq };
  }

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
      ? { ...seq, phases: seq.phases.map((p) => ({ ...p })) }
      : { name: "", phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }], cycles: 10, source: "adhoc" };
    $("builder-title").textContent = seq ? "Shape this sequence" : "Create a sequence";
    $("builder-name").value = state.editing.name || "";
    $("builder-cycles").value = state.editing.cycles;
    $("builder-error").textContent = "";
    $("builder-note").textContent = "Sequences are saved in this browser — share one as a link to keep it anywhere.";
    builderMode = "visual";
    $("builder-visual").hidden = false;
    $("builder-text-field").hidden = true;
    $("builder-mode-toggle").textContent = "edit as text";
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
      session.start({ ...seq, phases: seq.phases.map((p) => ({ ...p })) });
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
    $("share-btn").addEventListener("click", async () => {
      const url = encodeShare(state.current);
      try {
        if (navigator.share) {
          await navigator.share({ title: `${state.current.name} — breathz`, url });
        } else {
          await navigator.clipboard.writeText(url);
          toast("Link copied — share your rhythm");
        }
      } catch (e) {
        if (e?.name !== "AbortError") prompt("Copy this link:", url);
      }
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
        const dur = seqDuration(r.seq);
        $("builder-summary").textContent =
          `One cycle: ${fmtDuration(dur / r.seq.cycles)} · full session: ${fmtDuration(dur)}`;
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
          if (e.code === "Space") { e.preventDefault(); session.paused ? session.resume() : session.pause(); }
          else if (e.code === "Escape") session.stop();
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
        if (screen === "preview" || screen === "builder") backToHome();
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
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  boot();
})();
