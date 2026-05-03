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

**Guest browsing.** The app opens directly on the resort list — **no login is
required to browse resorts, instructor lists, or instructor profiles**. Auth is
prompted only when the visitor takes a member-only action (booking, payment,
chat, the Rezervasyonlar/Mesajlar/Profil tabs). The auth screens accept a
`?next=<path>` query param so the user returns to where they came from after
signing in. See `components/ui/SignInGate.tsx` for the in-place tab CTA.

The home tab (`(tabs)/index.tsx`) is role-aware once a user is signed in:

- **Customer / guest**: resort grid → instructor list → instructor detail →
  booking wizard (date → slots → students → summary) → payment → bookings
  tab + chat with instructor. The booking screen is the first auth-gated step.
- **Instructor**: today's overview, calendar (block/unblock 8 daily 50-min slots),
  upcoming bookings, payouts list, profile setup. After registering as
  "Eğitmen" the user is routed straight to `instructor-panel/setup`.
- **Admin**: stats tiles, instructor management (block/unblock, reset strikes),
  flagged messages list, all bookings overview.

**Role on signup.** The `Hesap türü` choice (Öğrenci / Eğitmen) on the register
screen is sent through `supabase.auth.signUp` as `options.data.role`. The
`handle_new_user()` trigger reads it from `raw_user_meta_data` and writes it
onto `public.users.role` at row creation time, so the role is correct
regardless of session/email-confirmation timing. A belt-and-suspenders client
update via the `users_self_update` RLS policy keeps things consistent if an
older trigger version is still installed.

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

### Admin panel (`app/(admin)/`)

Dedicated route group for `role='admin'` users, parallel to `(app)` and
`(auth)`. Distinct dark theme via `lib/adminTheme.ts` and admin-only
primitives in `components/admin/AdminUI.tsx` (admin screens never use the
warm customer Card/Pill/Header components — except the verification detail
screen, which still uses the customer chrome and is a known visual
inconsistency).

Five bottom tabs grouping the nine sections:

| Tab | File | Sections |
|---|---|---|
| Pano | `(tabs)/index.tsx` | Stats dashboard (revenue, payouts, queue, bayraklar, users, resorts) |
| Onaylar | `(tabs)/approvals.tsx` | Eğitmen onay kuyruğu (pending/approved/rejected sub-tabs) |
| Kullanıcılar | `(tabs)/users.tsx` | Eğitmenler / Müşteriler (sub-tabs, search, block/unblock) |
| Operasyon | `(tabs)/operations.tsx` | Rezervasyonlar / Ödemeler (release) / Şikayetler (resolve) |
| Sistem | `(tabs)/system.tsx` | Pistler (CRUD) / Ayarlar (KDV, komisyon, sezon) |

Verification detail lives at `(admin)/verification/[id].tsx` (moved from the
old `(app)/admin/` location).

Routing rules:

- `(admin)/_layout.tsx` redirects non-admins out (`/(app)/(tabs)`) and
  unauthenticated visitors to login with `?next=/(admin)`.
- `(app)/_layout.tsx` redirects admins into `/(admin)/(tabs)` so they
  cannot land on customer/instructor surfaces.
- `(auth)/login.tsx` `resolveTarget` returns `/(admin)/(tabs)` for admins,
  ignoring any `next` param.

Backend (see `supabase/migrations/2026_05_admin_panel.sql`):

- Admin-additive RLS policies on `users`, `bookings`, `payouts`, `messages`,
  `students` (read), plus admin write on `resorts` and `app_config`.
- RPCs: `admin_stats`, `admin_set_user_status`, `admin_release_payout`,
  `admin_resolve_flag`, `admin_upsert_resort`, `admin_delete_resort`,
  `admin_update_config`. All check `role='admin'` from `public.users`.
- `app_config` extended with `season_start_month/day` and
  `season_end_month/day` columns.
- `create_booking` was updated to read the season window from `app_config`
  (admin Settings now actually controls booking eligibility). Same signature
  preserved so it replaces the original function in-place.

Test admin (seeded via `auth.admin.createUser` using `SUPABASE_SECRET_KEY`):

- email: `admin@snowconnects.com`
- password: `admin123`
- role: `admin` (id `793cbd02-08f3-43bf-8316-a3596c853b1a`)

## Workspace conventions

- Node 24, TypeScript 5.9, pnpm.
- Each package owns its dependencies; shared runtimes go in `pnpm-workspace.yaml` catalog.
- Static/client-only artifacts put runtime libs in `devDependencies`.
- Server artifacts put runtime libs in `dependencies`.

## Key commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

See the `pnpm-workspace` skill for monorepo details.
