# LoRaWAN Dashboard API

This document explains how to create authenticated sessions and call the LoRaWAN Dashboard HTTP API.

All paths below are relative to the application origin. If `NEXT_PUBLIC_BASE_PATH` is configured, prefix every path with that value.

Example:

```text
http://localhost:3000/api/pings
https://example.com/lora-scanner/api/pings
```

## Request Basics

Use these variables in the examples:

```bash
BASE_URL=http://localhost:3000
ORIGIN=http://localhost:3000
COOKIE_JAR=./cookies.txt
```

Authenticated local API calls use the `lorawan_session` HTTP-only cookie returned by `POST /api/auth/login`. Browser clients send this cookie automatically. Command-line clients should store and replay it with a cookie jar.

Mutating endpoints validate the request origin. Include an `Origin` header matching the deployed app origin. Endpoints that accept JSON also require `Content-Type: application/json`.

Common error responses:

```json
{ "message": "Unauthorized." }
```

```json
{ "message": "Forbidden." }
```

```json
{ "message": "Expected application/json request body." }
```

```json
{ "message": "Missing Origin header." }
```

## Create A Session

### Local Username And Password Login

Create a local session with `POST /api/auth/login`:

```bash
curl -i \
  -c "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/auth/login" \
  -d '{
    "username": "admin",
    "password": "change-me"
  }'
```

Successful response:

```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "assignedBoardIds": []
  }
}
```

The response also sets a `lorawan_session` cookie. Use it in later requests:

```bash
curl -b "$COOKIE_JAR" "$BASE_URL/api/pings/summary"
```

Sessions last 14 days unless deleted, expired, or invalidated server-side.

### Keycloak / NextAuth Login

Keycloak authentication is handled by NextAuth under `/api/auth`. In normal use, redirect the user through the browser:

```text
GET /api/auth/signin/keycloak
```

NextAuth redirects to Keycloak, receives the callback at:

```text
GET /api/auth/callback/keycloak
```

After login, API authorization uses the NextAuth session. Keycloak users are upserted into the local database as OAuth users. A Keycloak role matching `KEYCLOAK_ADMIN_ROLE` grants `admin`; otherwise the user is created as `user`.

