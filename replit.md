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

### Disputes (refunds workflow)

Customers can file a dispute on a paid booking once the lesson date has
arrived. One dispute per booking. The card with the "Sorun Bildir" CTA and
the status panel both live in `app/(app)/booking-detail/[bookingId].tsx`.

Admins review pending disputes from `(admin)/(tabs)/operations.tsx` →
"İtirazlar" sub-tab (badge counts pending). Approve sets a refund amount
(in TL, capped at booking `total_price`), frees the slots, marks the
booking refunded, and cancels any pending payout. Reject keeps the funds
with the instructor. Both decisions write a customer-facing note.

### Test-mode payouts fix

When `app_config.test_mode = true`, `create_booking()` skips the `/payment`
screen and writes `payment_status = 'paid'` inline. The original version
forgot to also insert a `payouts` row, so instructors saw zero earnings for
auto-paid bookings. `supabase/migrations/2026_05_phase6_payouts_fix.sql`
fixes the function to insert the payout inline (release date = lesson date
+ 21 business days, matching `confirm_payment()`) and backfills payouts for
any already-paid booking that's missing one. `schema.sql` carries the same
fix for fresh installs.

### Ski schools (Phase 8)

Schools own a roster of instructors and receive payouts to a single school
IBAN. New role `school_admin` manages a school's instructors and revenue.

Backend lives in `supabase/migrations/2026_05_phase8_ski_schools.sql`:

- New table `ski_schools` (name, slug, description, iban, iban_holder_name,
  admin_user_id, status).
- `users.role` check expanded with `school_admin`.
- `instructor_profiles.school_id` + `school_approval_status` (`pending`,
  `approved`, `rejected`). Instructors affiliated with a school skip the
  platform-level `instructor_verification` flow; their school admin
  approves them instead. `verification_status` is auto-set in lockstep so
  the existing customer-facing `verification_status='approved'` filter
  keeps working.
- `payouts.recipient_type` (`instructor` | `school`) +
  `payouts.recipient_id`. `create_booking` (test_mode auto-pay path) and
  `confirm_payment` both route the payout to the school when the
  instructor has a `school_id`. RLS on `payouts` allows the school admin
  to read their own school's payouts.
- `handle_new_user()` trigger reads optional `school_id` from
  `auth.users.raw_user_meta_data` so an instructor can affiliate at
  signup time.
- RPCs: `school_list_instructors`, `school_set_instructor_status`,
  `school_payouts_summary`, `school_update_profile`, `admin_upsert_school`,
  `admin_delete_school`, `admin_set_school_status`, `admin_search_users`.
  All school RPCs check `is_school_admin()`; admin RPCs check
  `is_admin()`.

Frontend:

- `(school)/(tabs)` route group (gated to `school_admin`) with four tabs:
  Eğitmenler (approve/reject), Rezervasyonlar, Gelirler (with pending /
  released summary tiles), Profil (edit name/desc/IBAN).
- `(auth)/login.tsx` and `(app)/_layout.tsx` redirect `school_admin`
  users to `/(school)/(tabs)`.
- `(auth)/register.tsx`: when `Hesap türü = Eğitmen`, an optional
  "Kayak okulu" dropdown lists active schools. School-affiliated
  instructors skip the platform verification screen and land in the
  instructor panel right away.
- Customer-facing instructor cards (`resort/[id].tsx` and
  `instructor/[id].tsx`) show a small school badge under the name when
  the instructor is affiliated.
- Admin → Sistem → "Okullar" sub-tab provides full CRUD: create / edit /
  delete schools, search any user by email to assign as the school
  admin (`admin_search_users`).

Test data (`seed-schools.mjs`, run with `SUPABASE_SECRET_KEY` env):

- `s@snow.com` / `123456` — school_admin of "Snow Academy"
- `i2@snow.com`, `i3@snow.com`, `i4@snow.com` are attached to Snow
  Academy with `school_approval_status='approved'`. `i@snow.com` and
  `i1@snow.com` stay independent (platform-verified) for comparison.

The seed script must be run *after* the phase8 migration is applied in
the Supabase SQL editor — otherwise it fails with "Could not find the
table 'public.ski_schools'".

### Manual bookings + unified school calendar (Phase 9)

School admins can enter walk-in / phone reservations directly. Online and
manual bookings live in the same `bookings` table and share the same slot
locking, so a single calendar shows both.

Backend (`supabase/migrations/2026_05_phase9_manual_bookings.sql`):

- `bookings.source text default 'online' check in ('online','manual')`,
  `manual_customer_name`, `manual_customer_phone`, `manual_notes`.
  `customer_id` is now nullable (manual bookings have no app user).
