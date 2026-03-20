# LoRaWAN Dashboard

A modern Next.js dashboard for visualizing LoRaWAN GPS pings, managing board access, and importing field data.

It combines a live map UI, role-based access control, PostgreSQL-backed storage, and optional Keycloak login for OAuth-based access.

## Highlights

- Live LoRaWAN map with marker, heatmap, and hexagon views
- Role-based access for `admin`, `user`, and guest visitors
- Local username/password login plus optional Keycloak sign-in
- Board-level visibility controls for non-admin users
- Manual board import over Web Serial
- Automatic remote log polling and incremental ping updates
- Reusable component structure with modular client/server helpers

## Tech Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `PostgreSQL` via `pg`
- `next-auth` with `Keycloak`
- `Leaflet` + `react-leaflet`
- `ESLint`

## Features

### Mapping

- Marker, heatmap, and hexagon rendering modes
- Signal quality and stability filtering
- Board and gateway filtering
- Playback timeline for historical ping exploration
- Guest-safe aggregated hexagon view

### Authentication

- Local session-based login for internal users
- Optional OAuth login through Keycloak
- Admin bootstrap account on first database initialization
- Per-board authorization for regular users

### Data Flow

- Polls a remote LoRaWAN log source on an interval
- Normalizes pings into PostgreSQL tables
- Recomputes signal stability bonus values
- Exposes filtered datasets through API routes
- Optionally subscribes to a ChirpStack MQTT broker for live ping ingestion

### ChirpStack MQTT Integration

- Optional live data ingestion via MQTT from a ChirpStack instance
- Automatically processes incoming uplinks and inserts new pings
- Configured entirely through environment variables in `.env.local`

## Project Structure

```text
src/
	app/                  Next.js app routes and API routes
	components/
		admin/              Admin-specific UI blocks
		auth/               Login and auth UI
		dashboard/          Dashboard controls and layout
		i18n/               Language switcher UI
		map/                Leaflet map rendering
		ui/                 Reusable UI primitives
	hooks/                Shared client hooks
	i18n/                 Translation dictionaries and helpers
	lib/                  Shared domain utilities and types
	server/               Auth, database, and ping services
	types/                Ambient TypeScript declarations
data/
	pings.geojson         Bundled dataset file
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment file

Copy `example.env.local` to `.env.local` and fill in the values.

```bash
cp example.env.local .env.local
```

### 3. Start PostgreSQL

Use your own PostgreSQL instance and set `DATABASE_URL` accordingly.

Example from `example.env.local`:

```env
DATABASE_URL=postgresql://lorawan:lorawan@localhost:5432/lorawan
```

### 4. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

On startup, the server automatically applies any pending SQL migrations from `src/server/migrations/` and seeds the default admin account if no admin exists yet.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Secret used by `next-auth` |
| `KEYCLOAK_ID` | For Keycloak | Keycloak client ID |
| `KEYCLOAK_SECRET` | For Keycloak | Keycloak client secret |
| `KEYCLOAK_ISSUER` | For Keycloak | Keycloak realm issuer URL |
| `LORAWAN_ADMIN_USERNAME` | No | Initial admin username, only used when no admin exists |
| `LORAWAN_ADMIN_PASSWORD` | No | Initial admin password, only used when no admin exists |
| `APP_URL` | Recommended in deployed setups | Trusted origin used for request-origin validation |
| `NEXT_PUBLIC_APP_URL` | Optional | Fallback trusted origin if `APP_URL` is not set |
| `LORAWAN_LOG_URL` | No | Overrides the default remote log source |
| `MQTT_BROKER` | No | ChirpStack MQTT broker hostname |
| `MQTT_PORT` | No | MQTT broker port (default: 1883) |
| `MQTT_USERNAME` | No | MQTT username |
| `MQTT_PASSWORD` | No | MQTT password |
| `MQTT_TOPIC` | No | MQTT topic to subscribe to (default: `application/+/device/+/event/up`) |

### Default Admin Bootstrap

On first startup, the app applies the database migrations and seeds one local admin account if no admin exists yet.

Default credentials:

- username: `admin`
- password: `admin1234`

Override them before the first run if needed:

```bash
export LORAWAN_ADMIN_USERNAME="your-admin-name"
export LORAWAN_ADMIN_PASSWORD="your-secure-password"
```

### Database
The database migrations are managed automatically by the server on startup. To manually apply or inspect migrations, see `src/server/migrations/`.

#### Layout

![LoRaWAN Dashboard Layout](./assets/database_layout.png)



## Authentication Modes

### Local auth

- Uses `/api/auth/login`
- Creates a server-managed session cookie
- Best for internal accounts managed in the admin panel

### Keycloak auth

- Configured through `next-auth`
- Uses the provider setup in `src/server/next-auth.ts`
- Can coexist with local auth users

An example standalone Keycloak setup is included in `keycloak-compose.yml`.

## Docker

The repo includes a production-oriented `Dockerfile` and a `docker-compose.yml` for running the dashboard container.

Build and run the app container:

```bash
docker compose up -d --build
```

Notes:

- The container exposes port `3000`
- The container copies `src/server/migrations/` into the runtime image so database migrations can be applied automatically
- The `data/` directory is mounted to persist bundled data files
- You still need a reachable PostgreSQL database via `DATABASE_URL`

## Developer Workflow

### Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

### Recommended checks

```bash
npm run lint
npm run build
```

## API Overview

High-level route groups:

- `src/app/api/auth/*` — local login/logout and NextAuth integration
- `src/app/api/pings/*` — dataset access, summaries, manual imports, and remote updates
- `src/app/api/users/*` — admin-only user management

## Security Notes

- Mutating API routes validate request origin using `APP_URL` or forwarded host headers
- JSON endpoints enforce `application/json`
- Passwords are hashed with `bcryptjs`
- Regular users only receive pings for their assigned boards

## Localization

Translations live in:

- `src/i18n/locales/en.json`
- `src/i18n/locales/de.json`

The client-side translation provider is wired in `src/app/layout.tsx`.

## Notes for Contributors

- Prefer shared helpers in `src/lib/`, `src/hooks/`, and `src/components/ui/` before adding new one-off logic
- Keep API auth checks centralized in `src/server/api-auth.ts`
- Keep admin and dashboard flows modular rather than growing page-level components further

## License

No license file is currently included in this repository.