Useful NextAuth endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/signin` | Show NextAuth sign-in options. |
| `GET` | `/api/auth/signin/keycloak` | Start Keycloak sign-in. |
| `GET` | `/api/auth/callback/keycloak` | Keycloak redirect callback. |
| `GET` | `/api/auth/session` | Return the current NextAuth session. |
| `GET` | `/api/auth/csrf` | Return a CSRF token for NextAuth form posts. |
| `GET` | `/api/auth/providers` | Return configured auth providers. |
| `POST` | `/api/auth/signout` | Sign out of the NextAuth session. |

For local sessions, prefer `POST /api/auth/logout`, which also clears `lorawan_session`.

## Endpoint Summary

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | Create a local cookie session. |
| `POST` | `/api/auth/logout` | Public | Destroy the local session cookie and attempt NextAuth sign-out. |
| `PATCH` | `/api/auth/password` | Any authenticated local user | Change the current user's local password. |
| `GET` | `/api/pings` | Public or authenticated | Return guest map data or authenticated ping data. |
| `GET` | `/api/pings/summary` | Any authenticated user | Return a summary for visible pings. |
| `POST` | `/api/pings/manual` | Any authenticated user | Import manual ping features. |
| `POST` | `/api/pings/update` | Any authenticated user | Fetch and import the configured remote log. |
| `GET` | `/api/users` | Admin | List managed users. |
| `POST` | `/api/users` | Admin | Create a local user. |
| `PATCH` | `/api/users/:id` | Admin | Update a user's username, role, or assigned boards. |
| `DELETE` | `/api/users/:id` | Admin | Delete a user. |
| `PATCH` | `/api/users/:id/password` | Admin | Set a local user's password. |
| `GET/POST` | `/api/auth/*` | Public or NextAuth session | NextAuth-managed Keycloak/session routes. |

## Authentication Endpoints

### `POST /api/auth/login`

Creates a local username/password session.

Headers:

```http
Origin: http://localhost:3000
Content-Type: application/json
```

Request body:

```json
{
  "username": "admin",
  "password": "change-me"
}
```

Responses:

- `200 OK` with `{ "user": SessionUser }` and a `Set-Cookie: lorawan_session=...` header.
- `400 Bad Request` when `username` or `password` is missing.
- `401 Unauthorized` when credentials are invalid.
- `403 Forbidden` when the `Origin` header is missing or untrusted.
- `415 Unsupported Media Type` when the request is not JSON.

### `POST /api/auth/logout`

Destroys the current local session, clears the `lorawan_session` cookie, and attempts NextAuth sign-out.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -X POST "$BASE_URL/api/auth/logout"
```

Successful local response:

```json
{ "status": "ok" }
```

### `PATCH /api/auth/password`

Changes the password for the current local user. OAuth users do not have local passwords and receive an error.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -X PATCH "$BASE_URL/api/auth/password" \
  -d '{
    "currentPassword": "change-me",
    "newPassword": "new-secret-password"
  }'
```

Successful response:

```json
{ "success": true }
```

## Ping Endpoints

### `GET /api/pings`

Returns map data. This endpoint can be called without a session, but guest responses are restricted.

Query parameters:

| Name | Values | Description |
| --- | --- | --- |
| `network` | `chirpstack`, `ttn` | Guest-only filter for restricted hexagons. Defaults to `chirpstack`. |
| `hexSize` | `0.0015` | Guest-only hexagon size. Other values fall back to the default. |
| `minHexPoints` | `1` | Guest-only minimum points per hexagon. Other values fall back to the default. |

Guest request:

```bash
curl "$BASE_URL/api/pings?network=ttn"
```

Guest response:

```json
{
  "accessMode": "guest",
  "restrictedHexagons": [
    {
      "corners": [
        [52.4012, 13.0541],
        [52.4020, 13.0548]
      ],
      "avg": -91,
      "fillColor": "rgb(46, 125, 50)"
    }
  ],
  "summary": {
    "totalFeatures": 0,
    "validFeatures": 0,
    "boardCounts": {},
    "gatewayCounts": {},
    "latestTimestamp": null,
    "earliestTimestamp": null
  },
  "nextUpdateInSeconds": 12
}
```

Authenticated request:

```bash
curl -b "$COOKIE_JAR" "$BASE_URL/api/pings"
```

Authenticated response:

```json
{
  "accessMode": "authenticated",
  "collection": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [13.054321, 52.401234]
        },
        "properties": {
          "boardID": 3,
          "counter": 42,
          "gateway": "gw-berlin-01",
          "rssi": -87,
          "snr": 7.5,
          "time": "2026-05-26T10:15:00.000Z",
          "rssi_stabilized": -82,
          "rssi_bonus": 5,
          "network": "ttn"
        }
      }
    ]
  },
  "summary": {
    "totalFeatures": 1,
    "validFeatures": 1,
    "boardCounts": { "3": 1 },
    "gatewayCounts": { "gw-berlin-01": 1 },
    "earliestTimestamp": "2026-05-26T10:15:00.000Z",
    "latestTimestamp": "2026-05-26T10:15:00.000Z"
  },
  "nextUpdateInSeconds": 12
}
```

Admin users see all pings. Regular users only see pings whose `boardID` is in their `assignedBoardIds` list.

### `GET /api/pings/summary`

Returns only the summary for pings visible to the authenticated user.

```bash
curl -b "$COOKIE_JAR" "$BASE_URL/api/pings/summary"
```

Successful response:

```json
{
  "totalFeatures": 2,
  "validFeatures": 2,
  "boardCounts": {
    "3": 1,
    "7": 1
  },
  "gatewayCounts": {
    "gw-berlin-01": 2
  },
  "earliestTimestamp": "2026-05-26T10:15:00.000Z",
  "latestTimestamp": "2026-05-26T10:16:00.000Z"
}
```

### `POST /api/pings/manual`

Imports an array of GeoJSON point features. Requires any authenticated user.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/pings/manual" \
  -d '[
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [13.054321, 52.401234]
      },
      "properties": {
        "boardID": 3,
        "counter": 42,
        "gateway": "manual-import",
        "rssi": -87,
        "snr": 7.5,
        "time": "2026-05-26T10:15:00.000Z",
        "network": "ttn"
      }
    }
  ]'
```

Successful response:

```json
{
  "status": "ok",
  "added": 1,
  "updated": 0
}
```

### `POST /api/pings/update`

Runs the remote log import using `LORAWAN_LOG_URL`. Requires any authenticated user.

This endpoint does not require a JSON body, but it does require a trusted `Origin` header.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -X POST "$BASE_URL/api/pings/update"
```

Successful response:

```json
{
  "status": "ok",
  "added": 3,
  "updated": 1,
  "total": 128
}
```

Cached response when another update ran recently:

```json
{
  "status": "cached",
  "added": 3,
  "updated": 1,
  "total": 128,
  "features": []
}
```

Error response when the remote log is unavailable or not configured:

```json
{
  "status": "error",
  "added": 0,
  "updated": 0,
  "total": 128,
  "message": "Remote log URL is not configured"
}
```

## User Management Endpoints

All user management endpoints require an authenticated admin user.

User roles:

- `admin`: Can manage users and see all boards. `assignedBoardIds` is always empty.
- `user`: Can see only boards listed in `assignedBoardIds`. Must have at least one assigned board.

### `GET /api/users`

Lists all managed local and OAuth users.

```bash
curl -b "$COOKIE_JAR" "$BASE_URL/api/users"
```

Successful response:

```json
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "assignedBoardIds": [],
      "createdAt": "2026-05-26T09:00:00.000Z",
      "auth_type": "local",
      "oauth_provider": null,
      "oauth_subject": null
    },
    {
      "id": 2,
      "username": "field-user",
      "role": "user",
      "assignedBoardIds": ["3", "7"],
      "createdAt": "2026-05-26T09:10:00.000Z",
      "auth_type": "oauth",
      "oauth_provider": "keycloak",
      "oauth_subject": "6d7d5c1a-1234-4567-8901-abcdefabcdef"
    }
  ]
}
```

### `POST /api/users`

Creates a local user.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/users" \
  -d '{
    "username": "field-user",
    "password": "secret-password",
    "role": "user",
    "assignedBoardIds": ["3", "7"]
  }'
```

Successful response:

```json
{
  "user": {
    "id": 2,
    "username": "field-user",
    "role": "user",
    "assignedBoardIds": ["3", "7"],
    "createdAt": "2026-05-26T09:10:00.000Z",
    "auth_type": "local",
    "oauth_provider": null,
    "oauth_subject": null
  }
}
```

Validation rules:

- `username` must contain at least 3 characters.
- `password` must contain at least 6 characters.
- `role` must be `admin` or `user`.
- `user` accounts need at least one assigned board.
- `admin` accounts ignore assigned boards and receive `assignedBoardIds: []`.

### `PATCH /api/users/:id`

Updates an existing user's username, role, and assigned boards.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -X PATCH "$BASE_URL/api/users/2" \
  -d '{
    "username": "field-user-renamed",
    "role": "user",
    "assignedBoardIds": ["3", "8"]
  }'
```

Successful response:

```json
{
  "user": {
    "id": 2,
    "username": "field-user-renamed",
    "role": "user",
    "assignedBoardIds": ["3", "8"],
    "createdAt": "2026-05-26T09:10:00.000Z",
    "auth_type": "local",
    "oauth_provider": null,
    "oauth_subject": null
  }
}
```

An admin cannot remove their own admin access.

### `DELETE /api/users/:id`

Deletes a user.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -X DELETE "$BASE_URL/api/users/2"
```

Successful response:

```json
{ "success": true }
```

An admin cannot delete their own account.

### `PATCH /api/users/:id/password`

Sets a local user's password. OAuth users do not have local passwords and receive an error.

```bash
curl -i \
  -b "$COOKIE_JAR" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -X PATCH "$BASE_URL/api/users/2/password" \
  -d '{
    "password": "new-secret-password"
  }'
```

Successful response:

```json
{ "success": true }
```

## Data Shapes

### `SessionUser`

```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "assignedBoardIds": []
}
```

### `ManagedUser`

```json
{
  "id": 2,
  "username": "field-user",
  "role": "user",
  "assignedBoardIds": ["3", "7"],
  "createdAt": "2026-05-26T09:10:00.000Z",
  "auth_type": "local",
  "oauth_provider": null,
  "oauth_subject": null
}
```

### `PingFeature`

Ping features are GeoJSON point features. Coordinates are ordered as `[longitude, latitude]`.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [13.054321, 52.401234]
  },
  "properties": {
    "boardID": 3,
    "counter": 42,
    "gateway": "gw-berlin-01",
    "rssi": -87,
    "snr": 7.5,
    "time": "2026-05-26T10:15:00.000Z",
    "rssi_stabilized": -82,
    "rssi_bonus": 5,
    "network": "ttn"
  }
}
```

Required ping fields:

- `type`: `Feature`
- `geometry.type`: `Point`
- `geometry.coordinates`: `[longitude, latitude]`
- `properties.boardID`: board identifier
- `properties.counter`: ping counter
- `properties.rssi`: RSSI value; `-1` means a dead-zone or historical offline ping
- `properties.time`: ISO timestamp

Optional ping fields:

- `properties.gateway`: gateway name
- `properties.snr`: signal-to-noise ratio
- `properties.rssi_stabilized`: RSSI after stability bonus
- `properties.rssi_bonus`: stability bonus value
- `properties.network`: `ttn` or `chirpstack`

### `PingSummary`

```json
{
  "totalFeatures": 2,
  "validFeatures": 2,
  "boardCounts": {
    "3": 1,
    "7": 1
  },
  "gatewayCounts": {
    "gw-berlin-01": 2
  },
  "earliestTimestamp": "2026-05-26T10:15:00.000Z",
  "latestTimestamp": "2026-05-26T10:16:00.000Z"
}
```

### `UpdateResult`

```json
{
  "status": "ok",
  "added": 3,
  "updated": 1,
  "total": 128,
  "message": "Optional error details"
}
```

`status` can be `ok`, `cached`, or `error`.

## Status Codes

| Status | Meaning |
| --- | --- |
| `200 OK` | Request succeeded. |
| `201 Created` | User was created. |
| `400 Bad Request` | Invalid ID, missing fields, or validation failure. |
| `401 Unauthorized` | No valid local or NextAuth session. |
| `403 Forbidden` | Not enough permission, missing origin, or untrusted origin. |
| `404 Not Found` | Requested user does not exist. |
| `415 Unsupported Media Type` | JSON endpoint was called without `Content-Type: application/json`. |
| `500 Internal Server Error` | Remote ping update failed. |