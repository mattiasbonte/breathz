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
  const LS_VBACK = "breathz.visionBackdrop";
  const LS_VFOCUS = "breathz.visionFocus"; // "x,y" percentages of the focal point
  const LS_VZOOM = "breathz.visionZoom"; // 1 = cover fit, up to 2.5
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const I18N = window.BreathI18n;
  const t = I18N.t;
  const LP = I18N.localizePractice;
  const kindWord = (k) => t(k === "inhale" ? "in" : k === "hold" ? "hold" : "out");
  const kindShort = (k) => t(k === "inhale" ? "inS" : k === "hold" ? "holdS" : "outS");
  const dn = (seq) => seq.displayName ?? seq.name; // localized display name

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
      guide: { setup: [
          "Sit tall, feet grounded, hands resting anywhere comfortable.",
          "Breathe through the nose, quiet and unhurried.",
          "Four equal sides — let the count hold your attention.",
        ], cues: { inhale: "fill from the belly upward", hold: "stay soft — no strain", exhale: "empty slowly, all the way" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }, { kind: "hold", seconds: 4 }] },
    { name: "4-7-8 Relaxing Breath", style: "bloom", cycles: 6,
      description: "Dr. Andrew Weil's tranquilizing breath. Great before sleep: inhale 4, hold 7, exhale slowly for 8.",
      guide: { setup: [
          "Rest the tip of your tongue behind your upper front teeth.",
          "Inhale quietly through the nose; exhale through the mouth with a soft whoosh.",
        ], cues: { inhale: "quietly, through the nose", hold: "relax into the fullness", exhale: "whoosh — out through the mouth" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 7 }, { kind: "exhale", seconds: 8 }] },
    { name: "Physiological Sigh", style: "orb", cycles: 6,
      description: "Two stacked inhales then a long sigh out — the fastest known way to calm a spiking nervous system.",
      guide: { setup: [
          "Two inhales through the nose: a deep one, then a short sip on top.",
          "Then let everything go in one long, unhurried sigh out the mouth.",
        ], cues: { inhale: "nose — deep, then the sip", exhale: "long sigh — jaw loose" } },
      phases: [{ kind: "inhale", seconds: 2.5 }, { kind: "inhale", seconds: 1 }, { kind: "exhale", seconds: 6 }] },
    { name: "Coherent Breathing", style: "sway", cycles: 15,
      description: "Slow, even breathing at ~5.5 breaths per minute to balance the nervous system and improve HRV.",
      guide: { setup: [
          "Sit comfortably, spine easy, shoulders heavy.",
          "Smooth nose breathing — no edges between the in and the out.",
        ], cues: { inhale: "smooth and silent", exhale: "equally smooth out" } },
      phases: [{ kind: "inhale", seconds: 5.5 }, { kind: "exhale", seconds: 5.5 }] },
    { name: "Deep Sleep 4-8", style: "beacon", cycles: 12,
      description: "Exhaling twice as long as you inhale. A simple 2:1 rhythm that eases the body toward sleep.",
      guide: { setup: [
          "Best lying down, eyes closed.",
          "Nose breathing — let each long exhale sink you a little deeper.",
        ], cues: { inhale: "gentle, no effort", exhale: "twice as long — sink" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 8 }] },
    { name: "Extended Exhale", style: "column", cycles: 12,
      description: "Exhaling longer than you inhale activates the parasympathetic system. Simple and effective stress relief.",
      guide: { setup: [
          "Sit or lie comfortably; breathe through the nose.",
          "The exhale leads here — a touch longer each time, never forced.",
        ], cues: { inhale: "easy and light", exhale: "longer than the in — let go" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
    { name: "Breath of Fire", style: "fireflies", cycles: 60,
      description: "Rapid, rhythmic, equal breaths through the nose, driven from the belly — about one full breath per second. A Kundalini classic for heat and alertness. Seated, empty stomach, stop at any dizziness; not during pregnancy.",
      guide: { setup: [
          "Sit tall. All the work happens below the navel.",
          "The exhale is a quick pump of the belly — the inhale then happens by itself.",
          "Face, shoulders and chest stay completely relaxed. Stop at any dizziness.",
        ], cues: { inhale: "passive — belly springs back", exhale: "snap the navel in" } },
      phases: [{ kind: "inhale", seconds: 0.5 }, { kind: "exhale", seconds: 0.5 }] },
    { name: "Equal Breathing", style: "rings", cycles: 15,
      description: "Sama Vritti — even, unforced breaths to steady attention and restore balance.",
      guide: { setup: [
          "Sit at ease; soften your gaze or close your eyes.",
          "Nose breathing, both directions the same length — balance, not effort.",
        ], cues: { inhale: "count evenly in", exhale: "the same length out" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 4 }] },
    { name: "Triangle Breathing", style: "triangle", cycles: 10,
      description: "A gentler cousin of box breathing: inhale, hold, exhale — three sides, four counts each.",
      guide: { setup: [
          "Sit tall and settle your weight.",
          "Three equal sides: in, a soft pause at the top, and out.",
        ], cues: { inhale: "climb gently", hold: "rest at the top", exhale: "release down the far side" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }] },
    { name: "Power Rounds", style: "cosmos",
      description: "Three rounds of deep rhythmic breathing, each ending in a long hold on empty lungs — release whenever your body asks — and a 15-second recovery hold. Powerful and intense. Only seated or lying down, never in or near water, never while driving. Stop at any strong dizziness.",
      guide: { setup: [
          "Lie down or sit well-supported. Never in water, never driving.",
          "Rounds of full, deep breaths — in through the nose, letting go out the mouth.",
          "After each round: exhale, and rest empty until your body clearly asks to breathe.",
        ] },
      segments: [
        { title: "round 1 · 30 deep breaths", note: "full waves — in the nose, loose out the mouth", cycles: 30, phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "hold on empty — release when you must", note: "everything relaxed — the stillness after the storm", cycles: 1, phases: [{ kind: "hold", seconds: 60, open: true }] },
        { title: "recovery breath", note: "one big inhale — hold, soften the face", cycles: 1, phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 3 }] },
        { title: "round 2 · 30 deep breaths", note: "find the wave again — steady, not rushed", cycles: 30, phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "hold on empty", note: "let the quiet hold you", cycles: 1, phases: [{ kind: "hold", seconds: 75, open: true }] },
        { title: "recovery breath", note: "big inhale — hold, and soften", cycles: 1, phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 3 }] },
        { title: "round 3 · 30 deep breaths", note: "last round — deep and generous", cycles: 30, phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "final hold on empty", note: "nothing to do — release when the urge is clear", cycles: 1, phases: [{ kind: "hold", seconds: 90, open: true }] },
        { title: "recovery — rest in the after-glow", note: "breathe normally and notice", cycles: 1, phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 4 }] },
      ] },
    { name: "Wind Down", style: "cosmos", cycles: 8,
      description: "A slow settling pattern: deep inhale, brief pause, long releasing exhale.",
      guide: { setup: [
          "Evening pace: dim what you can, drop your shoulders.",
          "Deep in, the briefest pause, and a long letting-go out.",
        ], cues: { inhale: "deep and slow", hold: "just a moment", exhale: "let the day drain out" } },
      phases: [{ kind: "inhale", seconds: 5 }, { kind: "hold", seconds: 1.5 }, { kind: "exhale", seconds: 8 }] },
    { name: "Ujjayi Pace", style: "tide", cycles: 12,
      description: "Slow oceanic yoga breathing: long steady inhales and exhales through the nose with a soft throat constriction.",
      guide: { setup: [
          "Breathe through the nose with a gentle narrowing at the back of the throat —",
          "a soft ocean sound, like fogging a mirror with your mouth closed.",
        ], cues: { inhale: "ocean sound, steady in", exhale: "same soft sound out" } },
      phases: [{ kind: "inhale", seconds: 6 }, { kind: "exhale", seconds: 6 }] },
    { name: "Energize", style: "mandala", cycles: 20,
      description: "Faster rhythmic breathing to wake up body and mind. Stop if you feel light-headed.",
      guide: { setup: [
          "Sit tall, chest open.",
          "Brisk, even nose breaths — lively but never strained.",
        ], cues: { inhale: "crisp in", exhale: "crisp out" } },
      phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 2 }] },
    { name: "Feather Breath", style: "feather", cycles: 12,
      description: "Breathe so softly that a feather before your lips would never stir — a very slow, silent in-breath melting into a slow out-breath, no pause. If you can hear yourself breathe, soften further.",
      guide: { setup: [
          "Imagine a feather resting just before your lips.",
          "Breathe so softly it never stirs — silent, tiny, effortless.",
        ], cues: { inhale: "barely there", exhale: "even softer" } },
      phases: [{ kind: "inhale", seconds: 6 }, { kind: "exhale", seconds: 8 }] },
    { name: "Hara Breathing", style: "moon",
      description: "Slow belly breathing into the body's center of gravity, two finger-widths below the navel — the hara of Japanese tradition, the lower dantian of Taoism. Whole-body awareness first, then the breath sinks low, then turns feather-soft at five breaths a minute. Practiced for grounding, intuition and calm power.",
      guide: { setup: [
          "Sit tall on a cushion, spine easy, belly completely soft.",
          "Rest attention two finger-widths below the navel, deep inside.",
          "Let each breath sink low — as if it could reach your toes.",
        ], cues: { inhale: "slow into the low belly — gather", exhale: "radiate out from the center" } },
      segments: [
        { title: "arrive · the whole body breathes", note: "change nothing — feel the body expand and settle", cycles: 6,
          phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 5 }] },
        { title: "sink low · below the navel", note: "belly soft — the breath reaches the ground", cycles: 8,
          phases: [{ kind: "inhale", seconds: 5 }, { kind: "exhale", seconds: 6 }] },
        { title: "feather-soft · five a minute", note: "so subtle a feather would not stir — energy gathers low", cycles: 8,
          phases: [{ kind: "inhale", seconds: 5 }, { kind: "exhale", seconds: 7 }] },
      ] },
    { name: "Humming Breath", style: "rings", cycles: 12,
      description: "Bhramari, the humming-bee breath: inhale through the nose, then hum low and soft the whole way out. One sound for the mind to rest on — the vibration settles skull, chest and thoughts alike.",
      guide: { setup: [
          "Sit at ease; lips together, jaw loose, teeth slightly apart.",
          "Inhale through the nose, then hum — low, soft — until empty.",
          "Let that one sound be the only thing the mind holds.",
        ], cues: { inhale: "quiet, through the nose", exhale: "hum — feel it in your bones" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 8 }] },
    { name: "Storm & Stillness", style: "veil",
      description: "An old three-part arc — ice, water, cloud. First vigorous shaking breaths to melt what's stuck (sound welcome), then a flowing middle where breath and body move freely, then complete stillness: spine tall, not one movement, watching the body breathe itself. The storm is what makes the stillness possible.",
      guide: { setup: [
          "A room to yourself. Standing is best — you'll want to shake loose.",
          "Storm: fast strong breaths, shake legs, arms, shoulders — let sound out.",
          "Before the stillness, decide: for these minutes, not a single movement.",
        ] },
      segments: [
        { title: "the storm · shake it loose", note: "strong breaths — legs, arms, shoulders, voice: let it all move", cycles: 45,
          phases: [{ kind: "inhale", seconds: 1 }, { kind: "exhale", seconds: 1 }] },
        { title: "the flow · let it move", note: "softer now — sway, let the body move however it wants", cycles: 12,
          phases: [{ kind: "inhale", seconds: 3.5 }, { kind: "exhale", seconds: 4.5 }] },
        { title: "the stillness · not one movement", note: "spine tall, still as stone — the body breathes itself", cycles: 18,
          phases: [{ kind: "inhale", seconds: 4.5 }, { kind: "exhale", seconds: 5.5 }] },
      ] },
    { name: "Sleep Ladder", style: "beacon",
      description: "A descending ladder for sleep: the inhale stays at four counts while the exhale grows longer each part — six, seven, then eight. By the last rung the body has taken the hint. Best lying in bed, lights out.",
      guide: { setup: [
          "Lying in bed, lights low or off.",
          "Nose breathing — the exhale grows one count longer each part.",
          "Nothing to achieve: each longer out-breath sinks you further.",
        ], cues: { inhale: "easy — four counts", exhale: "longer — sink deeper" } },
      segments: [
        { title: "first rung · out for six", note: "settle in — exhale a touch longer than the in", cycles: 6,
          phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "second rung · out for seven", note: "heavier now — let the bed hold you", cycles: 6,
          phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 7 }] },
        { title: "last rung · out for eight", note: "almost there — each exhale is permission to drift", cycles: 8,
          phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 8 }] },
      ] },
    { name: "Cyclic Sighing", style: "orb", cycles: 28,
      description: "Five minutes of repeated physiological sighs — two nose inhales, one long mouth exhale. In a 2023 Stanford trial this was the most effective protocol tested for lowering stress and lifting mood, practiced daily. A beautiful wind-down before bed.",
      guide: { setup: [
          "Sit or lie comfortably.",
          "Two nose inhales — a deep one, then a short sip on top.",
          "Then one long, unhurried sigh out through the mouth.",
        ], cues: { inhale: "nose — deep, then the sip", exhale: "long sigh — let it all fall" } },
      phases: [{ kind: "inhale", seconds: 2.5 }, { kind: "inhale", seconds: 1 }, { kind: "exhale", seconds: 6 }] },
    { name: "Moon Nostril Pace", style: "moon", cycles: 12,
      description: "Chandra Bhedana, the moon-side breath: inhale through the left nostril only, exhale through the right. Yogic tradition holds the left channel to be the cooling, calming one — a pre-sleep classic.",
      guide: { setup: [
          "Right thumb closes the right nostril; inhale left.",
          "Then close the left with your ring finger and exhale right.",
          "Cool in through the moon side, warm out — every cycle the same.",
        ], cues: { inhale: "left nostril — cool in", hold: "a soft beat", exhale: "right side — warm out" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 2 }, { kind: "exhale", seconds: 6 }] },
    { name: "Abundance Rounds", style: "cosmos",
      description: "Three rounds of deep rhythmic breathing, each ending in an open empty hold — release with a tap whenever your body asks. A morning-charging classic: during each hold, generate the feeling of the life you are breathing toward, as if it were already yours. Add a vision image and intention first — they glow behind the practice. Only seated or lying down, never in or near water, never while driving.",
      guide: { setup: [
          "Lie down or sit well-supported. Never in water, never driving.",
          "Rounds of full breaths — in through the nose, letting go out the mouth.",
          "In every hold: feel the life you are choosing as already here.",
        ] },
      segments: [
        { title: "round 1 · 30 full breaths", note: "a rising tide — deep in, soft out", cycles: 30,
          phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "empty hold · feel it as yours", note: "rest empty, smile inside — abundance, as if it already happened", cycles: 1,
          phases: [{ kind: "hold", seconds: 60, open: true }] },
        { title: "recovery · gather it in", note: "one big inhale — hold, let the feeling soak into the body", cycles: 1,
          phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 3 }] },
        { title: "round 2 · 30 full breaths", note: "find the wave again — steady, generous", cycles: 30,
          phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "empty hold · gratitude", note: "held by the stillness — give thanks for what is coming", cycles: 1,
          phases: [{ kind: "hold", seconds: 75, open: true }] },
        { title: "recovery · gather it in", note: "big inhale — hold, and soften the face", cycles: 1,
          phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 3 }] },
        { title: "round 3 · 30 full breaths", note: "last round — deep and unhurried", cycles: 30,
          phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 1.5 }] },
        { title: "final hold · your vision", note: "rest empty with the image bright — stay as long as it feels good", cycles: 1,
          phases: [{ kind: "hold", seconds: 90, open: true }] },
        { title: "recovery · seal it", note: "one full inhale — hold, and seal the feeling in", cycles: 1,
          phases: [{ kind: "inhale", seconds: 2 }, { kind: "hold", seconds: 15 }, { kind: "exhale", seconds: 3 }] },
        { title: "rest · carry it with you", note: "soft breaths — bring this state into your day", cycles: 6,
          phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
      ] },
    { name: "Rising Light", style: "vision",
      description: "Slow climbing breaths with strong holds, drawing energy up the spine toward the crown — then an elevated rest to feel the wish already fulfilled, and an open-ended hold of your vision. Set an intention and image first; they carry this practice. Seated or lying down.",
      guide: { setup: [
          "Sit tall or lie down. Set your intention and vision image first.",
          "Inhale as if drawing light up the spine — a gentle squeeze low, lifting higher each breath.",
          "The final rest is yours: stay with the vision as long as you like.",
        ], cues: { inhale: "draw it up the spine", hold: "soft squeeze — light at the crown", exhale: "settle — stay lifted" } },
      segments: [
        { title: "climb · up the spine", note: "each inhale lifts it a little higher", cycles: 8,
          phases: [{ kind: "inhale", seconds: 5 }, { kind: "hold", seconds: 5 }, { kind: "exhale", seconds: 5 }] },
        { title: "crown hold · release when ready", note: "full — attention resting at the crown of the head", cycles: 1,
          phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 45, open: true }, { kind: "exhale", seconds: 6 }] },
        { title: "elevated rest · the wish fulfilled", note: "gratitude, joy, abundance — feel them now, not someday", cycles: 10,
          phases: [{ kind: "inhale", seconds: 4.5 }, { kind: "exhale", seconds: 6.5 }] },
        { title: "hold the vision · release when complete", note: "your image bright and near — release whenever you feel complete", cycles: 1,
          phases: [{ kind: "hold", seconds: 120, open: true }] },
      ] },
    { name: "Nadi Shodhana Pace", style: "sway", cycles: 12,
      description: "The timing of yogic alternate-nostril breathing: close one nostril, inhale, hold, exhale through the other, then switch sides each cycle. Balancing and clarifying.",
      guide: { setup: [
          "Right thumb closes the right nostril, ring finger the left.",
          "Inhale left, pause, exhale right — then switch sides each cycle.",
        ], cues: { inhale: "one nostril, unhurried", hold: "both closed, easy", exhale: "the other side, fully" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
    { name: "Kapalabhati Pace", style: "rings", cycles: 30,
      description: "Skull-shining breath: a passive inhale, then a short sharp exhale from the belly. A cleansing yogic kriya — seated, empty stomach, stop at any dizziness.",
      guide: { setup: [
          "Sit tall, one hand on the belly if it helps.",
          "Short, sharp exhales from the belly — the inhale is passive and quiet.",
          "Stop and breathe normally at any dizziness.",
        ], cues: { inhale: "let it come by itself", exhale: "sharp — from the belly" } },
      phases: [{ kind: "inhale", seconds: 1.5 }, { kind: "exhale", seconds: 0.5 }] },
    { name: "Bhastrika Bellows", style: "column", cycles: 30,
      description: "Yogic bellows breath — vigorous equal in and out through the nose. Practice seated on an empty stomach and stop at any dizziness. Not during pregnancy or with high blood pressure.",
      guide: { setup: [
          "Seated, spine tall, empty stomach.",
          "Vigorous and equal, in and out through the nose — like working a bellows.",
          "Stop at any dizziness; skip entirely during pregnancy or with high blood pressure.",
        ], cues: { inhale: "strong pull in", exhale: "strong push out" } },
      phases: [{ kind: "inhale", seconds: 1 }, { kind: "exhale", seconds: 1 }] },
    { name: "Buteyko Soft Breath", style: "beacon", cycles: 15,
      description: "Reduced, gentle nasal breathing with a relaxed pause after the exhale — the Buteyko way to quiet over-breathing and air hunger.",
      guide: { setup: [
          "Nose only. Jaw soft, tongue resting on the palate.",
          "Smaller, quieter breaths than feel natural — a gentle air hunger is the point.",
        ], cues: { inhale: "small and silent", exhale: "soft, incomplete", hold: "rest — comfortably empty" } },
      phases: [{ kind: "inhale", seconds: 2 }, { kind: "exhale", seconds: 3 }, { kind: "hold", seconds: 3 }] },
    { name: "Sufi Heart Rhythm", style: "mandala", cycles: 12,
      description: "Even, devotional breathing in the Sufi manner — steady counts with a soft pause at each turn, attention resting in the heart.",
      guide: { setup: [
          "Sit with dignity; let attention settle in the centre of the chest.",
          "Even counts with a soft pause at each turn — breathe as if through the heart.",
        ], cues: { inhale: "in through the heart", hold: "rest there", exhale: "out from the heart" } },
      phases: [{ kind: "inhale", seconds: 5 }, { kind: "hold", seconds: 1 }, { kind: "exhale", seconds: 5 }, { kind: "hold", seconds: 1 }] },
    { name: "Rhythmic Journey", style: "cosmos", cycles: 40,
      description: "Shamanic-style connected breathing: no pauses, like breathing to a steady drum. Sit or lie down, and return to normal breath if you feel dizzy or tingly.",
      guide: { setup: [
          "Lie down or sit well-supported; eyes closed.",
          "Connected breath — the in flows into the out with no gap, like a drumbeat.",
          "Tingling or dizziness means: return to normal breathing and rest.",
        ], cues: { inhale: "ride the rhythm in", exhale: "no pause — flow out" } },
      phases: [{ kind: "inhale", seconds: 2.5 }, { kind: "exhale", seconds: 2.5 }] },
    { name: "Deep Hold Ladder", style: "moon",
      description: "Breath-hold training: easy breathing between progressively longer holds after a full inhale, ending with one open hold for as long as feels comfortable. Builds CO₂ tolerance gently — seated only, never strain, never practice holds in water.",
      guide: { setup: [
          "Seated only — never practice breath holds in water.",
          "Easy breathing between holds; the holds themselves stay relaxed, never strained.",
        ] },
      segments: [
        { title: "settle", note: "easy nose breathing — arrive", cycles: 4, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "hold · 30", note: "full breath in — then everything soft", cycles: 1, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 30 }, { kind: "exhale", seconds: 8 }] },
        { title: "breathe easy", note: "recover — no rush", cycles: 3, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "hold · 45", note: "soft face, soft hands", cycles: 1, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 45 }, { kind: "exhale", seconds: 8 }] },
        { title: "breathe easy", note: "let the heart settle", cycles: 3, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "long hold — as long as comfortable", note: "release the moment it stops being easy", cycles: 1, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 60, open: true }, { kind: "exhale", seconds: 8 }] },
        { title: "soften", note: "long, kind exhales to finish", cycles: 4, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 8 }] },
      ] },
    { name: "Kumbhaka 1-4-2", style: "triangle", cycles: 5,
      description: "The classical pranayama ratio: hold four times the inhale, exhale twice it. Advanced — build up gently and never strain the hold.",
      guide: { setup: [
          "An advanced ratio — the hold is long. Never strain it.",
          "If the hold turns effortful, exhale early and rejoin on the next cycle.",
        ], cues: { inhale: "full but unforced", hold: "spacious — throat soft", exhale: "slow, controlled release" } },
      phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 16 }, { kind: "exhale", seconds: 8 }] },
    { name: "Full Journey", style: "veil",
      description: "A complete session arc: arrive with coherent breathing, deepen with long exhales, find stillness in the square, and return. A ready-made ten-minute class.",
      guide: { setup: [
          "Ten unhurried minutes in four movements.",
          "Nothing to get right — just follow where it leads.",
        ] },
      segments: [
        { title: "arrive", note: "smooth, even breaths — land here", cycles: 8, phases: [{ kind: "inhale", seconds: 5.5 }, { kind: "exhale", seconds: 5.5 }] },
        { title: "deepen", note: "let the exhale grow longer", cycles: 12, phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }] },
        { title: "stillness", note: "four equal sides — rest in the count", cycles: 6, phases: [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }, { kind: "hold", seconds: 4 }] },
        { title: "return", note: "easy breaths — come back slowly", cycles: 4, phases: [{ kind: "inhale", seconds: 5.5 }, { kind: "exhale", seconds: 5.5 }] },
      ] },
  ].map((p) => ({ ...p, source: "preset" }));

  // Feeling-based selection. Practices are matched by exact preset name.
  const MOODS = [
    { id: "anxious", label: "anxious",
      note: "Long exhales and the physiological sigh switch on the body's own calming reflex.",
      practices: ["Physiological Sigh", "Extended Exhale", "4-7-8 Relaxing Breath"] },
    { id: "stressed", label: "stressed",
      note: "Steady, square rhythms give a racing mind one simple thing to hold on to.",
      practices: ["Box Breathing", "Coherent Breathing", "Extended Exhale", "Storm & Stillness"] },
    { id: "sleepless", label: "can't sleep",
      note: "Exhaling far longer than you inhale tells the body it's safe to power down.",
      practices: ["4-7-8 Relaxing Breath", "Sleep Ladder", "Cyclic Sighing", "Deep Sleep 4-8", "Moon Nostril Pace", "Wind Down", "Humming Breath"] },
    { id: "tired", label: "low energy",
      note: "Brisk, even breaths gently raise alertness. Stop if you feel light-headed.",
      practices: ["Breath of Fire", "Energize", "Bhastrika Bellows", "Kapalabhati Pace"] },
    { id: "scattered", label: "unfocused",
      note: "Counting edges and corners anchors attention back in the body.",
      practices: ["Box Breathing", "Triangle Breathing", "Nadi Shodhana Pace", "Humming Breath"] },
    { id: "balanced", label: "balanced",
      note: "Coherent breathing keeps a good day steady — about five and a half breaths a minute.",
      practices: ["Coherent Breathing", "Feather Breath", "Equal Breathing", "Ujjayi Pace", "Hara Breathing"] },
    { id: "deep", label: "going deeper",
      note: "Older traditions — yogic, Sufi, shamanic — used breath as a doorway. Take these slowly and seated.",
      practices: ["Power Rounds", "Deep Hold Ladder", "Sufi Heart Rhythm", "Nadi Shodhana Pace", "Rhythmic Journey", "Kumbhaka 1-4-2", "Buteyko Soft Breath", "Hara Breathing", "Storm & Stillness"] },
    { id: "manifest", label: "manifesting",
      note: "Breath charges the state; your vision and intention carry it. Set both under \u201cset an intention or image\u201d.",
      practices: ["Abundance Rounds", "Rising Light", "Hara Breathing"] },
  ];

  const state = {
    local: [],      // this-device sequences
    favs: [],       // favorited preset names
    current: null,  // sequence shown in preview / session
    editing: null,  // sequence being edited in builder
    mood: null,     // selected mood id (per visit, deliberately not persisted)
    expandedCards: new Set(), // program cards showing all their parts
    lastCardIndex: 0,
  };

  function loadLocal() {
    state.local = readLS(LS_SEQS, []);
    state.favs = readLS(LS_FAVS, []);
    // drop saved copies that are identical to a preset (earlier versions
    // created them when a preset was edited and saved unchanged)
    const presetPrints = new Set(PRESETS.map(M.practiceFingerprint));
    const cleaned = state.local.filter((s) => !presetPrints.has(M.practiceFingerprint(s)));
    if (cleaned.length !== state.local.length) {
      state.local = cleaned;
      saveLocal();
    }
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

  function encodeShare(seq, includeIntention = true) {
    let hash = M.encodeShare(seq, {
      style: seq.style || currentStyleId,
      intention: includeIntention
        ? (seq.intention ?? localStorage.getItem(LS_INTENTION) ?? undefined)
        : undefined,
    });
    if (I18N.lang !== "en") hash += `&l=${I18N.lang}`;
    return `${window.location.origin}${window.location.pathname}${hash}`;
  }

  function validStyleId(id) {
    return id && window.BreathStyles.some((s) => s.id === id) ? id : null;
  }

  function decodeShare(hash) {
    const l = new URLSearchParams(hash.replace(/^#/, "")).get("l");
    if (l && I18N.lang !== l) setLanguage(l);
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
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    },

    // A silent looping <audio> marks the tab as playing media: phones then
    // keep the audio context and (coarsened) timers alive under a locked
    // screen instead of freezing the session. Only while cues are audible —
    // silence must never steal audio focus from someone's own music.
    keepAlive: null,
    holdOpen() {
      if (!this.enabled || this.volume <= 0) return;
      // iOS 16.4+: declare ourselves a playback session so WebAudio keeps
      // sounding with the screen locked (and past the mute switch)
      try { if ("audioSession" in navigator) navigator.audioSession.type = "playback"; } catch { /* older iOS */ }
      if (!this.keepAlive) {
        const rate = 8000, n = rate; // one second of 16-bit silence
        const buf = new ArrayBuffer(44 + n * 2);
        const v = new DataView(buf);
        const tag = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
        tag(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); tag(8, "WAVE");
        tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        tag(36, "data"); v.setUint32(40, n * 2, true); // sample bytes stay zero
        this.keepAlive = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
        this.keepAlive.loop = true;
      }
      this.keepAlive.play().catch(() => { /* no gesture yet — retried on start */ });
    },
    letGo() { this.keepAlive?.pause(); },
    // Directional cues: inhale glides up, exhale glides down, hold is a
    // level suspended shimmer (two barely-detuned tones beating slowly).
    cue(kind, stacked, seconds) {
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

      // rapid rhythms (breath of fire, bellows): a light alternating tick,
      // not the full melodic pair — at 2 phases/second that would be mush
      if (kind !== "hold" && seconds && seconds < 1.25) {
        note(kind === "inhale" ? 392 : 329.63, t, peak * 0.5, 0.35);
        return;
      }

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
    if (session.running) audio.enabled ? audio.holdOpen() : audio.letGo();
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

  const media = {
    set(title) {
      if (!("mediaSession" in navigator)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "breathz" });
        navigator.mediaSession.setActionHandler("play", () => session.resume());
        navigator.mediaSession.setActionHandler("pause", () => session.pause());
        navigator.mediaSession.setActionHandler("stop", () => session.stop());
        navigator.mediaSession.playbackState = "playing";
      } catch { /* metadata is a nicety */ }
    },
    state(s) {
      try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = s; } catch {}
    },
    clear() {
      if (!("mediaSession" in navigator)) return;
      try { navigator.mediaSession.playbackState = "none"; navigator.mediaSession.metadata = null; } catch {}
    },
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session.running && !session.paused) {
      wakeLock.acquire();
      // iOS marks the context "interrupted" while locked — pick it back up
      if (audio.enabled) { audio.ensure(); audio.holdOpen(); }
    }
  });

  // ---------------------------------------------------------- screens

  const SCREENS = ["home", "preview", "session", "builder", "practitioners", "journal"];
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

  // Is the intention image drawn as atmosphere behind the animation?
  function visionBackdropOn() {
    return !!localStorage.getItem(LS_VISION) && localStorage.getItem(LS_VBACK) !== "0";
  }

  function visionFocus() {
    const [x, y] = (localStorage.getItem(LS_VFOCUS) || "50,50").split(",").map(Number);
    return `${isFinite(x) ? x : 50}% ${isFinite(y) ? y : 50}%`;
  }

  function visionZoom() {
    const z = parseFloat(localStorage.getItem(LS_VZOOM) || "1");
    return isFinite(z) ? Math.min(2.5, Math.max(1, z)) : 1;
  }

  let visionAspect = null; // naturalWidth / naturalHeight of the stored image
  function withVisionAspect(cb) {
    if (visionAspect) { cb(visionAspect); return; }
    const img = localStorage.getItem(LS_VISION);
    if (!img) return;
    const probe = new Image();
    probe.onload = () => { visionAspect = probe.width / probe.height; cb(visionAspect); };
    probe.src = img;
  }

  // Fraction of the image visible in a cover-fit container at a given zoom.
  function visionGeom(contAspect, imgAspect, z) {
    if (imgAspect >= contAspect) return { fw: contAspect / imgAspect / z, fh: 1 / z };
    return { fw: 1 / z, fh: imgAspect / contAspect / z };
  }

  // background-size expressing "cover, then zoom in by z"
  function visionBgSize(contAspect, imgAspect, z) {
    return imgAspect >= contAspect ? `auto ${(z * 100).toFixed(1)}%` : `${(z * 100).toFixed(1)}% auto`;
  }

  function refreshVisionBackdrop() {
    const img = localStorage.getItem(LS_VISION);
    const on = visionBackdropOn();
    $("vision-backdrop").hidden = !on;
    if (on) {
      const pos = visionFocus();
      for (const id of ["vb-soft", "vb-clear"]) {
        $(id).style.backgroundImage = `url(${img})`;
        $(id).style.backgroundPosition = pos;
      }
      withVisionAspect((ia) => {
        const size = visionBgSize(window.innerWidth / window.innerHeight, ia, visionZoom());
        for (const id of ["vb-soft", "vb-clear"]) $(id).style.backgroundSize = size;
      });
    }
    $("vision-toggle").hidden = !img;
    $("vision-toggle").setAttribute("aria-pressed", on ? "true" : "false");
    $("vision-toggle").title = t("visionToggle");
  }

  const vbClarity = (lv) => 0.14 + lv * 0.34; // inhale draws the vision into focus

  function animatePhase(ctx) {
    const stage = $("stage");
    const anims = [];
    if (reducedMotion.matches) {
      // Gentle opacity pulse instead of movement, whatever the style.
      const o = ctx.kind === "inhale" ? [0.55, 1] : ctx.kind === "exhale" ? [1, 0.55] : [1, 1];
      anims.push(stage.animate({ opacity: o }, { duration: ctx.durMs, easing: EASE, fill: "forwards" }));
    } else {
      anims.push(...activeStyle().animate(stage, ctx));
    }
    if (visionBackdropOn() && !$("vision-backdrop").hidden && !reducedMotion.matches) {
      const clear = $("vb-clear");
      clear.style.opacity = vbClarity(ctx.from); // baseline the cancel falls back to
      anims.push(clear.animate(
        { opacity: [vbClarity(ctx.from), vbClarity(ctx.to)] },
        { duration: ctx.durMs, easing: EASE, fill: "forwards" }
      ));
    }
    return anims;
  }

  // ---------------------------------------------------------- language

  const LS_LANG = "breathz.lang";

  function applyI18n() {
    document.documentElement.lang = I18N.lang;
    document.querySelectorAll("[data-i18n]").forEach((el2) => { el2.textContent = t(el2.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el2) => { el2.placeholder = t(el2.dataset.i18nPh); });
    document.querySelector(".builder-text-help").textContent = t("textHelp");
    document.querySelector(".intention-help").textContent = t("intentionHelp");
    $("preview-desc").title = t("aboutPractice");
    M.setStrings({ min: t("minUnit"), cycle: t("cycleWord"), cycles: t("cyclesWord"), parts: t("partsWord") });
    const row = $("foot-langs");
    row.innerHTML = "";
    for (const [code, label] of I18N.LANGS) {
      const btn = document.createElement("button");
      btn.className = "link-btn lang-btn" + (code === I18N.lang ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => setLanguage(code));
      row.appendChild(btn);
    }
  }

  function setLanguage(code, persist = true) {
    I18N.setLang(code);
    if (persist) localStorage.setItem(LS_LANG, I18N.lang);
    applyI18n();
    renderMoodPicker();
    renderHome();
    if (currentScreen() === "preview" && state.current) openPreview(state.current);
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

  function selectStyle(id) {
    currentStyleId = id;
    localStorage.setItem(LS_STYLE, id);
    if (state.current) state.current.style = id; // override sticks to this practice
    renderStylePicker();
    styleDemo.start($("demo-stage"), demoPace(state.current));
  }

  function renderStylePicker() {
    const row = $("style-row");
    row.innerHTML = "";
    for (const s of window.BreathStyles) {
      const btn = document.createElement("button");
      const selected = s.id === currentStyleId;
      btn.className = "style-chip" + (selected ? " selected" : "");
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", selected ? "true" : "false");
      btn.textContent = I18N.styleName(s);
      btn.addEventListener("click", () => selectStyle(s.id));
      row.appendChild(btn);
    }
    $("style-hint").textContent = I18N.styleHint(activeStyle());
    $("anim-current").textContent = I18N.styleName(activeStyle());
  }

  // ---------------------------------------------------------- home

  function chipHTML(p) {
    return `<span class="chip ${p.kind}">${kindShort(p.kind)} ${fmtSecs(p.seconds)}</span>`;
  }

  function patternHTML(seq, expanded = false, withToggle = true) {
    const segs = segmentsOf(seq);
    if (segs.length === 1) return segs[0].phases.map(chipHTML).join("");
    if (!expanded && withToggle) {
      // collapsed: one summary chip so program cards match the others' height
      return `<button class="chip seg chip-more">${t("viewParts", { n: segs.length })}</button>`;
    }
    let html = segs.map((s) =>
      `<span class="chip seg">${escapeHTML(s.title || `${s.phases.length}-phase part`)}</span>`
    ).join("");
    if (withToggle) html += `<button class="chip seg chip-more">${t("showLess")}</button>`;
    return html;
  }

  function cardKey(seq) { return seq.id || seq.name; }

  function cardHTML(seq) {
    return `
      <h3>${escapeHTML(dn(seq))}</h3>
      <div class="pattern">${patternHTML(seq, state.expandedCards.has(cardKey(seq)))}</div>
      <div class="meta">${practiceMeta(seq)}${seq.source === "local" ? t("yoursMark") : ""}</div>`;
  }

  function escapeHTML(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderHomeHero() {
    const seq = homeSeq();
    $("home-seq-name").textContent = dn(LP(seq));
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
      btn.textContent = I18N.moodLabel(m.id);
      btn.addEventListener("click", () => {
        state.mood = selected ? null : m.id;
        renderMoodPicker();
        renderHome();
      });
      row.appendChild(btn);
    }
    const mood = MOODS.find((m) => m.id === state.mood);
    $("mood-note").textContent = mood ? I18N.moodNote(mood.id) : "";
  }

  // One list for the whole home grid: your sequences first, then favorited
  // presets, then the rest — a mood filters all of it together.
  function homeList() {
    const mood = MOODS.find((m) => m.id === state.mood);
    const list = [
      ...state.local,
      ...PRESETS.filter(isFav),
      ...PRESETS.filter((p) => !isFav(p)),
    ];
    if (!mood) return list;
    return list
      .filter((s) => mood.practices.includes(s.name))
      .sort((a, b) => mood.practices.indexOf(a.name) - mood.practices.indexOf(b.name));
  }

  // Cards are divs with role=button (not <button>) so the favorite star can
  // be a real button inside without invalid nesting.
  function makeCard(seq, idx) {
    const card = document.createElement("div");
    card.className = "seq-card";
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.innerHTML = cardHTML(LP(seq));
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
    const more = card.querySelector(".chip-more");
    if (more) more.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = cardKey(seq);
      if (state.expandedCards.has(key)) state.expandedCards.delete(key);
      else state.expandedCards.add(key);
      renderHome();
    });
    card.addEventListener("click", () => { state.lastCardIndex = idx; openPreview(seq); });
    return card;
  }

  function renderHome() {
    renderHomeHero();
    const mood = MOODS.find((m) => m.id === state.mood);
    $("deck-title").textContent = mood
      ? t("forWhenYouFeel", { mood: I18N.moodLabel(mood.id) })
      : t("practices");

    const grid = $("preset-grid");
    grid.innerHTML = "";
    homeList().forEach((seq, idx) => grid.appendChild(makeCard(seq, idx)));

    const n = journal().length;
    $("foot-log").hidden = n === 0;
    if (n) $("log-open").textContent = n === 1 ? t("sessionBreathed") : t("sessionsBreathed", { n });
  }

  // ------------------------------------------------ keyboard helpers

  function homeCards() {
    return [...document.querySelectorAll("#preset-grid .seq-card")];
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

  // ---------------------------------------------------------- journal page

  const MOOD_WORD = { calmer: "calmer", same: "theSame", tense: "stillTense" };

  function journalLine(e) {
    const d = new Date(e.t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    const preset = PRESETS.find((p) => p.name === e.seq);
    const shown = preset ? dn(LP(preset)) : e.seq;
    return `${d} — ${shown}, ${e.detail || fmtCycles(e.cycles)}${e.mood ? ` — ${t(MOOD_WORD[e.mood] || e.mood)}` : ""}`;
  }

  function openJournal() {
    $("journal-title").textContent = t("journalTitle");
    const n = journal().length;
    $("journal-count").textContent = n === 1 ? t("sessionBreathed") : t("sessionsBreathed", { n });
    $("journal-copy").textContent = t("copyLog");
    const list = $("journal-list");
    list.innerHTML = "";
    journal().slice().reverse().forEach((e) => {
      const li = document.createElement("li");
      li.textContent = journalLine(e);
      list.appendChild(li);
    });
    show("journal");
  }

  // ---------------------------------------------------- practitioners page

  function practitionerExampleHash() {
    return "#s=i4-h7-e8&c=6&n=Evening%20wind-down&v=bloom&i=let%20the%20day%20go&by=Your%20Name";
  }

  function openPractitioners() {
    document.querySelector(".practitioners-body h2").textContent = t("prTitle");
    document.querySelector(".pr-lede").textContent = t("prLede");
    const steps = document.querySelectorAll(".pr-steps li");
    steps[0].innerHTML = t("prStep1");
    steps[1].innerHTML = t("prStep2");
    steps[2].innerHTML = t("prStep3");
    document.querySelector(".pr-example-label").textContent = t("prExampleLabel");
    $("pr-example-open").textContent = t("prSee");
    $("pr-example-copy").textContent = t("prCopyEx");
    document.querySelector(".pr-note").textContent = t("prNote");
    $("pr-example-url").textContent =
      `${window.location.origin}${window.location.pathname}`.replace(/index\.html$/, "") +
      "#s=i4-h7-e8&c=6&n=Evening wind-down&v=bloom&i=let the day go&by=Your Name";
    show("practitioners");
  }

  // ---------------------------------------------------------- preview

  function renderPreviewPattern(expanded) {
    const L = LP(state.current);
    $("preview-pattern").innerHTML = patternHTML(L, expanded, true);
    const more = $("preview-pattern").querySelector(".chip-more");
    if (more) more.addEventListener("click", () => renderPreviewPattern(!expanded));
  }

  function openPreview(seq) {
    state.current = structuredClone(seq);
    // each practice opens in its natural animation; the picker still overrides
    if (validStyleId(seq.style)) currentStyleId = seq.style;
    const L = LP(seq);
    $("preview-name").textContent = dn(L);
    $("preview-by").textContent = seq.by ? t("preparedBy", { name: seq.by }) : "";
    $("preview-by").hidden = !seq.by;
    $("preview-desc").textContent = L.description || "";
    $("preview-desc").hidden = !L.description;
    $("preview-desc").classList.add("desc-collapsed"); // a one-line teaser, tap for the story
    $("preview-desc").setAttribute("aria-expanded", "false");
    $("style-row").hidden = true; // swipe the demo, or expand to browse
    $("anim-toggle").setAttribute("aria-expanded", "false");
    renderPreviewPattern(false); // programs fold to one "view N parts" chip
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
      // flatten parts × cycles × phases into one timeline; display copy is
      // localized (titles, notes, guide) — snapshot above stays canonical
      this.loc = LP(seq);
      this.flat = [];
      const segs = segmentsOf(this.loc);
      segs.forEach((seg, segIdx) => {
        const cycles = seg.cycles || 1;
        const next = segs[segIdx + 1];
        for (let c = 0; c < cycles; c++) {
          for (const p of seg.phases) {
            const entry = { ...p, cycle: c + 1, cycles, segIdx, segCount: segs.length, segTitle: seg.title, segNote: seg.note };
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
      refreshVisionBackdrop();
      show("session");
      ensureStage(0, 0); // after show(): styles measure the visible stage
      $("pause-btn").textContent = t("pause");
      wakeLock.acquire();
      audio.ensure();
      audio.holdOpen(); // inside the tap that started the session
      media.set(dn(this.loc));
      // grounding: how to actually breathe this one, before any counting
      const setup = this.loc.guide?.setup || [t("groundGeneric1"), t("groundGeneric2")];
      if (localStorage.getItem("breathz.ground") !== "0") {
        this.grounding = true;
        $("ground-name").textContent = dn(this.loc);
        const ul = $("ground-lines");
        ul.innerHTML = "";
        setup.forEach((line, i) => {
          const li = document.createElement("li");
          li.textContent = line;
          li.style.animationDelay = `${0.15 + i * 0.4}s`;
          ul.appendChild(li);
        });
        document.querySelector(".session-stage").style.display = "none";
        $("session-ground").hidden = false;
        $("ground-begin").focus({ preventScroll: true });
        return; // beginBreathing() continues from here
      }
      this.beginBreathing();
    },

    // leaves the grounding card and starts the countdown + first phase
    beginBreathing() {
      this.grounding = false;
      this.onActivity?.();
      $("session-ground").hidden = true;
      document.querySelector(".session-stage").style.display = "";
      if (!localStorage.getItem("breathz.swipeHintShown")) {
        localStorage.setItem("breathz.swipeHintShown", "1");
        setTimeout(() => { if (this.running) toast(t("swipeHint")); }, 4500);
      }
      // a settling countdown before the first breath (breathz.preroll seconds)
      const preRaw = parseFloat(localStorage.getItem("breathz.preroll"));
      let pre = isFinite(preRaw) ? Math.min(10, Math.max(0, Math.round(preRaw))) : 3;
      if (pre === 0) { this.preRolling = false; this.runPhase(); return; }
      this.preRolling = true;
      $("phase-label").textContent = t("ready");
      $("cycle-indicator").textContent = practiceMeta(this.seq);
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

      $("phase-label").textContent = kindWord(phase.kind);
      $("cycle-indicator").textContent = this.phaseIndicator(phase);
      $("next-up").textContent = phase.nextTitle ? t("thenSep") + phase.nextTitle : "";
      $("next-up").hidden = !phase.nextTitle;
      // the guidance line stays for the whole session — bright while learning
      // the part (first two cycles), then softened to a whisper
      const cue = phase.segNote ?? this.loc?.guide?.cues?.[phase.kind];
      $("guide-cue").textContent = cue || "";
      $("guide-cue").hidden = !cue;
      $("guide-cue").classList.toggle("cue-soft", !!cue && phase.cycle > 2);
      $("hold-release").hidden = !phase.open;
      audio.cue(phase.kind, phase.stacked, phase.seconds);
      haptics.pulse(phase.kind);

      this.phaseDur = phase.open ? Infinity : phase.seconds * 1000;
      // carry lateness from a throttled background timer into this phase,
      // so total session time stays true even at 1s background granularity
      const lag = Math.min(1500, this._lag || 0);
      this._lag = 0;
      this.phaseStart = performance.now() - lag;
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
      if (phase.open) clearTimeout(this.phaseTimer);
      else this.armPhaseTimer(this.phaseDur - lag);
      this.tickLoop();
    },

    // Authoritative phase advance: a timer, not rAF — rAF stops entirely
    // when the screen is off, timers merely coarsen, so the breathing (and
    // its cues) keeps going in a pocket or under a locked screen.
    armPhaseTimer(delay) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = setTimeout(() => {
        if (!this.running || this.paused) return;
        this._lag = performance.now() - this.phaseStart - this.phaseDur;
        this.idx++;
        this.runPhase();
      }, Math.max(50, delay));
    },

    phaseIndicator(phase) {
      if (phase.segCount > 1) {
        const title = phase.segTitle || t("partOf", { c: phase.segIdx + 1, n: phase.segCount });
        return phase.cycles > 1 ? `${title} · ${phase.cycle}/${phase.cycles}` : title;
      }
      return t("cycleOf", { c: phase.cycle, n: phase.cycles });
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
          // countdown paint only — advancing is the phase timer's job
          $("phase-count").textContent = Math.max(1, Math.ceil(Math.max(0, this.phaseDur - elapsed) / 1000));
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
      clearTimeout(this.phaseTimer);
      cancelAnimationFrame(this.raf);
      media.state("paused");
      document.body.classList.add("paused");
      $("pause-btn").textContent = t("resume");
      $("phase-label").textContent = t("pausedWord");
      document.body.classList.remove("chrome-idle");
      wakeLock.release();
    },

    resume() {
      if (!this.running || !this.paused) return;
      this.paused = false;
      this.phaseStart += performance.now() - this.pausedAt;
      if (!this.flat[this.idx].open) this.armPhaseTimer(this.phaseDur - (performance.now() - this.phaseStart));
      media.state("playing");
      this.anims.forEach((a) => a.play());
      document.body.classList.remove("paused");
      $("pause-btn").textContent = t("pause");
      $("phase-label").textContent = kindWord(this.flat[this.idx].kind);
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
        toast(I18N.styleName(activeStyle()));
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
      toast(I18N.styleName(activeStyle()));
    },

    stop(goHome = true) {
      this.running = false;
      this.paused = false;
      this.preRolling = false;
      this.grounding = false;
      $("session-ground").hidden = true;
      clearTimeout(this.preTimer);
      clearTimeout(this.phaseTimer);
      cancelAnimationFrame(this.raf);
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      wakeLock.release();
      audio.letGo();
      media.clear();
      $("hold-release").hidden = true;
      document.body.classList.remove("paused");
      document.body.classList.remove("chrome-idle");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      // openPreview repopulates the whole screen — required when the session
      // was started straight from home and the preview was never rendered.
      if (goHome) openPreview(state.current);
    },

    finish() {
      this.running = false;
      clearTimeout(this.phaseTimer);
      cancelAnimationFrame(this.raf);
      audio.letGo();
      media.clear();
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      wakeLock.release();
      $("hold-release").hidden = true;
      document.body.classList.remove("chrome-idle");
      journalAdd({ t: Date.now(), seq: this.seq.name, detail: practiceMeta(this.seq) });
      const n = journal().length;
      $("done-summary").textContent =
        t("mindfulOf", { name: dn(this.loc || this.seq), meta: practiceMeta(this.seq) }) +
        (n > 1 ? " " + t("breathSessionN", { n }) : "");
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
    $("builder-mode-toggle").textContent = mode === "text" ? t("editWithSliders") : t("editAsText");
    $("builder-error").textContent = "";
    if (mode === "text") $("builder-text").focus({ preventScroll: true });
  }

  function openBuilder(seq) {
    state.editing = seq
      ? structuredClone(seq)
      : { name: "", phases: [{ kind: "inhale", seconds: 4 }, { kind: "exhale", seconds: 6 }], cycles: 10, source: "adhoc" };
    $("builder-title").textContent = seq ? t("shapeSequence") : t("createSequence");
    $("builder-error").textContent = "";
    $("builder-note").textContent = t("builderNote");
    const program = isProgram(state.editing);
    $("builder-mode-toggle").hidden = program;
    builderMode = program ? "text" : "visual";
    $("builder-visual").hidden = program;
    $("builder-text-field").hidden = !program;
    $("builder-mode-toggle").textContent = t("editAsText");
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
        <span class="kind">${kindWord(p.kind)}</span>
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
    const print = M.practiceFingerprint(seq);
    const presetTwin = PRESETS.find((p) => M.practiceFingerprint(p) === print);
    if (presetTwin) {
      toast(t("identicalPreset"));
      openPreview(presetTwin);
      return;
    }
    const localTwin = state.local.find((s) => s.id !== seq.id && M.practiceFingerprint(s) === print);
    if (localTwin) {
      toast(t("alreadyHave"));
      openPreview({ ...localTwin });
      return;
    }
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
    toast(t("savedDevice"));
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
    // Share opens one dialog holding everything: QR, copy, native share.
    // The intention can be personal, so it ships only when the box is ticked.
    const shareUrl = () => encodeShare(state.current, $("share-include-intention").checked);
    const renderShareDialog = () => {
      const url = shareUrl();
      const qr = window.qrcode(0, "M"); // type 0 = auto-size
      qr.addData(url);
      qr.make();
      $("qr-holder").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      $("qr-caption").textContent = dn(LP(state.current));
    };
    $("share-btn").addEventListener("click", () => {
      const intention = state.current.intention ?? localStorage.getItem(LS_INTENTION);
      $("share-intention-row").hidden = !intention;
      // intentions baked into the practice were meant to travel; a personal
      // stored intention stays private unless deliberately included
      $("share-include-intention").checked = !!state.current.intention;
      renderShareDialog();
      $("share-native").hidden = !navigator.share;
      $("qr-dialog").showModal();
    });
    $("share-include-intention").addEventListener("change", renderShareDialog);
    $("share-copy").addEventListener("click", async () => {
      const url = shareUrl();
      try { await navigator.clipboard.writeText(url); toast(t("linkCopied")); }
      catch { prompt("Copy this link:", url); }
    });
    $("share-native").addEventListener("click", async () => {
      try { await navigator.share({ title: `${dn(LP(state.current))} — breathz`, url: shareUrl() }); }
      catch { /* dismissed */ }
    });
    $("qr-close").addEventListener("click", () => $("qr-dialog").close());
    $("qr-dialog").addEventListener("click", (e) => {
      if (e.target === $("qr-dialog")) $("qr-dialog").close(); // backdrop click
    });

    $("fav-btn").addEventListener("click", () => {
      toggleFav(state.current);
      renderFavBtn();
      toast(isFav(state.current) ? t("addedYours") : t("removedYours"));
    });
    $("edit-btn").addEventListener("click", () => openBuilder(state.current));
    $("delete-btn").addEventListener("click", () => {
      const seq = state.current;
      if (!confirm(t("deleteQ", { name: dn(LP(seq)) }))) return;
      state.local = state.local.filter((s) => s.id !== seq.id);
      saveLocal();
      backToHome(false);
      toast(t("deleted"));
    });

    // session
    $("pause-btn").addEventListener("click", () => session.paused ? session.resume() : session.pause());
    $("hold-release").addEventListener("click", () => session.releaseHold());
    $("ground-begin").addEventListener("click", () => { if (session.grounding) session.beginBreathing(); });
    $("ground-back").addEventListener("click", () => { if (session.grounding) session.stop(); });
    $("end-btn").addEventListener("click", () => session.stop());
    $("again-btn").addEventListener("click", () => session.start(state.current));
    $("done-home-btn").addEventListener("click", () => backToHome(false));
    document.querySelectorAll(".mood-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        journalSetLastMood(btn.dataset.mood);
        $("mood-row").hidden = true;
        const thanks = $("mood-thanks");
        thanks.textContent = btn.dataset.mood === "tense" ? t("notedTense") : t("notedNext");
        thanks.hidden = false;
      }));

    // intention: phrase persists; an image becomes the Vision style
    // Paint the crop window: the exact part of the image the session shows
    // on this screen at the current zoom and focus.
    function paintVisionWin() {
      withVisionAspect((ia) => {
        const z = visionZoom();
        const [px, py] = (localStorage.getItem(LS_VFOCUS) || "50,50").split(",").map(Number);
        const place = (elId, contAspect) => {
          const box = $(elId);
          const { fw, fh } = visionGeom(contAspect, ia, z);
          const cx = fw / 2 + ((isFinite(px) ? px : 50) / 100) * (1 - fw);
          const cy = fh / 2 + ((isFinite(py) ? py : 50) / 100) * (1 - fh);
          box.style.width = `${(fw * 100).toFixed(2)}%`;
          box.style.height = `${(fh * 100).toFixed(2)}%`;
          box.style.left = `${((cx - fw / 2) * 100).toFixed(2)}%`;
          box.style.top = `${((cy - fh / 2) * 100).toFixed(2)}%`;
        };
        place("vision-pos-win", window.innerWidth / window.innerHeight); // the backdrop
        place("vision-pos-circ", 1); // the round Vision orb (square box, drawn as circle)
      });
    }

    function refreshVisionPos() {
      const img = localStorage.getItem(LS_VISION);
      $("vision-pos").hidden = !img;
      if (!img) return;
      const frame = $("vision-pos-frame");
      frame.style.backgroundImage = `url(${img})`;
      withVisionAspect((ia) => {
        // frame takes the image's own shape (capped in height) so the whole
        // picture is visible and both axes are always meaningful
        frame.style.aspectRatio = `${ia}`;
        frame.style.maxWidth = `${Math.round(260 * ia)}px`;
        paintVisionWin();
      });
      $("vision-zoom").value = visionZoom();
      $("vision-pos-hint").textContent = t("visionPosHint");
    }

    function applyVisionChange() {
      refreshVisionBackdrop();
      builtStyleId = null; // vision style rebuilds with the new framing
      styleDemo.start($("demo-stage"), demoPace(state.current));
    }

    const toggleDesc = () => {
      const open = $("preview-desc").classList.toggle("desc-collapsed");
      $("preview-desc").setAttribute("aria-expanded", open ? "false" : "true");
    };
    $("preview-desc").addEventListener("click", toggleDesc);
    $("preview-desc").addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); toggleDesc(); }
    });

    // swipe across the demo to try the next scenery — same gesture as in-session
    (() => {
      let start = null;
      const down = (e) => { start = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
      const up = (e) => {
        if (!start || e.pointerId !== start.id) { start = null; return; }
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        start = null;
        if (Math.abs(dx) > 36 && Math.abs(dx) > 1.6 * Math.abs(dy)) {
          const styles = window.BreathStyles;
          const i = styles.findIndex((s) => s.id === currentStyleId);
          selectStyle(styles[(i + (dx < 0 ? 1 : -1) + styles.length) % styles.length].id);
        }
      };
      for (const el of [document.querySelector(".style-demo"), $("style-hint")]) {
        el.addEventListener("pointerdown", down);
        el.addEventListener("pointerup", up);
      }
    })();

    $("anim-toggle").addEventListener("click", () => {
      const open = $("style-row").hidden;
      $("style-row").hidden = !open;
      if (open) $("style-row").classList.add("reveal");
      $("anim-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    });

    $("intention-toggle").addEventListener("click", () => {
      const panel = $("intention-panel");
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        $("intention-text").value = localStorage.getItem(LS_INTENTION) || "";
        $("intention-clear").hidden = !localStorage.getItem(LS_VISION);
        refreshVisionPos();
        $("intention-text").focus({ preventScroll: true });
      }
    });

    // pan the crop window with one finger or the mouse; pinch, scroll or the
    // slider to zoom — the window always shows exactly what the session will
    (() => {
      const frame = $("vision-pos-frame");
      const ptrs = new Map();
      let pinch = null;
      let wheelT = null;
      const setFocusFromCenter = (cx, cy) => {
        withVisionAspect((ia) => {
          const { fw, fh } = visionGeom(window.innerWidth / window.innerHeight, ia, visionZoom());
          const px = fw >= 1 ? 50 : Math.min(100, Math.max(0, ((cx - fw / 2) / (1 - fw)) * 100));
          const py = fh >= 1 ? 50 : Math.min(100, Math.max(0, ((cy - fh / 2) / (1 - fh)) * 100));
          localStorage.setItem(LS_VFOCUS, `${px.toFixed(1)},${py.toFixed(1)}`);
          paintVisionWin();
        });
      };
      const centerAt = (e) => {
        const r = frame.getBoundingClientRect();
        setFocusFromCenter((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      };
      const setZoom = (z) => {
        z = Math.min(2.5, Math.max(1, z));
        localStorage.setItem(LS_VZOOM, z.toFixed(2));
        $("vision-zoom").value = z;
        paintVisionWin();
      };
      frame.addEventListener("pointerdown", (e) => {
        ptrs.set(e.pointerId, e);
        frame.setPointerCapture(e.pointerId);
        if (ptrs.size === 2) {
          const [p1, p2] = [...ptrs.values()];
          pinch = { d: Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY), z: visionZoom() };
        } else centerAt(e);
      });
      frame.addEventListener("pointermove", (e) => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.set(e.pointerId, e);
        if (ptrs.size === 2 && pinch) {
          const [p1, p2] = [...ptrs.values()];
          setZoom(pinch.z * (Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY) / pinch.d));
        } else if (ptrs.size === 1) centerAt(e);
      });
      const done = (e) => {
        if (!ptrs.delete(e.pointerId)) return;
        if (ptrs.size < 2) pinch = null;
        if (ptrs.size === 0) applyVisionChange();
      };
      frame.addEventListener("pointerup", done);
      frame.addEventListener("pointercancel", done);
      frame.addEventListener("wheel", (e) => {
        e.preventDefault();
        setZoom(visionZoom() * (1 - e.deltaY * 0.0015));
        clearTimeout(wheelT);
        wheelT = setTimeout(applyVisionChange, 300);
      }, { passive: false });
      $("vision-zoom").addEventListener("input", () => {
        localStorage.setItem(LS_VZOOM, parseFloat($("vision-zoom").value).toFixed(2));
        paintVisionWin();
      });
      $("vision-zoom").addEventListener("change", applyVisionChange);
    })();
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
          toast(t("imageTooLarge"));
          return;
        }
        currentStyleId = "vision";
        localStorage.setItem(LS_STYLE, "vision");
        if (state.current) state.current.style = "vision";
        builtStyleId = null; // force the session stage to rebuild with the new image
        $("intention-clear").hidden = false;
        localStorage.setItem(LS_VBACK, "1"); // a fresh vision starts visible
        localStorage.setItem(LS_VFOCUS, "50,50");
        localStorage.setItem(LS_VZOOM, "1");
        visionAspect = canvas.width / canvas.height;
        refreshVisionBackdrop();
        refreshVisionPos();
        renderStylePicker();
        styleDemo.start($("demo-stage"), demoPace(state.current));
        toast(t("visionSet"));
      };
      img.onerror = () => toast(t("imageUnreadable"));
      img.src = URL.createObjectURL(file);
      $("intention-image").value = "";
    });
    $("intention-clear").addEventListener("click", () => {
      localStorage.removeItem(LS_VISION);
      localStorage.removeItem(LS_VFOCUS);
      localStorage.removeItem(LS_VZOOM);
      visionAspect = null;
      $("vision-pos").hidden = true;
      refreshVisionBackdrop();
      $("intention-clear").hidden = true;
      if (currentStyleId === "vision") {
        renderStylePicker();
        styleDemo.start($("demo-stage"), demoPace(state.current));
      }
      toast(t("imageRemoved"));
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
      try { await navigator.clipboard.writeText(url); toast(t("exampleCopied")); }
      catch { prompt("Copy this link:", url); }
    });

    // the practice log lives on its own quiet page, copyable from there
    $("log-open").addEventListener("click", openJournal);
    $("journal-back").addEventListener("click", () => backToHome(false));
    $("journal-copy").addEventListener("click", async () => {
      const text = `${t("logHeader")}\n${journal().slice().reverse().map(journalLine).join("\n")}`;
      try { await navigator.clipboard.writeText(text); toast(t("logCopied")); }
      catch { prompt("Copy your log:", text); }
    });

    // depth field: deterministic star layers + trailing pointer parallax
    (() => {
      const scatter = (holder, n, minSize, maxSize, seedMul) => {
        for (let i = 0; i < n; i++) {
          const angle = i * 137.5 * (Math.PI / 180);
          const radius = 8 + ((i * seedMul) % 44);
          const star = document.createElement("div");
          star.className = "depth-star";
          const size = minSize + ((i * 13) % (maxSize - minSize + 1));
          Object.assign(star.style, {
            left: `${50 + Math.cos(angle) * radius}%`,
            top: `${50 + Math.sin(angle) * radius}%`,
            width: `${size}px`, height: `${size}px`,
            animationDuration: `${4200 + (i * 733) % 4800}ms`,
            animationDelay: `${(i * 977) % 5000}ms`,
          });
          holder.appendChild(star);
        }
      };
      scatter($("depth-far"), 20, 1, 2, 5077);   // distant: small, dim
      scatter($("depth-near"), 11, 2, 3, 8231);  // closer: slightly larger

      const layers = [
        [document.querySelector(".depth-par-nebula"), 3],
        [document.querySelector(".depth-par-far"), 7],
        [document.querySelector(".depth-par-near"), 13],
      ];
      $("screen-session").addEventListener("pointermove", (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        for (const [el2, mag] of layers) {
          el2.style.transform = `translate(${(-nx * mag).toFixed(1)}px, ${(-ny * mag).toFixed(1)}px)`;
        }
      }, { passive: true });
    })();

    // the vision backdrop can be toggled mid-breath without breaking rhythm
    $("vision-toggle").addEventListener("click", () => {
      localStorage.setItem(LS_VBACK, visionBackdropOn() ? "0" : "1");
      refreshVisionBackdrop();
    });

    // fullscreen immersion (where the API exists — iOS Safari relies on PWA)
    const fsBtn = $("fullscreen-btn");
    if (document.documentElement.requestFullscreen) {
      fsBtn.hidden = false;
      fsBtn.addEventListener("click", () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      });
      document.addEventListener("fullscreenchange", () => {
        fsBtn.classList.toggle("fs-active", !!document.fullscreenElement);
      });
    }

    // chrome fades away while you breathe; any movement brings it back
    let idleTimer = 0;
    const chromeWake = () => {
      document.body.classList.remove("chrome-idle");
      clearTimeout(idleTimer);
      if (session.running && !session.paused && !session.grounding && !session.preRolling) {
        idleTimer = setTimeout(() => {
          if (session.running && !session.paused) document.body.classList.add("chrome-idle");
        }, 4000);
      }
    };
    ["pointermove", "pointerdown", "keydown"].forEach((ev) =>
      document.addEventListener(ev, chromeWake, { passive: true }));
    session.onActivity = chromeWake; // engine pokes this on state changes

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
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && session.running && session.grounding) {
        session.beginBreathing();
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
        if (session.running && session.grounding) {
          if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); session.beginBreathing(); return; }
          if (e.code === "Escape") { session.stop(); return; }
        }
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
          else if (e.key === "v" || e.key === "V") $("vision-toggle").click();
        } else { // "well done" overlay
          if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowRight") {
            e.preventDefault(); session.start(state.current);
          } else if (e.code === "Escape" || e.code === "ArrowLeft") backToHome(false);
        }
        return;
      }

      if (e.code === "Escape") {
        if (typing) { t.blur(); return; }
        if (["preview", "builder", "practitioners", "journal"].includes(screen)) backToHome();
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
        else if (e.key === "l" || e.key === "L") { if (journal().length) openJournal(); }
        else if (e.key === "p" || e.key === "P") { openPractitioners(); }
      } else if (screen === "journal" || screen === "practitioners") {
        if (e.code === "ArrowLeft" || e.code === "Backspace") { e.preventDefault(); backToHome(); }
        else if (screen === "journal" && (e.key === "c" || e.key === "C")) $("journal-copy").click();
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
    I18N.setLang(localStorage.getItem(LS_LANG) || (navigator.language || "en").slice(0, 2));
    loadLocal();
    renderToggles();
    bind();
    applyI18n();
    renderMoodPicker();
    renderHome();
    startHomeDemo();

    // shared link? (also handle links opened while the app is already running)
    const handleSharedHash = () => {
      if (window.location.hash === "#practitioners") {
        openPractitioners(); // a stable, bookmarkable route — keep the hash
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
              toast(t("appUpdated"));
            }
          });
        });
      }).catch(() => {});
    }
  }

  boot();
})();
