# E2E tests

Playwright suite covering the whole app: breathing-first home, mood-based
selection, sessions (start/pause/resume/finish), mood journal, builder,
share links (pattern + style), per-practice default animations, all 11
styles, keyboard navigation, service worker, and 320px mobile layout.

```sh
# terminal 1 — serve the repo root
python3 -m http.server 8931

# terminal 2
cd tests/e2e && npm install && npm test
```

Set the executablePath in test.js if your Chromium lives elsewhere.