- RPC `school_create_manual_booking(instructor, date, slot_times[],
  students json, customer_name, customer_phone, notes, price_kurus)` —
  validates the instructor belongs to the caller's school, locks slots
  the same way `create_booking` does, inserts a booking with
  `source='manual'`, `payment_status='paid'`, and **no payout row** (the
  school collected the money).
- RPC `school_delete_manual_booking(id)` — only manual bookings of the
  caller's school's instructors. Frees the slots.
- RPC `school_day_calendar(date)` — returns one row per (instructor,
  slot) for the day with merged booking + students info; used by the
  Takvim tab.
- RLS: school admins can read `students` rows of their school's bookings.

Frontend:

- `(school)/(tabs)/bookings.tsx` is now the unified Takvim screen
  (calendar icon, header "Günlük Takvim"). 14-day date strip, then a
  single **"Yeni Rezervasyon"** button that opens the centralized
  manual-booking modal — and **read-only** instructor cards beneath
  showing only that day's actual bookings (and any blocked slots).
  Each booked entry collapses multi-hour lessons into one row
  (`09:00 – 11:50`) with customer + student names + Manuel/Online pill.
  Tap a booked entry → detail modal with delete action for manual ones.
- The new-reservation modal is centralized: pick date → pick slot(s) →
  the eğitmen list is filtered live to those free for every chosen slot
  (`school_day_calendar` is reused for availability) → fill customer +
  students → save. Slots that no instructor is free for are disabled.

The phase9 migration must be pasted into the Supabase SQL editor before
the Takvim tab works.

### Revenue split (Phase 9b)

Each ski school splits revenue between instructor and school. Default is
**35% instructor / 65% school**. The school admin changes the rate from
the Profil tab.

Backend (`supabase/migrations/2026_05_phase9b_instructor_share.sql`):

- `ski_schools.instructor_share_rate numeric default 0.35
  check (>=0 and <=1)`.
- Manual bookings now also create a `payouts` row (status='released',
  release_date=lesson_date, recipient='school'). Without this, manual
  income would be invisible in the Gelirler split. Skipped only when the
  manual booking has no price entered.
- `school_create_manual_booking` and `school_delete_manual_booking`
  updated in-place; signatures unchanged. Delete also removes the
  paired payout row.
- `school_payouts_summary` now returns `instructorShareRate` plus split
  totals (`pendingInstructorKurus`, `pendingSchoolKurus`,
  `releasedInstructorKurus`, `releasedSchoolKurus`).
- New `school_instructor_breakdown()` RPC returns per-instructor totals
  (lesson count, gross, instructor share, school share).
- New `school_update_share_rate(p_rate numeric)` RPC for the Profil tab.

Frontend:

- Gelirler tab: top card shows total revenue with a stacked split bar
  (school vs instructor) + two split tiles. Below that the existing
  Bekleyen / Tahsil edildi tiles, then a per-instructor breakdown card
  (lesson count, total, instructor share), then the per-payout history
  with each row tagged Online / Manuel and an "Eğitmen X TL" pill.
- Profil tab: new "Gelir Paylaşımı" card with a percentage input. Shows
  live preview of the split. Save runs `school_update_profile` and
  `school_update_share_rate` together.

Apply `2026_05_phase9b_instructor_share.sql` in the Supabase SQL editor
before the new Gelirler split / Profil oran alanı work.

### School pricing tiers (Phase 10)

Each ski school sets its own per-student / per-50-min price for groups of
1, 2, 3, and 4+ students from the Profil tab. The manual booking modal
auto-fills `Tutar` based on `pricePerStudent50min × studentCount ×
totalSlotCount`, where `pricePerStudent50min` picks the bracket from the
effective student count (rows with at least a first/last name). The school
admin can still type over the suggestion; a "Sıfırla" link reverts to the
auto value.

Backend (`supabase/migrations/2026_05_phase10_school_pricing.sql`):

- `ski_schools` gains `price_1_kurus`, `price_2_kurus`, `price_3_kurus`,
  `price_4plus_kurus` (integer kuruş, default 0, non-negative).
- New RPC `school_update_pricing(p_price_1, p_price_2, p_price_3,
  p_price_4plus)` writes all four in one call. Auth-only.

Apply this migration in the Supabase SQL editor before the new Profil
"Ders Fiyatlandırması" card and the modal's auto-pricing work.

### Online vs Manuel revenue split (Phase 11)

Gelirler tab now shows app (online) bookings and manual (walk-in / phone)
bookings as separate revenue streams.

Backend (`supabase/migrations/2026_05_phase11_payouts_source_split.sql`):

- `school_payouts_summary()` updated in-place; signature unchanged. Adds
  `pendingOnlineKurus`, `pendingManualKurus`, `releasedOnlineKurus`,
  `releasedManualKurus`, `totalOnlineKurus`, `totalManualKurus`,
  `onlineCount`, `manualCount` to the returned JSON. Joins payouts with
  bookings on `bookings.source` to classify.

