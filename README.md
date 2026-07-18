# breathz

A calm, minimalist breathing companion. Pick how you feel, press Begin, breathe.

**Pure static web app.** No backend, no accounts, no tracking. Your sequences live in your browser; sharing happens through URLs.

## What it does

- **Breathing-first home** — the app is already breathing when you arrive. One tap starts your last practice.
- **Feeling-based selection** — "how are you feeling?" (anxious, stressed, can't sleep, low energy, unfocused, balanced) surfaces the right techniques with a note on why they work.
- **11 evidence-informed practices** — box breathing, 4-7-8, physiological sigh, coherent breathing, extended exhale, 2:1 sleep breathing, triangle, equal breathing, wind-down, ujjayi pace, energize.
- **11 animation styles** — each practice opens in its natural visual (box traces a square, triangle a triangle, ujjayi is an ocean tide…) and every one can be changed: Orb, Ripples, Bloom, Box Trace, Triangle, Tide, Starfield, Sway, Mandala, Column, Beacon. A live demo previews the style before you begin.
- **Fully custom sequences** — any pattern of inhale / hold / exhale phases, saved in the browser.
- **Everything shareable via URL** — a link like `/#s=i4-h7-e8&c=6&n=Wind%20down&v=bloom` carries the pattern, cycles, name *and* animation style. Hand it to a client or friend; it opens ready to breathe, no install, no account.
- **Made for practice** — soft audio cues, optional vibration on phase changes (eyes-closed friendly), screen wake lock, full keyboard control, `prefers-reduced-motion` respected, session log with a gentle mood check-in (stored locally only).
- **Installable PWA** — works offline once visited.

## Run it locally

It's static files — any web server works:

```sh
git clone <this-repo> breathz && cd breathz
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy for free

The repo root is the site. Any static host works; these have free tiers with HTTPS and custom domains:

- **Cloudflare Pages** — connect the repo (build command: none, output dir: `/`), or drag-and-drop the folder. Recommended.
- **Netlify** — same: no build step, publish directory `/`.
- **GitHub Pages** — serve the root from the `main` branch. Use a user site or custom domain so the app lives at the domain root (asset paths are absolute).

HTTPS comes with all three — needed for the wake lock, clipboard sharing, and PWA install.

## For practitioners

Build a sequence (or customize a preset), pick the animation that suits the exercise, press **Share**. The link you send opens directly into that exact experience. Nothing to install, nothing to sign up for — it also keeps working offline after the first visit.

## Architecture

```
index.html            single page, four screens (home / preview / session / builder)
js/app.js             practices, moods, session engine, share links, journal
js/styles.js          the 11 breathing visuals (build/set/animate contract)
css/app.css           design system; continuous animations touch only transform/opacity
sw.js                 offline app shell
tests/e2e/            Playwright suite (serve root on :8931, then `npm test`)
```

No framework, no build step, no dependencies. Animations run on the compositor thread (Web Animations API, transform/opacity only) for 60 fps and low battery drain.

## License

MIT
