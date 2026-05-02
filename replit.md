# Workspace

## Overview

pnpm workspace monorepo. Active product is **Snow Connects** — a Turkish, mobile-first
ski-lesson booking app (Expo + React Native) backed by Supabase.

## Artifacts

| Slug | Path | Kind | Purpose |
|------|------|------|---------|
| `snow-connects` | `/` | Expo (mobile + web) | The main product |
| `api-server` | `/api` | Express (Node) | Scaffold from template; not currently used by Snow Connects (Supabase is used directly) |
| `mockup-sandbox` | `/__mockup` | Vite | Internal canvas mockup tooling |

## Snow Connects

### Stack

- **App**: Expo Router 6 + React Native (web build for Replit preview)
- **Backend**: Supabase (Auth + Postgres + Realtime + RLS)
- **Data layer**: `@supabase/supabase-js` directly from the app via `lib/supabase.ts`
- **State**: TanStack Query
- **Fonts**: Inter via `@expo-google-fonts/inter`
- **Language**: Turkish (Türkçe) primary
- **Theme**: Light only — winter palette (white / deep navy `#0e2a47` / ice blue `#7fb3d5`)

### Roles & flows

Three roles: `customer`, `instructor`, `admin`. Role is stored on `public.users.role`.
The home tab (`(tabs)/index.tsx`) is role-aware:

- **Customer**: resort grid → instructor list → instructor detail → booking wizard
  (date → slots → students → summary) → payment → bookings tab + chat with instructor.
- **Instructor**: today's overview, calendar (block/unblock 8 daily 50-min slots),
  upcoming bookings, payouts list, profile setup.
- **Admin**: stats tiles, instructor management (block/unblock, reset strikes),
  flagged messages list, all bookings overview.

### Domain rules

- **Season**: 15 December → 15 April (booking calendar gates by season).
- **Slots**: 8 per day, 50-minute lessons starting on the hour `09:00 … 16:00`
  (last lesson `16:00–16:50`). See `lib/timeSlots.ts`.
- **Pricing** (computed server-side in the `create_booking` RPC):
  `base = instructor.base_price (kuruş) × slot_count × student_count`,
  `vat = 20%`, `total = base + vat`, `commission = 3% × total`.
- **Payouts**: created on `confirm_payment`. Release date = lesson date + 21 business days.
- **Contact-info filter**: `detect_contact_info()` server function blocks emails, URLs,
  Turkish phone numbers, and 10+ digit runs in messages. `send_message` RPC enforces strikes:
  - Instructor: 3 strikes → status auto-set to `blocked`.
  - Customer: every violation flags the message; admin reviews.
- **Money**: stored in **kuruş** (integer). Display via `lib/format.ts:formatTRY`.
- **Payments**: Param.com integration is **stubbed**. The Payment screen calls a
  simulated success then `confirm_payment` RPC. Replace with real provider when ready.

### Supabase setup (one-time, manual)

DDL cannot be applied programmatically with project keys, so the SQL schema must be
pasted into the Supabase SQL editor once:

1. Open the Supabase project dashboard for `SUPABASE_URL`.
2. SQL Editor → New query.
3. Paste the entire contents of `artifacts/snow-connects/supabase/schema.sql`.
4. Run. The script is idempotent and can be re-run safely.

This creates all tables, RLS policies, triggers, RPC functions, the realtime
publication, and seeds 7 Turkish ski resorts (Sarıkamış, Palandöken, Uludağ,
Kartalkaya, Erciyes, Ilgaz, Ergan).

After the schema is applied, register a user from the app. The auth trigger
creates the `public.users` row automatically. To make a user an instructor or
admin, update the `role` column from the SQL editor:

```sql
update public.users set role = 'admin' where email = 'you@example.com';
```

### Environment

The Expo `dev` script in `artifacts/snow-connects/package.json` exposes:

- `EXPO_PUBLIC_SUPABASE_URL` ← `SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ← `SUPABASE_PUBLISHABLE_KEY`

Both come from the workspace secrets.

### Key files

```
artifacts/snow-connects/
├── app/                       # Expo Router screens
│   ├── _layout.tsx            # Providers (Query, Auth, Safe area, Keyboard)
│   ├── index.tsx              # Auth-gate redirect
│   ├── (auth)/{login,register}.tsx
│   └── (app)/
│       ├── _layout.tsx        # Session guard
│       ├── (tabs)/{index,bookings,messages,profile}.tsx
│       ├── resort/[id].tsx
│       ├── instructor/[id].tsx
│       ├── book/[instructorId].tsx
│       ├── payment/[bookingId].tsx
│       ├── messages/[userId].tsx
│       ├── instructor-panel/{calendar,setup}.tsx
│       └── admin/index.tsx
├── components/ui/             # Button, Card, Input, Pill, Screen, MonthCalendar, …
├── contexts/AuthContext.tsx
├── lib/                       # supabase, types, contactFilter, season, timeSlots, format
├── constants/colors.ts        # Winter palette tokens
└── supabase/schema.sql        # One-time DB setup
```

## Workspace conventions

- Node 24, TypeScript 5.9, pnpm.
- Each package owns its dependencies; shared runtimes go in `pnpm-workspace.yaml` catalog.
- Static/client-only artifacts put runtime libs in `devDependencies`.
- Server artifacts put runtime libs in `dependencies`.

## Key commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

See the `pnpm-workspace` skill for monorepo details.
