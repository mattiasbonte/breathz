/* breathz — app logic. No framework, no build step. */
(() => {
  "use strict";

  // ---------------------------------------------------------- utilities

  const $ = (id) => document.getElementById(id);
  const LS_SEQS = "breathz.sequences";
  const LS_SOUND = "breathz.sound";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const KIND_LABEL = { inhale: "breathe in", hold: "hold", exhale: "breathe out" };
  const KIND_SHORT = { inhale: "in", hold: "hold", exhale: "out" };

  const fmtSecs = (s) => (Number.isInteger(s) ? String(s) : s.toFixed(1));

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

  // ---------------------------------------------------------- data

  const pb = new PocketBase(window.location.origin);

  const FALLBACK_PRESETS = [
    { name: "Box Breathing", description: "Inhale, hold, exhale, hold — four counts each.", cycles: 10,
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }, { kind: "hold", seconds: 4 }] },
    { name: "4-7-8 Relaxing Breath", description: "Inhale 4, hold 7, exhale slowly for 8.", cycles: 6,
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 7 }, { kind: "exhale", seconds: 8 }] },
    { name: "Coherent Breathing", description: "Slow even breathing, ~5.5 breaths per minute.", cycles: 15,
      phases: [{ kind: "inhale", seconds: 5.5 }, { kind: "exhale", seconds: 5.5 }] },
  ];

  const state = {
    presets: [],
    mine: [],       // account sequences (when signed in)
    local: [],      // this-device sequences
    current: null,  // sequence shown in preview / session
    editing: null,  // sequence being edited in builder
  };

  function loadLocal() {
    try { state.local = JSON.parse(localStorage.getItem(LS_SEQS)) || []; }
    catch { state.local = []; }
  }
  function saveLocal() {
    localStorage.setItem(LS_SEQS, JSON.stringify(state.local));
  }

  function normalizeRecord(r, source) {
    return {
      id: r.id,
      name: r.name,
      description: r.description || "",
      phases: r.phases,
      cycles: r.cycles || 10,
      source, // 'preset' | 'account' | 'local' | 'link' | 'adhoc'
    };
  }

  async function loadPresets() {
    try {
      const res = await pb.collection("sequences").getList(1, 50, {
        filter: "is_preset = true",
        sort: "created",
      });
      state.presets = res.items.map((r) => normalizeRecord(r, "preset"));
      localStorage.setItem("breathz.presetCache", JSON.stringify(state.presets));
    } catch {
      try {
        state.presets = JSON.parse(localStorage.getItem("breathz.presetCache")) || [];
      } catch { state.presets = []; }
      if (!state.presets.length) {
        state.presets = FALLBACK_PRESETS.map((p) => ({ ...p, source: "preset" }));
      }
    }
  }

  async function loadMine() {
    if (!pb.authStore.isValid) { state.mine = []; return; }
    try {
      const res = await pb.collection("sequences").getList(1, 200, {
        filter: `owner = "${pb.authStore.record.id}"`,
        sort: "-created",
      });
      state.mine = res.items.map((r) => normalizeRecord(r, "account"));
    } catch { state.mine = []; }
  }

  // ---------------------------------------------------------- validation

  function validateSequence(seq) {
    if (!Array.isArray(seq.phases) || seq.phases.length === 0) return "Add at least one phase.";
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
  // format: #s=i4-h4-e4-h4&c=10&n=Box%20Breathing  (seconds may be decimal)

  function encodeShare(seq) {
    const s = seq.phases.map((p) => p.kind[0] + fmtSecs(p.seconds)).join("-");
    let hash = `#s=${s}&c=${seq.cycles}`;
    if (seq.name) hash += `&n=${encodeURIComponent(seq.name)}`;
    return `${window.location.origin}/${hash}`;
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
      return validateSequence(seq) ? null : seq;
    } catch { return null; }
  }

  // ---------------------------------------------------------- audio cues

  const audio = {
    ctx: null,
    enabled: localStorage.getItem(LS_SOUND) === "1",
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
      if (!this.enabled) return;
      this.ensure();
      if (!this.ctx) return;
      const freqs = { inhale: 392, hold: 329.63, exhale: 261.63 }; // G4, E4, C4
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freqs[kind] || 329.63;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    },
  };

  function renderSoundToggle() {
    $("sound-toggle").setAttribute("aria-pressed", audio.enabled ? "true" : "false");
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
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------- home rendering

  function chipHTML(p) {
    return `<span class="chip ${p.kind}">${KIND_SHORT[p.kind]} ${fmtSecs(p.seconds)}</span>`;
  }

  function cardHTML(seq) {
    return `
      <h3>${escapeHTML(seq.name)}</h3>
      <div class="pattern">${seq.phases.map(chipHTML).join("")}</div>
      <div class="meta">${seq.cycles} cycles · ${fmtDuration(seqDuration(seq))}</div>`;
  }

  function escapeHTML(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderHome() {
    const grid = $("preset-grid");
    grid.innerHTML = "";
    for (const seq of state.presets) {
      const card = document.createElement("button");
      card.className = "seq-card";
      card.innerHTML = cardHTML(seq);
      card.addEventListener("click", () => openPreview(seq));
      grid.appendChild(card);
    }

    const mineAll = [...state.mine, ...state.local];
    $("mine-deck").hidden = mineAll.length === 0;
    const mineGrid = $("mine-grid");
    mineGrid.innerHTML = "";
    for (const seq of mineAll) {
      const card = document.createElement("button");
      card.className = "seq-card";
      card.innerHTML = cardHTML(seq) +
        (seq.source === "local" ? `<div class="meta" style="margin-top:6px">on this device</div>` : "");
      card.addEventListener("click", () => openPreview(seq));
      mineGrid.appendChild(card);
    }
  }

  // ---------------------------------------------------------- preview

  function openPreview(seq) {
    state.current = { ...seq, phases: seq.phases.map((p) => ({ ...p })) };
    $("preview-name").textContent = seq.name;
    $("preview-desc").textContent = seq.description || "";
    $("preview-pattern").innerHTML = seq.phases.map(chipHTML).join("");
    $("preview-cycles").value = seq.cycles;
    updatePreviewDuration();
    const own = seq.source === "account" || seq.source === "local";
    $("edit-btn").hidden = !own;
    $("delete-btn").hidden = !own;
    show("preview");
  }

  function updatePreviewDuration() {
    const c = parseInt($("preview-cycles").value, 10);
    if (state.current && Number.isInteger(c) && c >= 1) {
      state.current.cycles = Math.min(500, c);
      $("preview-duration").textContent = `≈ ${fmtDuration(seqDuration(state.current))}`;
    }
  }

  // ---------------------------------------------------------- session engine

  const ORB_MIN = 0.62;
  const ORB_MAX = 1.0;
  const EASE = "cubic-bezier(0.37, 0, 0.63, 1)";

  const session = {
    running: false,
    paused: false,
    seq: null,
    flat: [],          // flattened [{kind, seconds, cycle}]
    idx: 0,
    scale: ORB_MIN,    // orb scale at the START of current phase
    anims: [],
    phaseStart: 0,     // performance.now() at phase start
    phaseDur: 0,       // ms
    pausedAt: 0,
    raf: 0,

    start(seq) {
      this.seq = seq;
      this.flat = [];
      for (let c = 0; c < seq.cycles; c++) {
        for (const p of seq.phases) this.flat.push({ ...p, cycle: c + 1 });
      }
      this.idx = 0;
      this.scale = ORB_MIN;
      this.running = true;
      this.paused = false;
      this.anims.forEach((a) => a.cancel()); // leftovers from a finished run
      this.anims = [];
      $("session-done").hidden = true;
      document.querySelector(".session-stage").style.display = "";
      setOrbScale(ORB_MIN);
      show("session");
      $("pause-btn").textContent = "Pause";
      wakeLock.acquire();
      audio.ensure();
      this.runPhase();
    },

    runPhase() {
      if (!this.running) return;
      if (this.idx >= this.flat.length) return this.finish();

      const phase = this.flat[this.idx];
      const target = phase.kind === "inhale" ? ORB_MAX
                   : phase.kind === "exhale" ? ORB_MIN
                   : this.scale;

      $("phase-label").textContent = KIND_LABEL[phase.kind];
      $("cycle-indicator").textContent = `cycle ${phase.cycle} of ${this.seq.cycles}`;
      audio.cue(phase.kind);

      this.phaseDur = phase.seconds * 1000;
      this.phaseStart = performance.now();
      // Cancel the previous phase's animations (hold shimmers run forever,
      // fill:'forwards' ones stay retained) before starting the next.
      this.anims.forEach((a) => a.cancel());
      this.anims = animateOrb(this.scale, target, this.phaseDur, phase.kind);
      this.scale = target;

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
      if (goHome) show("preview");
    },

    finish() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      wakeLock.release();
      const total = fmtDuration(seqDuration(this.seq));
      $("done-summary").textContent =
        `${this.seq.cycles} cycles of ${this.seq.name} — about ${total} of mindful breathing.`;
      document.querySelector(".session-stage").style.display = "none";
      $("session-done").hidden = false;
    },
  };

  function setOrbScale(s) {
    $("orb").style.transform = `scale(${s})`;
    $("orb-halo").style.transform = `scale(${s})`;
  }

  // Animate orb + halo for one phase. Returns the Animation objects.
  function animateOrb(from, to, durMs, kind) {
    const orb = $("orb");
    const halo = $("orb-halo");
    const opts = { duration: durMs, easing: EASE, fill: "forwards" };

    if (reducedMotion.matches) {
      // Gentle opacity pulse instead of movement.
      const o = kind === "inhale" ? [0.55, 1] : kind === "exhale" ? [1, 0.55] : [1, 1];
      return [
        orb.animate({ opacity: o }, opts),
        halo.animate({ opacity: o }, opts),
      ];
    }

    if (from === to) {
      // hold: a barely-perceptible shimmer so the orb feels alive
      const s = `scale(${from})`;
      const s2 = `scale(${from * 1.015})`;
      const holdOpts = { duration: Math.max(1200, durMs / 2), easing: EASE, iterations: Infinity, direction: "alternate" };
      return [orb.animate({ transform: [s, s2] }, holdOpts), halo.animate({ transform: [s, s2] }, holdOpts)];
    }

    const kf = { transform: [`scale(${from})`, `scale(${to})`] };
    const haloKf = {
      transform: [`scale(${from})`, `scale(${to})`],
      opacity: kind === "inhale" ? [0.7, 1] : [1, 0.7],
    };
    return [orb.animate(kf, opts), halo.animate(haloKf, opts)];
  }

  // ---------------------------------------------------------- builder

  function openBuilder(seq) {
    state.editing = seq
      ? { ...seq, phases: seq.phases.map((p) => ({ ...p })) }
      : { name: "", phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }], cycles: 10, source: "adhoc" };
    $("builder-title").textContent = seq ? "Edit sequence" : "Create a sequence";
    $("builder-name").value = state.editing.name || "";
    $("builder-cycles").value = state.editing.cycles;
    $("builder-error").textContent = "";
    $("builder-note").textContent = pb.authStore.isValid
      ? "Saved sequences sync to your account."
      : "Saved sequences stay on this device. Sign in to sync them.";
    renderPhaseRows();
    show("builder");
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
    seq.name = $("builder-name").value.trim() || "My sequence";
    seq.cycles = Math.min(500, Math.max(1, parseInt($("builder-cycles").value, 10) || 10));
    return seq;
  }

  async function builderSave() {
    const seq = builderCollect();
    const err = validateSequence(seq);
    if (err) { $("builder-error").textContent = err; return; }
    $("builder-error").textContent = "";

    if (pb.authStore.isValid) {
      try {
        const payload = {
          name: seq.name,
          description: seq.description || "",
          phases: seq.phases,
          cycles: seq.cycles,
          owner: pb.authStore.record.id,
          is_preset: false,
        };
        let rec;
        if (seq.source === "account" && seq.id) {
          rec = await pb.collection("sequences").update(seq.id, payload);
        } else {
          rec = await pb.collection("sequences").create(payload);
        }
        await loadMine();
        renderHome();
        toast("Saved to your account");
        openPreview(normalizeRecord(rec, "account"));
      } catch (e) {
        $("builder-error").textContent = "Could not save — " + (e?.message || "unknown error");
      }
    } else {
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
  }

  // ---------------------------------------------------------- auth

  const authUI = { mode: "signin" };

  function renderAuthState() {
    if (pb.authStore.isValid) {
      $("auth-btn").textContent = "Sign out";
    } else {
      $("auth-btn").textContent = "Sign in";
    }
  }

  function setAuthMode(mode) {
    authUI.mode = mode;
    const signin = mode === "signin";
    $("auth-title").textContent = signin ? "Welcome back" : "Create your account";
    $("auth-submit").textContent = signin ? "Sign in" : "Create account";
    $("auth-switch-text").textContent = signin ? "No account yet?" : "Already have one?";
    $("auth-switch-btn").textContent = signin ? "Create one" : "Sign in";
    $("auth-password").autocomplete = signin ? "current-password" : "new-password";
    $("auth-error").textContent = "";
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    $("auth-error").textContent = "";
    try {
      if (authUI.mode === "signup") {
        await pb.collection("users").create({ email, password, passwordConfirm: password });
      }
      await pb.collection("users").authWithPassword(email, password);
      $("auth-dialog").close();
      renderAuthState();
      await loadMine();
      renderHome();
      toast(authUI.mode === "signup" ? "Account created — welcome" : "Signed in");
      offerLocalSync();
    } catch (err) {
      const data = err?.data?.data;
      const first = data && Object.values(data)[0]?.message;
      $("auth-error").textContent = first || err?.message || "Something went wrong.";
    }
  }

  async function offerLocalSync() {
    if (!state.local.length || !pb.authStore.isValid) return;
    if (!confirm(`Move ${state.local.length} sequence(s) from this device to your account?`)) return;
    const failed = [];
    for (const seq of state.local) {
      try {
        await pb.collection("sequences").create({
          name: seq.name, description: seq.description || "",
          phases: seq.phases, cycles: seq.cycles,
          owner: pb.authStore.record.id, is_preset: false,
        });
      } catch { failed.push(seq); }
    }
    state.local = failed;
    saveLocal();
    await loadMine();
    renderHome();
    toast(failed.length ? "Some sequences could not be moved" : "Sequences moved to your account");
  }

  // ---------------------------------------------------------- wire-up

  function bind() {
    $("brand-link").addEventListener("click", (e) => { e.preventDefault(); show("home"); });

    $("sound-toggle").addEventListener("click", () => {
      audio.enabled = !audio.enabled;
      localStorage.setItem(LS_SOUND, audio.enabled ? "1" : "0");
      if (audio.enabled) { audio.ensure(); audio.cue("hold"); }
      renderSoundToggle();
    });

    $("auth-btn").addEventListener("click", () => {
      if (pb.authStore.isValid) {
        pb.authStore.clear();
        state.mine = [];
        renderAuthState();
        renderHome();
        toast("Signed out");
      } else {
        setAuthMode("signin");
        $("auth-dialog").showModal();
      }
    });
    $("auth-cancel").addEventListener("click", () => $("auth-dialog").close());
    $("auth-switch-btn").addEventListener("click", () =>
      setAuthMode(authUI.mode === "signin" ? "signup" : "signin"));
    $("auth-form").addEventListener("submit", handleAuthSubmit);

    // preview
    $("preview-back").addEventListener("click", () => show("home"));
    $("preview-cycles").addEventListener("input", updatePreviewDuration);
    $("start-btn").addEventListener("click", () => {
      const err = validateSequence(state.current);
      if (err) { toast(err); return; }
      session.start(state.current);
    });
    $("share-btn").addEventListener("click", async () => {
      const url = encodeShare(state.current);
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied — share your rhythm");
      } catch {
        prompt("Copy this link:", url);
      }
    });
    $("edit-btn").addEventListener("click", () => openBuilder(state.current));
    $("delete-btn").addEventListener("click", async () => {
      const seq = state.current;
      if (!confirm(`Delete “${seq.name}”?`)) return;
      if (seq.source === "account") {
        try { await pb.collection("sequences").delete(seq.id); await loadMine(); }
        catch { toast("Could not delete"); return; }
      } else if (seq.source === "local") {
        state.local = state.local.filter((s) => s.id !== seq.id);
        saveLocal();
      }
      renderHome();
      show("home");
      toast("Deleted");
    });

    // session
    $("pause-btn").addEventListener("click", () => session.paused ? session.resume() : session.pause());
    $("end-btn").addEventListener("click", () => session.stop());
    $("again-btn").addEventListener("click", () => session.start(state.current));
    $("done-home-btn").addEventListener("click", () => { show("home"); });

    // builder
    $("new-sequence-btn").addEventListener("click", () => openBuilder(null));
    $("builder-back").addEventListener("click", () => show("home"));
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
      const err = validateSequence(seq);
      if (err) { $("builder-error").textContent = err; return; }
      openPreview(seq);
    });

    // keyboard: space toggles pause in session, esc ends
    document.addEventListener("keydown", (e) => {
      if (!session.running) return;
      if (e.code === "Space") { e.preventDefault(); session.paused ? session.resume() : session.pause(); }
      if (e.code === "Escape") session.stop();
    });
  }

  // ---------------------------------------------------------- boot

  async function boot() {
    loadLocal();
    renderSoundToggle();
    renderAuthState();
    bind();

    // refresh stale auth token if present
    if (pb.authStore.isValid) {
      pb.collection("users").authRefresh().catch(() => {
        pb.authStore.clear();
        state.mine = [];
        renderAuthState();
        renderHome();
      });
    }

    await loadPresets();
    await loadMine();
    renderHome();

    // shared link? (also handle links opened while the app is already running)
    const handleSharedHash = () => {
      const shared = decodeShare(window.location.hash);
      if (shared) {
        if (session.running) session.stop(false);
        openPreview(shared);
        history.replaceState(null, "", "/");
      }
    };
    handleSharedHash();
    window.addEventListener("hashchange", handleSharedHash);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }

  boot();
})();
