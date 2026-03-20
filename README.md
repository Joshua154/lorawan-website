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
- [Environment Variables](#environment-variables)
- [Keycloak Configuration](#keycloak-configuration)
- [License](#License)

## Features

- **Interactive Maps:** Displays LoRaWAN pings on a map (markers, heatmap, hexagons) using Leaflet.
- **Role-Based Access Control:** Supports dynamic roles (`admin`, `user`, `guest`).
- **Flexible Authentication:** Offers local username/password login and optional Keycloak (OIDC) sign-in.
- **Data Ingestion:** Ingests data from remote log polling and optional ChirpStack MQTT uplinks.
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

## Environment Variables

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
| `NEXTAUTH_URL` | Recommended | Canonical public URL used by NextAuth/Auth.js |
| `AUTH_TRUST_HOST` | Recommended (reverse proxy) | Trust forwarded host/proto headers |
| `NEXT_PUBLIC_APP_URL` | Optional | Fallback trusted origin if `APP_URL` is missing |
| `LORAWAN_LOG_URL` | No | Overrides default remote log source |
| `MQTT_BROKER` | No | ChirpStack MQTT broker hostname |
| `MQTT_PORT` | No | MQTT broker port |
| `MQTT_USERNAME` | No | MQTT username |
| `MQTT_PASSWORD` | No | MQTT password |
| `MQTT_TOPIC` | No | MQTT topic (default: `application/+/device/+/event/up`) |
| `RELEASE_TIMESTAMP` | No | Build/release timestamp metadata |

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

Recommended Keycloak client values:

- Valid redirect URIs:
    - `http://localhost:3000/api/auth/callback/keycloak`
    - `https://your-domain/api/auth/callback/keycloak`
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
AUTH_SECRET=replace-with-strong-random-secret
```

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