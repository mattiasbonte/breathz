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
    hint: "up as you breathe in, across on holds, down on the out",
    // The dot travels the square's edges with breath-true directions:
    // inhale climbs a vertical edge, exhale descends one, holds cross
    // horizontally. Classic box patterns trace a continuous loop; in/out
    // patterns bounce up and down the same edge like a piston.
    _x: 0, _y: 1, // current corner, fractions of side (y: 0 = top, 1 = bottom)
    _pos(stage, x, y) {
      const side = stage.querySelector(".box-frame").clientWidth;
      return `translate(${x * side}px, ${y * side}px)`;
    },
    _target(kind) {
      if (kind === "inhale") return { x: this._x, y: 0 };
      if (kind === "exhale") return { x: this._x, y: 1 };
      return { x: 1 - this._x, y: this._y };
    },
    build(stage) {
      const frame = el(stage, "box-frame");
      el(frame, "box-dot");
    },
    set(stage, lv, phaseIdx = 0) {
      if (phaseIdx === 0) { this._x = 0; this._y = lv > 0.5 ? 0 : 1; }
      stage.querySelector(".box-dot").style.transform = this._pos(stage, this._x, this._y);
    },
    animate(stage, ctx) {
      const dot = stage.querySelector(".box-dot");
      const from = this._pos(stage, this._x, this._y);
      const t = this._target(ctx.kind);
      this._x = t.x; this._y = t.y;
      return [fwd(dot, { transform: [from, this._pos(stage, t.x, t.y)] }, ctx.durMs)];
    },
  };

  // ----------------------------------------------------------- 4b. triangle

  const triangle = {
    id: "triangle",
    name: "Triangle",
    hint: "climb one slope as you inhale, cross the top, release down the other",
    // Flat-top triangle: corners TL, TR and a bottom point. Inhale ascends,
    // holds cross the top, exhale descends — three phases, three sides.
    _pos: "bottom", // 'bottom' | 'tl' | 'tr'
    _xy(stage, pos) {
      const frame = stage.querySelector(".tri-frame");
      const w = frame.clientWidth, h = frame.clientHeight;
      const pts = { tl: [0, 0], tr: [w, 0], bottom: [w / 2, h] };
      const [x, y] = pts[pos];
      return `translate(${x}px, ${y}px)`;
    },
    _target(kind) {
      if (kind === "inhale") return this._pos === "bottom" ? "tl" : this._pos;
      if (kind === "exhale") return "bottom";
      return this._pos === "tl" ? "tr" : this._pos === "tr" ? "tl" : "bottom";
    },
    build(stage) {
      const frame = el(stage, "tri-frame");
      frame.innerHTML =
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
        '<polygon points="1,1 99,1 50,99" fill="none" stroke="rgba(165,180,252,0.55)" ' +
        'stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
      el(frame, "tri-dot");
    },
    set(stage, lv, phaseIdx = 0) {
      if (phaseIdx === 0) this._pos = lv > 0.5 ? "tl" : "bottom";
      stage.querySelector(".tri-dot").style.transform = this._xy(stage, this._pos);
    },
    animate(stage, ctx) {
      const dot = stage.querySelector(".tri-dot");
      const from = this._xy(stage, this._pos);
      const target = this._target(ctx.kind);
      if (target === this._pos) return genericHold(stage, ctx.durMs);
      this._pos = target;
      return [fwd(dot, { transform: [from, this._xy(stage, target)] }, ctx.durMs)];
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

  // ------------------------------------------------------------ 12. nebula

  const nebula = {
    id: "nebula",
    name: "Nebula",
    hint: "slow-turning clouds of light, swelling with every breath",
    _s: (lv) => 0.66 + lv * 0.4,
    build(stage) {
      const holder = el(stage, "nebula-holder");
      el(holder, "neb-cloud neb-a");
      el(holder, "neb-cloud neb-b");
      el(holder, "neb-cloud neb-c");
      for (let i = 0; i < 14; i++) {
        const angle = i * 137.5 * (Math.PI / 180);
        const radius = 10 + ((i * 6151) % 30);
        el(holder, "neb-star", {
          left: `${50 + Math.cos(angle) * radius}%`,
          top: `${50 + Math.sin(angle) * radius}%`,
          width: `${1.5 + (i % 3)}px`, height: `${1.5 + (i % 3)}px`,
          animationDelay: `${(i * 397) % 3000}ms`,
        });
      }
    },
    set(stage, lv) {
      const h = stage.querySelector(".nebula-holder");
      h.style.transform = `scale(${this._s(lv)})`;
      h.style.opacity = 0.7 + lv * 0.3;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const h = stage.querySelector(".nebula-holder");
      return [fwd(h, {
        transform: [`scale(${this._s(ctx.from)})`, `scale(${this._s(ctx.to)})`],
        opacity: [0.7 + ctx.from * 0.3, 0.7 + ctx.to * 0.3],
      }, ctx.durMs)];
    },
  };

  // -------------------------------------------------------------- 13. veil

  const veil = {
    id: "veil",
    name: "Aurora",
    hint: "curtains of northern light lift as you breathe in",
    _n: 5,
    _y: (lv) => 16 - lv * 22, // % translateY per bar
    build(stage) {
      const holder = el(stage, "veil-holder");
      for (let i = 0; i < this._n; i++) el(holder, `veil-bar veil-${i}`);
    },
    set(stage, lv) {
      stage.querySelectorAll(".veil-bar").forEach((b, i) => {
        b.style.transform = `translateY(${this._y(lv) + i * 1.5}%)`;
        b.style.opacity = 0.35 + lv * 0.55;
      });
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const anims = [];
      stage.querySelectorAll(".veil-bar").forEach((b, i) => {
        anims.push(fwd(b, {
          transform: [
            `translateY(${this._y(ctx.from) + i * 1.5}%)`,
            `translateY(${this._y(ctx.to) + i * 1.5}%)`,
          ],
          opacity: [0.35 + ctx.from * 0.55, 0.35 + ctx.to * 0.55],
        }, ctx.durMs, i * 90));
      });
      return anims;
    },
  };

  // ------------------------------------------------------------ 14. flower

  const flower = {
    id: "flower",
    name: "Flower of Life",
    hint: "six circles unfold from one — sacred geometry in motion",
    _r: (lv) => 4 + lv * 21, // % outward travel of the outer circles
    build(stage) {
      const holder = el(stage, "fol-holder");
      el(holder, "fol-circle fol-center");
      for (let i = 0; i < 6; i++) {
        const arm = el(holder, "fol-arm");
        arm.style.transform = `rotate(${i * 60}deg)`;
        el(arm, "fol-circle fol-outer");
      }
    },
    set(stage, lv) {
      stage.querySelector(".fol-holder").style.transform = `rotate(${lv * 24}deg) scale(${0.82 + lv * 0.18})`;
      stage.querySelectorAll(".fol-outer").forEach((c) => {
        c.style.transform = `translateY(-${this._r(lv)}%)`;
        c.style.opacity = 0.35 + lv * 0.5;
      });
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const anims = [fwd(stage.querySelector(".fol-holder"), {
        transform: [
          `rotate(${ctx.from * 24}deg) scale(${0.82 + ctx.from * 0.18})`,
          `rotate(${ctx.to * 24}deg) scale(${0.82 + ctx.to * 0.18})`,
        ],
      }, ctx.durMs)];
      stage.querySelectorAll(".fol-outer").forEach((c) => {
        anims.push(fwd(c, {
          transform: [`translateY(-${this._r(ctx.from)}%)`, `translateY(-${this._r(ctx.to)}%)`],
          opacity: [0.35 + ctx.from * 0.5, 0.35 + ctx.to * 0.5],
        }, ctx.durMs));
      });
      return anims;
    },
  };

  // -------------------------------------------------------------- 15. moon

  const moon = {
    id: "moon",
    name: "Moon",
    hint: "waxing to full as you fill, waning as you release",
    _shadow: (lv) => lv * 106, // % the shadow slides away
    build(stage) {
      el(stage, "moon-glow");
      const disc = el(stage, "moon-disc");
      el(disc, "moon-shadow");
      for (let i = 0; i < 10; i++) {
        const angle = i * 137.5 * (Math.PI / 180);
        const radius = 34 + ((i * 3571) % 12);
        el(stage, "neb-star", {
          left: `${50 + Math.cos(angle) * radius}%`,
          top: `${50 + Math.sin(angle) * radius}%`,
          width: "2px", height: "2px",
          animationDelay: `${(i * 631) % 3000}ms`,
        });
      }
    },
    set(stage, lv) {
      stage.querySelector(".moon-shadow").style.transform = `translateX(${this._shadow(lv)}%)`;
      stage.querySelector(".moon-glow").style.opacity = 0.15 + lv * 0.6;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      return [
        fwd(stage.querySelector(".moon-shadow"), {
          transform: [`translateX(${this._shadow(ctx.from)}%)`, `translateX(${this._shadow(ctx.to)}%)`],
        }, ctx.durMs),
        fwd(stage.querySelector(".moon-glow"), {
          opacity: [0.15 + ctx.from * 0.6, 0.15 + ctx.to * 0.6],
        }, ctx.durMs),
      ];
    },
  };

  // --------------------------------------------------------- 16. fireflies

  const fireflies = {
    id: "fireflies",
    name: "Fireflies",
    hint: "a meadow of warm lights, drawing close on the in-breath",
    _n: 18,
    _s: (lv) => 1.15 - lv * 0.45,
    build(stage) {
      const holder = el(stage, "fly-holder");
      for (let i = 0; i < this._n; i++) {
        const angle = i * 137.5 * (Math.PI / 180);
        const radius = 14 + ((i * 4241) % 32);
        el(holder, "firefly", {
          left: `${50 + Math.cos(angle) * radius}%`,
          top: `${50 + Math.sin(angle) * radius}%`,
          width: `${3 + (i % 3)}px`, height: `${3 + (i % 3)}px`,
          animationDelay: `${(i * 577) % 4000}ms, ${(i * 811) % 2600}ms`,
          animationDuration: `${3400 + (i % 5) * 700}ms, ${1900 + (i % 4) * 500}ms`,
        });
      }
      el(stage, "fly-heart");
    },
    set(stage, lv) {
      stage.querySelector(".fly-holder").style.transform = `scale(${this._s(lv)})`;
      const heart = stage.querySelector(".fly-heart");
      heart.style.transform = `scale(${0.6 + lv * 0.5})`;
      heart.style.opacity = 0.25 + lv * 0.55;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      return [
        fwd(stage.querySelector(".fly-holder"), {
          transform: [`scale(${this._s(ctx.from)})`, `scale(${this._s(ctx.to)})`],
        }, ctx.durMs),
        fwd(stage.querySelector(".fly-heart"), {
          transform: [`scale(${0.6 + ctx.from * 0.5})`, `scale(${0.6 + ctx.to * 0.5})`],
          opacity: [0.25 + ctx.from * 0.55, 0.25 + ctx.to * 0.55],
        }, ctx.durMs),
      ];
    },
  };

  // ------------------------------------------------------------ 17. vision
  // Breathes with a personal image (the user's "target slide"): set one via
  // “set an intention” in the preview. Falls back to a soft orb when empty.

  const vision = {
    id: "vision",
    name: "Vision",
    hint: "your own image breathing with you — add one under “set an intention”",
    _s: (lv) => 0.68 + lv * 0.32,
    build(stage) {
      el(stage, "vision-halo");
      const disc = el(stage, "vision-disc");
      const img = localStorage.getItem("breathz.visionImage");
      if (img) disc.style.backgroundImage = `url(${img})`;
      else disc.classList.add("vision-empty");
    },
    set(stage, lv) {
      const s = `scale(${this._s(lv)})`;
      stage.querySelector(".vision-disc").style.transform = s;
      const halo = stage.querySelector(".vision-halo");
      halo.style.transform = s;
      halo.style.opacity = 0.4 + lv * 0.6;
    },
    animate(stage, ctx) {
      if (ctx.kind === "hold") return genericHold(stage, ctx.durMs);
      const f = this._s(ctx.from), t = this._s(ctx.to);
      return [
        fwd(stage.querySelector(".vision-disc"), {
          transform: [`scale(${f})`, `scale(${t})`],
        }, ctx.durMs),
        fwd(stage.querySelector(".vision-halo"), {
          transform: [`scale(${f})`, `scale(${t})`],
          opacity: [0.4 + ctx.from * 0.6, 0.4 + ctx.to * 0.6],
        }, ctx.durMs),
      ];
    },
  };

  window.BreathStyles = [
    orb, rings, bloom, box, triangle, tide, cosmos, sway, mandala, column, beacon,
    nebula, veil, flower, moon, fireflies, vision,
  ];
})();
