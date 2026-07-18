/* breathz — breathing animation styles.
   Contract per style:
     build(stage)                    create DOM inside the stage (a square box)
     set(stage, level, phaseIdx)     apply the static state for level 0..1
                                     (inline styles = baseline that animations
                                     fall back to when cancelled)
     animate(stage, ctx) -> [Animation]
       ctx = { from, to, durMs, kind, phaseIdx }   from/to are levels 0..1
   Rules: only transform & opacity are animated (compositor thread). */
(() => {
  "use strict";

  const EASE = "cubic-bezier(0.37, 0, 0.63, 1)"; // easeInOutSine

  const lerp = (a, b, t) => a + (b - a) * t;

  function fwd(el, keyframes, durMs, delay = 0) {
    return el.animate(keyframes, { duration: durMs, easing: EASE, fill: "forwards", delay });
  }

  // Generic gentle shimmer for hold phases (styles reuse it).
  function genericHold(stage, durMs) {
    return [stage.animate(
      { opacity: [1, 0.9] },
      { duration: Math.max(1400, durMs / 2), easing: EASE, iterations: Infinity, direction: "alternate" }
    )];
  }

  function el(parent, cls, style = {}) {
    const d = document.createElement("div");
    d.className = cls;
    Object.assign(d.style, style);
    parent.appendChild(d);
    return d;
  }

  // ---------------------------------------------------------------- 1. orb

  const orb = {
    id: "orb",
    name: "Orb",
    hint: "a glowing sphere that swells with your breath",
    _s: (lv) => 0.62 + lv * 0.38,
    build(stage) {
      el(stage, "orb-halo").id = "orb-halo";
      el(stage, "orb").id = "orb";
    },
    set(stage, lv) {
      const s = `scale(${this._s(lv)})`;
      stage.querySelector(".orb").style.transform = s;
      stage.querySelector(".orb-halo").style.transform = s;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const f = this._s(ctx.from), t = this._s(ctx.to);
      const o = stage.querySelector(".orb"), h = stage.querySelector(".orb-halo");
      return [
        fwd(o, { transform: [`scale(${f})`, `scale(${t})`] }, ctx.durMs),
        fwd(h, {
          transform: [`scale(${f})`, `scale(${t})`],
          opacity: ctx.kind === "inhale" ? [0.7, 1] : [1, 0.7],
        }, ctx.durMs),
      ];
    },
  };

  // -------------------------------------------------------------- 2. rings

  const rings = {
    id: "rings",
    name: "Ripples",
    hint: "concentric rings ripple outward as you inhale",
    _n: 4,
    _s: (lv, i) => 0.30 + lv * 0.42 + i * 0.14,
    build(stage) {
      for (let i = 0; i < this._n; i++) el(stage, `ring ring-${i}`);
      el(stage, "ring-core");
    },
    set(stage, lv) {
      stage.querySelectorAll(".ring").forEach((r, i) => {
        r.style.transform = `scale(${this._s(lv, i)})`;
      });
      stage.querySelector(".ring-core").style.transform = `scale(${0.16 + lv * 0.1})`;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const anims = [];
      stage.querySelectorAll(".ring").forEach((r, i) => {
        anims.push(fwd(r, {
          transform: [`scale(${this._s(ctx.from, i)})`, `scale(${this._s(ctx.to, i)})`],
          opacity: ctx.kind === "inhale" ? [0.35 + i * 0.05, 0.9 - i * 0.15] : [0.9 - i * 0.15, 0.35 + i * 0.05],
        }, ctx.durMs, i * 70));
      });
      const core = stage.querySelector(".ring-core");
      anims.push(fwd(core, {
        transform: [`scale(${0.16 + ctx.from * 0.1})`, `scale(${0.16 + ctx.to * 0.1})`],
      }, ctx.durMs));
      return anims;
    },
  };

  // -------------------------------------------------------------- 3. bloom

  const bloom = {
    id: "bloom",
    name: "Bloom",
    hint: "a lotus that opens on the in-breath, closes on the out",
    _n: 8,
    _t: (lv, i) => `rotate(${i * 45 + lv * 22}deg) translateY(${-(8 + lv * 26)}%) scale(${0.75 + lv * 0.35})`,
    build(stage) {
      const holder = el(stage, "bloom-holder");
      for (let i = 0; i < this._n; i++) el(holder, "petal");
      el(stage, "bloom-heart");
    },
    set(stage, lv) {
      stage.querySelectorAll(".petal").forEach((p, i) => {
        p.style.transform = this._t(lv, i);
        p.style.opacity = 0.45 + lv * 0.35;
      });
      stage.querySelector(".bloom-heart").style.transform = `scale(${0.8 + lv * 0.3})`;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const anims = [];
      stage.querySelectorAll(".petal").forEach((p, i) => {
        anims.push(fwd(p, {
          transform: [this._t(ctx.from, i), this._t(ctx.to, i)],
          opacity: [0.45 + ctx.from * 0.35, 0.45 + ctx.to * 0.35],
        }, ctx.durMs));
      });
      const heart = stage.querySelector(".bloom-heart");
      anims.push(fwd(heart, {
        transform: [`scale(${0.8 + ctx.from * 0.3})`, `scale(${0.8 + ctx.to * 0.3})`],
      }, ctx.durMs));
      return anims;
    },
  };

  // ---------------------------------------------------------------- 4. box

  const box = {
    id: "box",
    name: "Box Trace",
    hint: "a light travels the square — one side per phase",
    _corners: [[0, 0], [1, 0], [1, 1], [0, 1]], // TL TR BR BL, fractions of side
    _dotPos(stage, corner) {
      const frame = stage.querySelector(".box-frame");
      const side = frame.clientWidth;
      const [cx, cy] = this._corners[corner % 4];
      return `translate(${cx * side}px, ${cy * side}px)`;
    },
    _frameScale: (lv) => 0.9 + lv * 0.12,
    build(stage) {
      const frame = el(stage, "box-frame");
      el(frame, "box-dot");
    },
    set(stage, lv, phaseIdx = 0) {
      stage.querySelector(".box-frame").style.transform =
        `translate(-50%, -50%) scale(${this._frameScale(lv)})`;
      stage.querySelector(".box-dot").style.transform = this._dotPos(stage, phaseIdx);
    },
    animate(stage, ctx) {
      const frame = stage.querySelector(".box-frame");
      const dot = stage.querySelector(".box-dot");
      const anims = [
        // the dot always travels one edge per phase — holds included
        fwd(dot, {
          transform: [this._dotPos(stage, ctx.phaseIdx), this._dotPos(stage, ctx.phaseIdx + 1)],
        }, ctx.durMs),
      ];
      if (ctx.kind !== "hold") {
        anims.push(fwd(frame, {
          transform: [
            `translate(-50%, -50%) scale(${this._frameScale(ctx.from)})`,
            `translate(-50%, -50%) scale(${this._frameScale(ctx.to)})`,
          ],
        }, ctx.durMs));
      }
      return anims;
    },
  };

  // --------------------------------------------------------------- 5. tide

  const tide = {
    id: "tide",
    name: "Tide",
    hint: "water rises and falls inside a circle of glass",
    _y: (lv) => 78 - lv * 62, // % translateY of the water block
    build(stage) {
      const bowl = el(stage, "tide-bowl");
      const water = el(bowl, "tide-water");
      el(water, "tide-crest tide-crest-a");
      el(water, "tide-crest tide-crest-b");
    },
    set(stage, lv) {
      stage.querySelector(".tide-water").style.transform = `translateY(${this._y(lv)}%)`;
    },
    animate(stage, ctx) {
      const water = stage.querySelector(".tide-water");
      const anims = [];
      if (ctx.kind === "hold") {
        anims.push(...genericHold(stage, ctx.durMs));
      } else {
        anims.push(fwd(water, {
          transform: [`translateY(${this._y(ctx.from)}%)`, `translateY(${this._y(ctx.to)}%)`],
        }, ctx.durMs));
      }
      // surface always sways gently
      stage.querySelectorAll(".tide-crest").forEach((c, i) => {
        anims.push(c.animate(
          { transform: [`translateX(${i ? -6 : 6}%)`, `translateX(${i ? 6 : -6}%)`] },
          { duration: 2600 + i * 700, easing: EASE, iterations: Infinity, direction: "alternate" }
        ));
      });
      return anims;
    },
  };

  // ------------------------------------------------------------- 6. cosmos

  const cosmos = {
    id: "cosmos",
    name: "Starfield",
    hint: "stars drift in as you breathe in, out as you let go",
    _n: 26,
    _cloudScale: (lv) => 1.18 - lv * 0.62,
    build(stage) {
      const cloud = el(stage, "cosmos-cloud");
      for (let i = 0; i < this._n; i++) {
        // deterministic scatter: golden-angle spiral
        const angle = i * 137.5 * (Math.PI / 180);
        const radius = 16 + ((i * 7919) % 34);
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        const size = 2 + ((i * 31) % 4);
        el(cloud, "star", {
          left: `${x}%`, top: `${y}%`,
          width: `${size}px`, height: `${size}px`,
          opacity: 0.35 + ((i * 17) % 50) / 100,
        });
      }
      el(stage, "cosmos-core");
    },
    set(stage, lv) {
      stage.querySelector(".cosmos-cloud").style.transform =
        `scale(${this._cloudScale(lv)}) rotate(${lv * 24}deg)`;
      stage.querySelector(".cosmos-core").style.transform = `scale(${0.5 + lv * 0.5})`;
      stage.querySelector(".cosmos-core").style.opacity = 0.35 + lv * 0.55;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const cloud = stage.querySelector(".cosmos-cloud");
      const core = stage.querySelector(".cosmos-core");
      return [
        fwd(cloud, {
          transform: [
            `scale(${this._cloudScale(ctx.from)}) rotate(${ctx.from * 24}deg)`,
            `scale(${this._cloudScale(ctx.to)}) rotate(${ctx.to * 24}deg)`,
          ],
        }, ctx.durMs),
        fwd(core, {
          transform: [`scale(${0.5 + ctx.from * 0.5})`, `scale(${0.5 + ctx.to * 0.5})`],
          opacity: [0.35 + ctx.from * 0.55, 0.35 + ctx.to * 0.55],
        }, ctx.durMs),
      ];
    },
  };

  // --------------------------------------------------------------- 7. sway

  const sway = {
    id: "sway",
    name: "Sway",
    hint: "a light glides along the arc — left to right and back",
    _a: (lv) => -32 + lv * 64,
    build(stage) {
      el(stage, "sway-arc");
      const arm = el(stage, "sway-arm");
      el(arm, "sway-bulb");
    },
    set(stage, lv) {
      stage.querySelector(".sway-arm").style.transform =
        `translateX(-50%) rotate(${this._a(lv)}deg)`;
    },
    animate(stage, ctx) {
      const arm = stage.querySelector(".sway-arm");
      if (ctx.kind === "hold") {
        const a = this._a(ctx.from);
        return [arm.animate(
          { transform: [`translateX(-50%) rotate(${a - 1.2}deg)`, `translateX(-50%) rotate(${a + 1.2}deg)`] },
          { duration: Math.max(1600, ctx.durMs / 2), easing: EASE, iterations: Infinity, direction: "alternate" }
        )];
      }
      return [fwd(arm, {
        transform: [
          `translateX(-50%) rotate(${this._a(ctx.from)}deg)`,
          `translateX(-50%) rotate(${this._a(ctx.to)}deg)`,
        ],
      }, ctx.durMs)];
    },
  };

  // ------------------------------------------------------------ 8. mandala

  const mandala = {
    id: "mandala",
    name: "Mandala",
    hint: "slowly turning geometry that breathes with you",
    _s: (lv) => 0.6 + lv * 0.4,
    build(stage) {
      const holder = el(stage, "mandala-holder");
      el(holder, "mandala-layer mandala-a");
      el(holder, "mandala-layer mandala-b");
      el(holder, "mandala-layer mandala-c");
      el(holder, "mandala-eye");
    },
    set(stage, lv) {
      stage.querySelector(".mandala-holder").style.transform = `scale(${this._s(lv)})`;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const holder = stage.querySelector(".mandala-holder");
      return [fwd(holder, {
        transform: [`scale(${this._s(ctx.from)})`, `scale(${this._s(ctx.to)})`],
      }, ctx.durMs)];
    },
  };

  // ------------------------------------------------------------- 9. column

  const column = {
    id: "column",
    name: "Column",
    hint: "a quiet bar of light — pure and minimal",
    _fill: (lv) => 0.12 + lv * 0.88,
    build(stage) {
      const track = el(stage, "column-track");
      el(track, "column-fill");
      el(track, "column-glow");
    },
    set(stage, lv) {
      stage.querySelector(".column-fill").style.transform = `scaleY(${this._fill(lv)})`;
      stage.querySelector(".column-glow").style.opacity = 0.2 + lv * 0.5;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const fill = stage.querySelector(".column-fill");
      const glow = stage.querySelector(".column-glow");
      return [
        fwd(fill, {
          transform: [`scaleY(${this._fill(ctx.from)})`, `scaleY(${this._fill(ctx.to)})`],
        }, ctx.durMs),
        fwd(glow, { opacity: [0.2 + ctx.from * 0.5, 0.2 + ctx.to * 0.5] }, ctx.durMs),
      ];
    },
  };

  // ------------------------------------------------------------ 10. beacon

  const beacon = {
    id: "beacon",
    name: "Beacon",
    hint: "just light, softly brightening and dimming",
    build(stage) {
      el(stage, "beacon-light");
    },
    set(stage, lv) {
      const light = stage.querySelector(".beacon-light");
      light.style.transform = `scale(${0.82 + lv * 0.12})`;
      light.style.opacity = 0.28 + lv * 0.62;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const light = stage.querySelector(".beacon-light");
      return [fwd(light, {
        transform: [`scale(${0.82 + ctx.from * 0.12})`, `scale(${0.82 + ctx.to * 0.12})`],
        opacity: [0.28 + ctx.from * 0.62, 0.28 + ctx.to * 0.62],
      }, ctx.durMs)];
    },
  };

  window.BreathStyles = [orb, rings, bloom, box, tide, cosmos, sway, mandala, column, beacon];
})();
