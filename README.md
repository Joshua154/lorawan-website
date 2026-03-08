## LoRaWAN dashboard

This project is a Next.js LoRaWAN GPS dashboard with:

- login/logout with database-backed sessions
- admin accounts that can see all boards and create users
- regular users that only see the boards assigned to them
- the existing live ping map, filtering, and board import tools

## Getting started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first start, the app creates `data/lorawan-auth.db` automatically and seeds a default admin account:

- username: `admin`
- password: `admin1234`

You can override that bootstrap account with environment variables before the first run:

```bash
export LORAWAN_ADMIN_USERNAME="your-admin-name"
export LORAWAN_ADMIN_PASSWORD="your-secure-password"
```

## Permissions

- `admin`: can view all boards, trigger dataset refreshes, import board dumps, and create new users
- `user`: can log in and only see the boards assigned to that account

## Data storage

- auth data and sessions: `data/lorawan-auth.db`
- LoRaWAN ping dataset: `data/pings.geojson`

## Verification

Run the main checks with:

```bash
npm run lint
npm run build
```

## Notes

- The first admin account is only auto-created when the database has no admin users yet.
- Admin-created user passwords are hashed with `bcryptjs`.
- Regular users only receive filtered data from the `/api/pings` endpoints.
