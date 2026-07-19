/* breathz — pure data model. No DOM, no storage: every function here takes
   values in and returns values out, so app.js stays wiring and this stays
   testable. Loaded before app.js; exposed as window.BreathModel.

   Shapes:
     phase    { kind: "inhale"|"hold"|"exhale", seconds, open? }
                open holds count UP and wait for the breather to release —
                `seconds` is then an estimate used for duration display.
     segment  { title?, phases: [phase], cycles }
     practice { name, description?, style?, intention?, by?, source,
                phases?+cycles?  (single-pattern shorthand)  OR
                segments: [segment] }
   Everything accepts both practice shapes; segmentsOf() is the normalizer. */
(() => {
  "use strict";

  const KINDS = ["inhale", "hold", "exhale"];
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
  const KIND_SHORT = { inhale: "in", hold: "hold", exhale: "out" };

  // ---------------------------------------------------------- formatting

  const fmtSecs = (s) => (Number.isInteger(s) ? String(s) : s.toFixed(1));
  const fmtCycles = (n) => `${n} cycle${n === 1 ? "" : "s"}`;

  function fmtDuration(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = Math.round(totalSecs % 60);
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m} min`;
    return `${m} min ${s}s`;
  }

  // ---------------------------------------------------------- normalizing

  function segmentsOf(seq) {
    if (Array.isArray(seq?.segments)) return seq.segments;
    return [{ phases: seq?.phases || [], cycles: seq?.cycles || 1 }];
  }

  const isProgram = (seq) => segmentsOf(seq).length > 1;

  function segmentDuration(seg) {
    return seg.phases.reduce((a, p) => a + p.seconds, 0) * (seg.cycles || 1);
  }

  function practiceDuration(seq) {
    return segmentsOf(seq).reduce((a, s) => a + segmentDuration(s), 0);
  }

  const hasOpenHold = (seq) =>
    segmentsOf(seq).some((s) => s.phases.some((p) => p.open));

  // "10 cycles · 2 min 40s" or "5 parts · ≈ 12 min"
  function practiceMeta(seq) {
    const segs = segmentsOf(seq);
    const dur = fmtDuration(practiceDuration(seq));
    if (segs.length === 1) {
      return `${fmtCycles(segs[0].cycles || 1)} · ${hasOpenHold(seq) ? "≈ " : ""}${dur}`;
    }
    return `${segs.length} parts · ≈ ${dur}`;
  }

  // ---------------------------------------------------------- validation

  function validateSegment(seg) {
    if (!seg || !Array.isArray(seg.phases) || seg.phases.length === 0) return "Add at least one phase.";
    if (seg.phases.length > 12) return "Maximum 12 phases per part.";
    for (const p of seg.phases) {
      if (!KINDS.includes(p.kind)) return "Unknown phase type.";
      const max = p.open ? 600 : 120;
      if (typeof p.seconds !== "number" || !(p.seconds >= 0.5 && p.seconds <= max)) {
        return `Each phase must last between 0.5 and ${max} seconds.`;
      }
      if (p.open && p.kind !== "hold") return "Only holds can be open-ended.";
    }
    const cycles = seg.cycles;
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 500) return "Cycles must be between 1 and 500.";
    return null;
  }

  function validatePractice(seq) {
    if (!seq) return "Nothing to validate.";
    const segs = segmentsOf(seq);
    if (segs.length > 12) return "Maximum 12 parts per session.";
    for (const seg of segs) {
      const err = validateSegment(seg);
      if (err) return err;
    }
    if (!segs.some((s) => s.phases.some((p) => p.kind !== "hold"))) return "Add an inhale or exhale.";
    return null;
  }

  // ---------------------------------------------------------- share links
  // single:  #s=i4-h4-e4-h4&c=10
  // program: #p=<seg>!<seg>…  seg = [title~]tokens[*cycles]  token = i4 / h60o
  // both: &n=name &v=style &i=intention &by=name

  function phaseToken(p) {
    return p.kind[0] + fmtSecs(p.seconds) + (p.open ? "o" : "");
  }

  function parseToken(tok) {
    const m = tok.trim().match(/^([a-z]+)?\s*(\d+(?:\.\d+)?)(o?)$/i);
    if (!m) return null;
    const kind = m[1] ? TEXT_KINDS[m[1].toLowerCase()] : null;
    if (m[1] && !kind) return null;
    const phase = { kind, seconds: Math.round(parseFloat(m[2]) * 10) / 10 };
    if (m[3]) { phase.open = true; phase.kind = phase.kind || "hold"; }
    return phase;
  }

  function parsePattern(line) {
    const parsed = line.split("-").map(parseToken);
    if (parsed.some((p) => !p)) return null;
    if (parsed.every((p) => p.kind)) return parsed;
    if (parsed.every((p) => !p.kind) && BARE_PATTERNS[parsed.length]) {
      return parsed.map((p, i) => ({ ...p, kind: BARE_PATTERNS[parsed.length][i] }));
    }
    return null;
  }

  function encodeShare(seq, { style, intention } = {}) {
    const segs = segmentsOf(seq);
    let hash;
    if (segs.length === 1) {
      hash = `#s=${segs[0].phases.map(phaseToken).join("-")}&c=${segs[0].cycles || 1}`;
    } else {
      const parts = segs.map((seg) => {
        const tokens = seg.phases.map(phaseToken).join("-");
        const cyc = (seg.cycles || 1) > 1 ? `*${seg.cycles}` : "";
        const title = seg.title ? `${encodeURIComponent(seg.title)}~` : "";
        return `${title}${tokens}${cyc}`;
      });
      hash = `#p=${parts.join("!")}`;
    }
    if (seq.name) hash += `&n=${encodeURIComponent(seq.name)}`;
    if (style) hash += `&v=${style}`;
    if (intention) hash += `&i=${encodeURIComponent(intention)}`;
    if (seq.by) hash += `&by=${encodeURIComponent(seq.by)}`;
    return hash;
  }

  function decodeShare(hash, validStyleId) {
    try {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const seq = {
        name: params.get("n") || "Shared sequence",
        description: "Opened from a shared link.",
        source: "link",
      };
      if (params.get("s")) {
        seq.phases = params.get("s").split("-").map((t) => {
          const p = parseToken(t);
          if (!p || !p.kind) throw new Error("bad token");
          return p;
        });
        seq.cycles = clampCycles(params.get("c"));
      } else if (params.get("p")) {
        seq.segments = params.get("p").split("!").map((part) => {
          let title;
          const ti = part.indexOf("~");
          if (ti >= 0) { title = decodeURIComponent(part.slice(0, ti)).slice(0, 60); part = part.slice(ti + 1); }
          let cycles = 1;
          const ci = part.indexOf("*");
          if (ci >= 0) { cycles = clampCycles(part.slice(ci + 1)); part = part.slice(0, ci); }
          const phases = part.split("-").map((t) => {
            const p = parseToken(t);
            if (!p || !p.kind) throw new Error("bad token");
            return p;
          });
          return { title, phases, cycles };
        });
      } else return null;
      if (validatePractice(seq)) return null;
      const v = params.get("v");
      if (v && validStyleId?.(v)) seq.style = v;
      const intention = params.get("i");
      if (intention) seq.intention = intention.slice(0, 120);
      const by = params.get("by");
      if (by) seq.by = by.slice(0, 60);
      return seq;
    } catch { return null; }
  }

  function clampCycles(raw) {
    return Math.min(500, Math.max(1, parseInt(raw || "1", 10) || 1));
  }

  // ---------------------------------------------------------- text format
  //   name: Power Rounds
  //   -- 30 deep breaths        (a "-- title" line starts a new part)
  //   cycles: 30
  //   in 2
  //   out 1
  //   -- retention
  //   hold 60 open
  // Single-part text needs no "--" lines; JSON and compact patterns
  // ("4-7-8", "i4-h7-e8") still work.

  function seqToText(seq) {
    const segs = segmentsOf(seq);
    const lines = [`name: ${seq.name || "My sequence"}`];
    if (segs.length === 1) {
      lines.push(`cycles: ${segs[0].cycles || 1}`, "");
      for (const p of segs[0].phases) lines.push(phaseLine(p));
    } else {
      for (const seg of segs) {
        lines.push("", `-- ${seg.title || "part"}`);
        if ((seg.cycles || 1) > 1) lines.push(`cycles: ${seg.cycles}`);
        for (const p of seg.phases) lines.push(phaseLine(p));
      }
    }
    return lines.join("\n");
  }

  function phaseLine(p) {
    return `${KIND_SHORT[p.kind]} ${fmtSecs(p.seconds)}${p.open ? " open" : ""}`;
  }

  function textToSeq(text) {
    text = (text || "").trim();
    if (!text) return { error: "Nothing to read yet." };

    if (text.startsWith("{")) {
      try {
        const o = JSON.parse(text);
        const seq = { name: String(o.name || "My sequence").slice(0, 100) };
        if (Array.isArray(o.segments)) {
          seq.segments = o.segments.map((s) => ({
            title: s.title ? String(s.title).slice(0, 60) : undefined,
            cycles: parseInt(s.cycles, 10) || 1,
            phases: jsonPhases(s.phases),
          }));
        } else {
          seq.cycles = parseInt(o.cycles, 10) || 10;
          seq.phases = jsonPhases(o.phases);
        }
        const err = validatePractice(seq);
        return err ? { error: err } : { seq };
      } catch { return { error: "That JSON doesn't parse." }; }
    }

    const segments = [{ title: undefined, cycles: 1, phases: [] }];
    let name = "My sequence";
    let sawName = false;
    let sawSegmentHeader = false;
    let sawCycles = false;

    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      let m;
      if ((m = line.match(/^--\s*(.*)$/))) {
        if (sawSegmentHeader || segments[0].phases.length) {
          segments.push({ title: undefined, cycles: 1, phases: [] });
        }
        sawSegmentHeader = true;
        segments[segments.length - 1].title = m[1].trim().slice(0, 60) || undefined;
        continue;
      }
      const seg = segments[segments.length - 1];
      if ((m = line.match(/^name\s*:\s*(.+)$/i))) { name = m[1].trim().slice(0, 100); sawName = true; continue; }
      if ((m = line.match(/^cycles\s*:\s*(\d+)\s*$/i))) { seg.cycles = parseInt(m[1], 10); sawCycles = true; continue; }
      if ((m = line.match(/^([a-z]+)[\s:]+(\d+(?:\.\d+)?)\s*(open)?\s*$/i)) && TEXT_KINDS[m[1].toLowerCase()]) {
        const p = { kind: TEXT_KINDS[m[1].toLowerCase()], seconds: Math.round(parseFloat(m[2]) * 10) / 10 };
        if (m[3]) {
          if (p.kind !== "hold") return { error: "Only holds can be open." };
          p.open = true;
        }
        seg.phases.push(p);
        continue;
      }
      const pattern = parsePattern(line);
      if (pattern) { seg.phases.push(...pattern); continue; }
      return { error: `Can't read this line: “${line}”` };
    }

    let seq;
    if (segments.length === 1 && !sawSegmentHeader) {
      seq = { name, cycles: sawCycles ? segments[0].cycles : 10, phases: segments[0].phases };
    } else {
      seq = { name, segments };
    }
    if (!sawName) {
      const first = segmentsOf(seq)[0].phases;
      const secs = first.map((p) => fmtSecs(p.seconds)).join("-");
      seq.name = secs.length <= 20 && segmentsOf(seq).length === 1 ? `${secs} breath` : "My sequence";
    }
    const err = validatePractice(seq);
    return err ? { error: err } : { seq };
  }

  function jsonPhases(list) {
    return (Array.isArray(list) ? list : []).map((p) => {
      const out = {
        kind: TEXT_KINDS[String(p.kind || "").toLowerCase()],
        seconds: Math.round(Number(p.seconds) * 10) / 10,
      };
      if (p.open) out.open = true;
      return out;
    });
  }

  // Content identity (name + normalized parts) — used to spot duplicates.
  function practiceFingerprint(seq) {
    return JSON.stringify({
      name: seq.name,
      segments: segmentsOf(seq).map((s) => ({
        t: s.title || "", c: s.cycles || 1,
        p: s.phases.map((p) => [p.kind, p.seconds, !!p.open]),
      })),
    });
  }

  window.BreathModel = {
    KINDS, TEXT_KINDS, KIND_SHORT, practiceFingerprint,
    fmtSecs, fmtCycles, fmtDuration,
    segmentsOf, isProgram, practiceDuration, practiceMeta, hasOpenHold,
    validatePractice, validateSegment,
    encodeShare, decodeShare,
    seqToText, textToSeq,
  };
})();
