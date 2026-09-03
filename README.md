# RADAR — Release & Deployment Activity Radar

![RADAR logo](static/logo-full.svg)

A web dashboard that tracks the **latest releases** of your services' release
sources and the **version currently deployed** in each deployment — with a
clear signal when an update is available, plus optional email/webhook
notifications.

- Login via **OIDC**; group membership from a configurable OIDC claim.
- Create **services**, attach **release sources** (Docker, GitHub, PyPI, npm,
  apt, generic URL), and track **deployments** that report their running version.
- Polling is periodic and configurable per source/deployment.
- "N versions behind" lag computed per release source with proper version
  comparison (semver, or Debian/dpkg semantics for apt).
- History charts show releases and deployments over time.
- Docker image published to GHCR via GitHub Actions.

## Stack

SvelteKit (adapter-node) + TypeScript · better-sqlite3 · openid-client · jose ·
semver · deb-version-compare · nodemailer · ECharts

## Development

```bash
npm install
cp config/radar.example.yaml config/radar.yaml   # edit with your OIDC details
npm run dev
```

Checks and tests:

```bash
npm run check   # svelte-check / typecheck
npm run test    # vitest
```

## Configuration

Configuration is read from a YAML file. Its location comes from the
`RADAR_CONFIG` environment variable, the `--config` CLI flag, or defaults to
`config/radar.yaml`. See `config/radar.example.yaml` for the full reference.

The `server.host` and `server.port` values drive both the dev server
(`npm run dev`) and the production server (`npm run start`), so change them in
the YAML rather than relying on env vars. Make sure `oidc.redirect_uri` and
`server.base_url` match the port you actually serve on, or login will fail.

Key sections:

- `oidc` — issuer, client id/secret, redirect URI, and the dotted claim path
  that holds group membership (e.g. `groups` or `user.groups`).
  `client_auth_method` (`post` | `basic` | `none`) controls how the client
  authenticates to the token endpoint; use `basic` if your IdP rejects the
  code exchange with `invalid_client`.
- `session.secret` — at least 32 characters; used to sign session cookies.
- `smtp` — optional; omitting it disables email notifications (webhooks still work).
- `polling` — scheduler tick, concurrency, and default intervals.

## Docker

```bash
docker build -t radar .
docker run -p 3000:3000 \
  -e RADAR_CONFIG=/app/config/radar.yaml \
  -v $(pwd)/config/radar.yaml:/app/config/radar.yaml:ro \
  -v $(pwd)/data:/app/data \
  radar
```

Or with the included compose file:

```bash
cp docker-compose.example.yml docker-compose.yml  # adjust the image name
docker compose up -d
```

`docker-compose.example.yml` is in `.dockerignore`, so you must copy it before
use. GitHub Actions builds and pushes the image to
`ghcr.io/<your-org>/radar:latest` on pushes to `main`.

## Manual deployments / self-reported versions

A deployment with query type **manual** gets a secret report token. It can
self-report its version with:

```bash
curl -X POST https://radar.example.com/api/deployments/<id>/report/<token> \
  -H 'Content-Type: application/json' \
  -d '{"version":"1.2.3"}'
```

The token is generated when the deployment is created and shown on the service
page.

## Update status

Each deployment shows its current deployed version and a status compared to its
release source's latest version (using proper semver/Debian comparison):

- **N behind** — the deployed version is older than the latest release by N
  versions.
- **up to date** — the deployed version matches the latest release.
- **ahead** — the deployed version is newer than the latest release (e.g. a
  newer prerelease), so no update is pending.

Version strings are normalized on ingest (a leading `v`/`V` is stripped when the
remainder is a valid semver), so tags like `v1.2.3` and reported versions like
`1.2.3` are treated and displayed as the same version.

By default a source only tracks **full versions** (`major.minor.patch`) — alias
tags such as `latest`, `unstable`, or short major tags like `v0.8` are ignored
for the version list, update detection, and the history chart. This can be
turned off per source (the "Only full versions" option) for sources that use
shorter version schemes.

## Service logos

Services can have a logo set by URL or uploaded (PNG/JPEG/WebP, max 2 MB,
stored in the database). Edit a service to set it.

## Notifications

Per deployment, enable notifications to get an email and/or webhook POST on
each new release the deployment is behind. Recipients are explicit email
addresses plus members of chosen OIDC groups (resolved from their profile
email). Notifications are deduplicated per (deployment, version).

## Limitations

- Single instance, single process. Don't run multiple replicas against the same
  SQLite file (the background poller would double-run).
- Release sources and version endpoints must be public/unauthenticated; no
  credentials are stored.
- GitHub releases API has an unauthenticated rate limit (~60 requests/hour/IP),
  fine for tens of sources.
- The `apt` source accepts either a `Packages`/`Packages.gz` file URL or a
  repository directory URL (Radar auto-detects an HTML directory listing and
  follows the `Packages` link). `.bz2` indexes are not supported.
