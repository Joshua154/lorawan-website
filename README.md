# LoRaWAN Dashboard

![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue?logo=postgresql)

A Next.js dashboard for visualizing and managing LoRaWAN GPS pings, managing user access, and importing field data from remote sources.

It combines PostgreSQL-backed storage, role-based permissions, local login, and optional Keycloak (OIDC) authentication for a robust and secure data management experience.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Docker Compose (Published Image)](#docker-compose-published-image)
- [Environment Variables](#environment-variables)
- [Keycloak Configuration](#keycloak-configuration)
- [License](#License)

## Features

- **Interactive Maps:** Displays LoRaWAN pings on a map (markers, heatmap, hexagons) using Leaflet.
- **Role-Based Access Control:** Supports dynamic roles (`admin`, `user`, `guest`).
- **Flexible Authentication:** Offers local username/password login and optional Keycloak (OIDC) sign-in.
- **Data Ingestion:** Ingests data via MQTT from ChirpStack and/or TTN (The Things Network), with optional remote log polling as fallback.
- **Granular Permissions:** Restricts non-admin users to view only their assigned boards.

## Requirements

- **Node.js**: 20+
- **npm**: 10+
- **PostgreSQL**: 14+ (or compatible)

## Tech Stack

- **Framework:** Next.js 16 (React 19)
- **Language:** TypeScript
- **Database:** PostgreSQL (`pg`)
- **Authentication:** NextAuth (`next-auth`) with Keycloak provider
- **Mapping:** Leaflet & React Leaflet

## Quick Start

### 1. Install Dependencies

Clone this repository and install the project dependencies:

```bash
git clone https://github.com/Joshua154/lorawan-website.git
cd lorawan-website
npm install
```

### 2. Configure Environment Variables

Create your local environment configuration:

```bash
cp example.env.local .env.local
```

**Required Variables:**
- `DATABASE_URL`: Connection string for your PostgreSQL instance.
- `AUTH_SECRET`: A secure random string for NextAuth.
- `LORAWAN_LOG_URL`: The Url of the Log File

**Optional Keycloak Variables:**
- `KEYCLOAK_ID`, `KEYCLOAK_SECRET`, `KEYCLOAK_ISSUER`

### 3. Start PostgreSQL

Ensure you point `DATABASE_URL` to a reachable PostgreSQL instance. You can use Docker to spin one up quickly.

Example `.env.local` snippet:
```env
DATABASE_URL=postgresql://lorawan:lorawan@postgres:5432/lorawan
```

### 4. Run the Dev Server

start running a Postgres Instance e.g.:
```bash
docker compose up -d postgres
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. 
On startup, pending database migrations in `src/server/migrations/` will be applied automatically.

## Docker Compose (Published Image)

If you want to run the app from the published container image (instead of building locally), use a dedicated compose file like this:

```yaml
services:
    postgres:
        image: postgres:16-alpine
        container_name: lorawan-postgres
        restart: unless-stopped
        environment:
            POSTGRES_DB: lorawan
            POSTGRES_USER: lorawan
            POSTGRES_PASSWORD: lorawan
        ports:
            - "5432:5432"
        volumes:
            - postgres_data:/var/lib/postgresql/data
        healthcheck:
            test: ["CMD-SHELL", "pg_isready -U lorawan -d lorawan"]
            interval: 10s
            timeout: 5s
            retries: 5
            start_period: 10s

    lorawan-dashboard:
        image: ghcr.io/joshua154/lorawan-website:latest
        build:
            context: .
            dockerfile: Dockerfile
            args:
                NEXT_PUBLIC_BASE_PATH: ${NEXT_PUBLIC_BASE_PATH}
        container_name: lorawan-dashboard
        restart: unless-stopped
        pull_policy: always
        depends_on:
            postgres:
                condition: service_healthy
        ports:
            - "3000:3000"
        env_file:
            - .env.local

volumes:
    postgres_data:
```

Save it as `docker-compose.published.yml`, then run:

```bash
cp example.env.local .env.local
printf "NEXT_PUBLIC_BASE_PATH=/lora-scanner\n" > .env
docker compose -f docker-compose.published.yml pull
docker compose -f docker-compose.published.yml up -d
```

For immutable deploys, you can replace `:latest` with a specific commit image tag (the workflow also publishes SHA tags).

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Secret used by NextAuth |
| `KEYCLOAK_ID` | Keycloak only | Keycloak client ID |
| `KEYCLOAK_SECRET` | Keycloak only | Keycloak client secret |
| `KEYCLOAK_ISSUER` | Keycloak only | Keycloak realm issuer URL |
| `KEYCLOAK_ADMIN_ROLE` | Optional | Keycloak role name required to grant admin rights (defaults to `lorawan-admin`) |
| `LORAWAN_ADMIN_USERNAME` | No | Initial admin username when no admin exists |
| `LORAWAN_ADMIN_PASSWORD` | No | Initial admin password when no admin exists |
| `APP_URL` | Recommended | Trusted origin for origin validation |
| `NEXTAUTH_URL` | Recommended | Canonical public origin used by NextAuth/Auth.js (without `/api/auth` path) |
| `AUTH_TRUST_HOST` | Recommended (reverse proxy) | Trust forwarded host/proto headers |
| `NEXT_PUBLIC_APP_URL` | Optional | Fallback trusted origin if `APP_URL` is missing |
| `NEXT_PUBLIC_BASE_PATH` | Optional | Base path for the application (e.g. `/lorawan`) if hosted under a sub-path |
| `LORAWAN_LOG_URL` | No | Remote log file URL (legacy/fallback ingestion) |
| `MQTT_BROKER` | No | ChirpStack MQTT broker hostname |
| `MQTT_PORT` | No | ChirpStack MQTT broker port (default: `8883`) |
| `MQTT_USERNAME` | No | ChirpStack MQTT username |
| `MQTT_PASSWORD` | No | ChirpStack MQTT password |
| `MQTT_TOPIC` | No | ChirpStack MQTT topic (default: `application/+/device/+/event/up`) |
| `TTN_MQTT_BROKER` | No | TTN MQTT broker hostname (e.g. `eu1.cloud.thethings.network`) |
| `TTN_MQTT_PORT` | No | TTN MQTT broker port (default: `8883`) |
| `TTN_MQTT_USERNAME` | No | TTN MQTT username (`{application-id}@ttn`) |
| `TTN_MQTT_PASSWORD` | No | TTN MQTT password (API key from TTN Console) |
| `TTN_MQTT_TOPIC` | No | TTN MQTT topic (e.g. `v3/{application-id}@ttn/devices/+/up`) |
| `RELEASE_TIMESTAMP` | No | Build/release timestamp metadata |

### Runtime Configuration Overrides (Admin UI)

Admins can now edit runtime configuration values in **Admin → Configuration** (`/admin/configurations`).

- Values are persisted in PostgreSQL (`app_config` table).
- Saved values override matching environment variables inside the running Node.js process.
- Empty values in the form remove the database override and fall back to the original environment value.
- Some settings are marked as restart-required in the UI (for example auth provider/bootstrap settings) because they are read during service initialization.

### Base Path Configuration

If you need to host the application under a sub-path instead of the domain root (e.g., `https://example.com/lorawan`), you can use the `NEXT_PUBLIC_BASE_PATH` environment variable.

1. Set `NEXT_PUBLIC_BASE_PATH=/lorawan` in your `.env.local` (runtime) and in `.env` (build-time variable for Docker Compose substitution).
2. The Next.js application will prefix all internal routes (both frontend and API) with this path.
3. Keep in mind that when running behind a reverse proxy (like Nginx or Traefik), you'll need to route requests starting with this base path to the Next.js container without stripping the `/lorawan` prefix.

For Docker image builds, pass the value as a build arg so Next.js can read it during `npm run build`:

```bash
docker build --build-arg NEXT_PUBLIC_BASE_PATH=/lorawan -t your-image:tag .
```

### MQTT Data Ingestion

The dashboard supports two independent MQTT connections for receiving LoRaWAN pings in real-time. Both are optional and can run simultaneously.

#### ChirpStack MQTT

Set the `MQTT_BROKER`, `MQTT_USERNAME`, and `MQTT_PASSWORD` variables to connect to a ChirpStack MQTT broker. Pings received this way are stored with `network: "chirpstack"`.

```env
MQTT_BROKER=your-chirpstack-host.example.com
MQTT_PORT=8883
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
MQTT_TOPIC=application/your-app-id/#
```

#### TTN (The Things Network) MQTT

To receive pings from TTN v3, configure the `TTN_MQTT_*` variables. Pings are stored with `network: "ttn"`.

1. In the [TTN Console](https://console.cloud.thethings.network), go to your Application > **API Keys** and create a key with "Read application traffic" permission.
2. Add the following to `.env.local`:

```env
TTN_MQTT_BROKER=eu1.cloud.thethings.network
TTN_MQTT_PORT=8883
TTN_MQTT_USERNAME={application-id}@ttn
TTN_MQTT_PASSWORD=NNSXS.your-api-key
TTN_MQTT_TOPIC=v3/{application-id}@ttn/devices/+/up
```

Replace `{application-id}` with your actual TTN application ID and use `eu1` (or `us1`, `au1`, etc.) matching your TTN cluster.

#### Network Distinction

Each MQTT connection automatically tags pings with the correct network (`"ttn"` or `"chirpstack"`). No payload formatter changes are needed on the device side. The dashboard UI allows filtering by network.

## Keycloak Configuration

This app uses NextAuth with the Keycloak provider from `src/server/next-auth.ts`.

### 1. Create realm and client

In Keycloak Admin Console:

1. Create or choose a realm.
2. Create a client (OIDC).
3. Set `Client ID` to match `KEYCLOAK_ID`.
4. Set `Client authentication` to enabled (confidential client) so a client secret is issued.

### 2. Configure redirect URLs

Use your app base URL from `APP_URL`/`NEXTAUTH_URL`.

- Development redirect URI: `http://localhost:3000/api/auth/callback/keycloak`
- Production redirect URI: `https://your-domain/api/auth/callback/keycloak`

If you deploy under a base path (for example `/lora-scanner`), include it in the callback path:

- `https://your-domain/lora-scanner/api/auth/callback/keycloak`

Recommended Keycloak client values:

- Valid redirect URIs:
    - `http://localhost:3000/api/auth/callback/keycloak`
    - `https://your-domain/api/auth/callback/keycloak`
    - `https://your-domain/lora-scanner/api/auth/callback/keycloak`
- Web origins:
    - `http://localhost:3000`
    - `https://your-domain`

### 3. Set env variables

Populate these in `.env.local`:

```env
KEYCLOAK_ID=your-client-id
KEYCLOAK_SECRET=your-client-secret
KEYCLOAK_ISSUER=https://keycloak.example.com/realms/your-realm
NEXTAUTH_URL=https://your-domain
APP_URL=https://your-domain
NEXT_PUBLIC_BASE_PATH=/lora-scanner
AUTH_SECRET=replace-with-strong-random-secret
```

With this setup, the app computes the OAuth redirect proxy URL as:

`APP_URL + NEXT_PUBLIC_BASE_PATH + /api/auth`

Example:

`https://your-domain/lora-scanner/api/auth`

Issuer format must be the realm issuer URL (not just the Keycloak root).
e.g.: 
```
https://localhost:8080/realms/master
```

### 4. Verify login flow

1. Start the app using `npm run dev`.
2. Open the login page.
3. Click "Sign in with Keycloak".
4. After successful authentication, you will be redirected to the dashboard (`/`).

### 5. Role Syncing (Admin Access)

To grant a Keycloak user admin privileges in the dashboard, you need to assign them the specific admin role. By default, this role is `lorawan-admin`, but you can customize it by setting the `KEYCLOAK_ADMIN_ROLE` environment variable.

1. In the Keycloak Admin Console, navigate to your Realm -> **Clients**.
2. Select your client (the one matching `KEYCLOAK_ID`).
3. Go to the **Roles** tab and click **Create Role**.
4. Name the role exactly `lorawan-admin` (or match your `KEYCLOAK_ADMIN_ROLE` setting) and save.
5. Go to **Users**, select the user you want to make an admin, and navigate to the **Role mapping** tab.
6. Click **Assign role**, filter by clients, and assign the `lorawan-admin` role (or your custom role) to the user.
7. *Note*: Ensure your client scopes are configured to map client roles into the user profile/token so the application can read them during login.

## Authentication Modes

### Local auth

- Endpoint: `/api/auth/login`
- Creates a server-managed session cookie
- Best for internal users managed from the admin panel

### Keycloak auth

- Configured in `src/server/next-auth.ts`
- Callback URL pattern: `<NEXTAUTH_URL>/api/auth/callback/keycloak`
- Can coexist with local auth users

## Default Admin Bootstrap

If no admin user exists, one local admin account is seeded on first startup.

Defaults (from `example.env.local`):

- Username: `admin`
- Password: `admin1234`

Override before first run in `.env.local`.

## Database

- Migrations: `src/server/migrations/`
- Applied automatically during server startup

Schema diagram:

### Layout
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

## API Overview

- `src/app/api/auth/*`: Local login/logout and NextAuth handler
- `src/app/api/pings/*`: Ping retrieval, summaries, manual imports, update triggers
- `src/app/api/users/*`: Admin user management

## Security Notes

- Mutating API routes validate request origin (`APP_URL` or fallback host headers)
- JSON endpoints enforce `application/json`
- Passwords are hashed with `bcryptjs`
- Non-admin users only receive pings for boards they are assigned to

## Localization

- English: `src/i18n/locales/en.json`
- German: `src/i18n/locales/de.json`

## License

Copyright (c) 2026. All Rights Reserved.

This application is proprietary and confidential. No part of this software, including source code, documentation, or associated files, may be reproduced, distributed, or transmitted in any form or by any means, without the prior written permission of the owner.