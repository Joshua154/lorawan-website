# LoRaWAN Dashboard

A Next.js dashboard for viewing LoRaWAN GPS pings, managing user access, and importing field data.

It combines map visualization, role-based permissions, PostgreSQL storage, local authentication, and optional Keycloak login.

## What this app does

- Displays LoRaWAN pings on a map (marker, heatmap, and hexagon modes)
- Supports role-based access (`admin`, `user`, guest)
- Supports local username/password login and optional Keycloak sign-in
- Restricts non-admin users to assigned boards
- Ingests data from remote log polling and optional ChirpStack MQTT uplinks

## Tech stack

- Next.js 16
- React 19
- TypeScript
- PostgreSQL (`pg`)
- NextAuth (`next-auth`) with Keycloak provider
- Leaflet and React Leaflet

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp example.env.local .env.local
```

Set at least:

- `DATABASE_URL`
- `AUTH_SECRET`

Optional for Keycloak:

- `KEYCLOAK_ID`
- `KEYCLOAK_SECRET`
- `KEYCLOAK_ISSUER`

### 3. Start PostgreSQL

Point `DATABASE_URL` to a reachable PostgreSQL instance.

Example:

```env
DATABASE_URL=postgresql://lorawan:lorawan@postgres:5432/lorawan
```

### 4. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

On startup, pending migrations in `src/server/migrations/` are applied automatically.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Secret used by NextAuth |
| `KEYCLOAK_ID` | Keycloak only | Keycloak client ID |
| `KEYCLOAK_SECRET` | Keycloak only | Keycloak client secret |
| `KEYCLOAK_ISSUER` | Keycloak only | Keycloak realm issuer URL |
| `LORAWAN_ADMIN_USERNAME` | No | Initial admin username when no admin exists |
| `LORAWAN_ADMIN_PASSWORD` | No | Initial admin password when no admin exists |
| `APP_URL` | Recommended | Trusted origin for origin validation |
| `NEXT_PUBLIC_APP_URL` | Optional | Fallback trusted origin if `APP_URL` is missing |
| `LORAWAN_LOG_URL` | No | Overrides default remote log source |
| `MQTT_BROKER` | No | ChirpStack MQTT broker hostname |
| `MQTT_PORT` | No | MQTT broker port |
| `MQTT_USERNAME` | No | MQTT username |
| `MQTT_PASSWORD` | No | MQTT password |
| `MQTT_TOPIC` | No | MQTT topic (default: `application/+/device/+/event/up`) |
| `RELEASE_TIMESTAMP` | No | Build/release timestamp metadata |

## Authentication

### Local auth

- Endpoint: `/api/auth/login`
- Creates a server-managed session cookie
- Best for internal users managed from the admin panel

### Keycloak auth

- Configured in `src/server/next-auth.ts`
- Callback URL pattern: `<APP_URL>/api/auth/callback/keycloak`
- Local example callback URL: `http://localhost:3000/api/auth/callback/keycloak`
- Can coexist with local auth users

## Default admin bootstrap

If no admin user exists, one local admin account is seeded on first startup.

Defaults (from `example.env.local`):

- Username: `admin`
- Password: `admin1234`

Override before first run in `.env.local`.

## Database

- Migrations: `src/server/migrations/`
- Applied automatically during server startup

Schema diagram:

```mermaid
erDiagram

    USERS {
        integer id PK
        text username
        text password_hash
        text role
        timestamp created_at
        text auth_type
        text oauth_provider
        text oauth_subject
    }

    SESSIONS {
        text id PK
        integer user_id FK
        timestamp created_at
        timestamp expires_at
    }

    USER_BOARDS {
        integer user_id FK
        text board_id FK
    }

    PING_FEATURES {
        integer feature_id PK
        text board_id
        integer counter
        text gateway_name
        integer rssi
        float snr
        timestamp observed_at
        float longitude
        float latitude
        integer rssi_stabilized
        integer rssi_bonus
        text network
    }

    USERS ||--o{ SESSIONS : has
    USERS ||--o{ USER_BOARDS : owns
    USER_BOARDS }o--|| PING_FEATURES : references_board
```

## Docker

Build and run with Docker Compose:

```bash
docker compose up -d --build
```

Notes:

- Container exposes port `3000`
- Runtime image includes `src/server/migrations/` so migrations can run
- You still need a reachable PostgreSQL database (`DATABASE_URL`)

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## API overview

- `src/app/api/auth/*`: Local login/logout and NextAuth handler
- `src/app/api/pings/*`: Ping retrieval, summaries, manual imports, update triggers
- `src/app/api/users/*`: Admin user management

## Security notes

- Mutating API routes validate request origin (`APP_URL` or fallback host headers)
- JSON endpoints enforce `application/json`
- Passwords are hashed with `bcryptjs`
- Non-admin users only receive pings for boards they are assigned to

## Localization

- English: `src/i18n/locales/en.json`
- German: `src/i18n/locales/de.json`

## Contributor notes

- Prefer shared utilities in `src/lib/`, `src/hooks/`, and `src/components/ui/`
- Keep API auth checks centralized in `src/server/api-auth.ts`
- Keep admin/dashboard logic modular

## License

No license file is currently included in this repository.
