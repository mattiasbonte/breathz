# E2E tests

Headless-browser tests covering the full user journey: presets, preview, session
(start/pause/resume/end), builder, guest saves, share links, signup, account CRUD,
sign-out and the service worker.

```sh
# terminal 1 — a throwaway server (use a scratch data dir, tests create users)
go build -o /tmp/breathz . && /tmp/breathz serve --dir /tmp/breathz-data --http 127.0.0.1:8931

# terminal 2
cd tests/e2e && npm install && npm test
```

Set the executablePath in test.js if your Chromium lives elsewhere.
