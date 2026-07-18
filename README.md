# breathz

A calm, configurable breathing companion for breathwork sessions. Box breathing, 4-7-8, coherent breathing — or any rhythm you design yourself.

**One binary. One port. Your server.**

## Features

- **8 preset practices** — box breathing, 4-7-8, coherent breathing, triangle, extended exhale, and more, seeded automatically on first run.
- **Custom sequences** — compose any pattern of inhale / hold / exhale phases (0.5–120 s each, up to 12 phases, up to 500 cycles).
- **Beautiful, distraction-free sessions** — a breathing orb animated on the compositor thread (60 fps, battery-friendly), aurora backdrop, optional soft audio cues.
- **Shareable links** — every sequence encodes into a URL (`/#s=i4-h7-e8&c=6&n=Wind%20down`) you can hand to anyone. No account needed to open one.
- **Works without an account** — sequences save to the device; sign up later and move them to your account in one tap.
- **Auth & sync** — email/password accounts via PocketBase; your sequences follow you across devices.
- **PWA** — installable, offline-capable app shell, screen wake lock keeps the display on during sessions, `prefers-reduced-motion` respected.
- **Admin UI** — manage users and preset sequences at `/_/` (PocketBase dashboard).

## Quick start

Requires Go 1.24+.

```sh
git clone <this-repo> breathz
cd breathz
go build -o breathz .
./breathz serve --http 0.0.0.0:8090
```

Open `http://localhost:8090`. That's it — migrations run automatically, presets are seeded, data lives in `./pb_data/` (SQLite).

Create the admin (superuser) account for the `/_/` dashboard:

```sh
./breathz superuser upsert you@example.com <a-strong-password>
```

### Development

Serve the frontend from disk instead of the embedded copy, so edits show up on refresh:

```sh
BREATHZ_PUBLIC_DIR=./pb_public go run . serve
```

## Deploying on your own server

The binary is fully self-contained (frontend embedded). A minimal production setup:

**1. Build & copy** (cross-compile if your server's arch differs):

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o breathz .
scp breathz you@server:/opt/breathz/
```

**2. systemd unit** — `/etc/systemd/system/breathz.service`:

```ini
[Unit]
Description=breathz breathing app
After=network.target

[Service]
User=breathz
WorkingDirectory=/opt/breathz
ExecStart=/opt/breathz/breathz serve --http 127.0.0.1:8090
Restart=on-failure
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

**3. Reverse proxy with auto-TLS** — Caddyfile:

```
breathz.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

HTTPS matters beyond security: the wake lock API, clipboard sharing, and PWA install all require a secure context.

**4. Backups** — in the admin UI (`/_/` → Settings → Backups) enable scheduled backups, optionally to any S3-compatible bucket (e.g. Cloudflare R2). Everything lives in `pb_data/`.

### Upgrading

Pull, rebuild, restart the service. New migrations apply automatically on start. PocketBase is pre-1.0 — read its release notes before bumping the dependency.

## Architecture

```
main.go            PocketBase embedded as a Go framework; pb_public embedded via go:embed
migrations/        1: sequences collection + API access rules   2: seed presets
pb_public/         static frontend — no build step, no framework
  js/app.js        session engine (WAAPI), builder, auth, share links, wake lock, audio
  css/app.css      design system; continuous animations touch only transform/opacity
  sw.js            offline app shell (never intercepts /api/ or /_/)
docs/              market research & tech stack decisions
```

**Data model** — one `sequences` collection:

| field | type | notes |
|---|---|---|
| name | text | required, ≤100 chars |
| description | text | ≤500 chars |
| phases | json | `[{"kind":"inhale"\|"hold"\|"exhale","seconds":4}]` |
| cycles | number | 1–500 |
| is_preset | bool | presets are global, owned by no one |
| owner | relation → users | cascade delete |

API rules enforce: anyone reads presets, users read/write only their own sequences, nobody but admins touches presets.

## License

MIT