Frontend:

- `(school)/(tabs)/payouts.tsx` adds a "Kaynak Bazında" card with a
  stacked online/manual bar and two tiles. Each tile shows the source's
  total + record count + a Bek./Tah. mini split.
- `SchoolPayoutsSummary` type extended with optional source-split fields
  for backwards compatibility with the old RPC shape.

Apply this migration in the Supabase SQL editor.

### Manual booking payment status (Phase 12)

School admins can now track whether a manual (walk-in / phone) booking
has actually been paid. The status is stored on `bookings.payment_status`
(`paid` | `pending`) and is editable from two places:

- The "Yeni Rezervasyon" modal has an "Ödeme Durumu" segmented control
  (Bekliyor / Ödendi). Default is **Bekliyor**.
- The slot detail modal in the Takvim shows the current status pill in
  Turkish (Ödendi / Bekliyor) and a button to flip it
  ("Ödendi olarak işaretle" / "Beklemeye al").

A `payouts` row is created **only when the booking is paid** and
`total_price > 0`. Toggling pending → paid inserts the payout (status
`released`, release_date = lesson_date, recipient = `school`). Toggling
paid → pending deletes the payout. This keeps the Gelirler tab honest:
pending manual bookings do not count toward collected revenue, neither
in the school/instructor split nor in the online/manuel source split.

Backend (`supabase/migrations/2026_05_phase12_manual_payment_status.sql`):

- `school_create_manual_booking` gains `p_payment_status text default
  'paid'` (default keeps the previous behaviour for any older client).
  Skips the payout insert when status is `'pending'`.
- New RPC `school_set_manual_payment_status(p_booking_id uuid, p_status
  text)` — verifies caller is the school admin owning the booking's
  instructor, updates `payment_status`, and creates/deletes the payout
  row accordingly.

Apply this migration in the Supabase SQL editor before the new
"Ödeme Durumu" controls work.

### Super-admin "Okul Ödemeleri" view (Phase 13)

The admin Operasyon tab gets a new sub-tab **"Okul Ödemeleri"** that
lists every ski school with the totals the platform owes them
(bekleyen / tahsil edildi / toplam) plus an expandable per-instructor
breakdown showing which instructors generated the school's payouts.
Each card surfaces the school's IBAN + holder so the operator can wire
the funds; missing IBAN is highlighted as a warning.

Backend (`supabase/migrations/2026_05_phase13_admin_school_payouts.sql`):

- New RPC `admin_school_payouts()` returns a JSON array, one entry per
  school, joined to `payouts` where `recipient_type='school' and
  recipient_id=school.id`. Each entry includes `pending_kurus`,
  `released_kurus`, `total_kurus`, `payout_count`, `iban`,
  `iban_holder_name`, and an `instructors[]` array (per-instructor
  totals + payout count, ordered by total desc). Admin-only via
  `is_admin()`.

Apply this migration in the Supabase SQL editor before opening the
Operasyon → Okul Ödemeleri tab.

### Hotfix: school instructor bookable (Phase 9c)

`supabase/migrations/2026_05_phase9c_school_instructor_booking_fix.sql`
fixes a customer-blocking bug: instructors registered through the app
with a school dropdown selection landed with
`verification_status='pending_documents'` even though their school had
auto-approved them. `create_booking` then refused with "instructor not
verified". The migration:

- Backfills `verification_status='approved'` on existing rows where
  `school_id is not null and school_approval_status='approved'`.
- Updates `handle_new_user()` so a new instructor with `school_id` in
  signup metadata lands with `verification_status='approved'` +
  `school_approval_status='approved'` immediately. Independent
  instructors still default to `pending_documents`.
- Loosens `create_booking()`'s verification gate to accept either
  platform-approved verification or an approved school affiliation
  (defence in depth).

Apply this migration in the Supabase SQL editor; the booking screen's
"Onayla" button works again afterwards.

### Disputes (refunds workflow)

Backend lives in `supabase/migrations/2026_05_phase5_disputes.sql`
(disputes table + RLS, `payouts.status` extended with `cancelled`, RPCs
`file_dispute(uuid,text,text)` and
`admin_resolve_dispute(uuid,text,integer,text)`). Migration must be
pasted into the Supabase SQL editor before the UI works.

## Workspace conventions

- Node 24, TypeScript 5.9, pnpm.
- Each package owns its dependencies; shared runtimes go in `pnpm-workspace.yaml` catalog.
- Static/client-only artifacts put runtime libs in `devDependencies`.
- Server artifacts put runtime libs in `dependencies`.

## Key commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

See the `pnpm-workspace` skill for monorepo details.
