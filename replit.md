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

### Disputes (refunds workflow) — Phase 5

`supabase/migrations/2026_05_phase5_disputes.sql`: disputes table + RLS,
`payouts.status` extended with `cancelled`, RPCs `file_dispute(uuid,text,
text)` and `admin_resolve_dispute(uuid,text,integer,text)`. One dispute
per paid booking, file-able from the lesson date onward via the
"Sorun Bildir" CTA in `app/(app)/booking-detail/[bookingId].tsx`. Admins
review from Operasyon → "İtirazlar" sub-tab (badge counts pending);
approve sets a refund amount (TL, capped at `total_price`), frees slots,
marks the booking refunded, and cancels any pending payout. Reject keeps
funds with the instructor. Decisions write a customer-facing note.

### Test-mode payouts fix — Phase 6

`supabase/migrations/2026_05_phase6_payouts_fix.sql`: when
`app_config.test_mode = true`, `create_booking()` auto-pays inline; the
original forgot to insert a `payouts` row, so instructors saw zero
earnings. The migration inserts the payout inline (release_date =
lesson_date + 21 business days, matching `confirm_payment`) and
backfills payouts for any already-paid booking missing one.
`schema.sql` carries the same fix for fresh installs.

### Ski schools — Phase 8

`supabase/migrations/2026_05_phase8_ski_schools.sql` introduces the
`school_admin` role and the school revenue model. Schools own a roster
of instructors and receive payouts to a single school IBAN.

- New table `ski_schools` (name, slug, description, iban,
  iban_holder_name, admin_user_id, status). `users.role` check expanded
  with `school_admin`.
- `instructor_profiles.school_id` + `school_approval_status`
  (`pending`/`approved`/`rejected`). School-affiliated instructors skip
  the platform `instructor_verification` flow; their school admin
  approves them and `verification_status` is kept in lockstep so the
  customer-facing `verification_status='approved'` filter keeps working.
- `payouts.recipient_type` (`instructor`|`school`) + `recipient_id`.
  `create_booking` (test_mode auto-pay path) and `confirm_payment` route
  the payout to the school when the instructor has a `school_id`. RLS
  lets school admins read their own school's payouts.
- `handle_new_user()` reads optional `school_id` from
  `auth.users.raw_user_meta_data` so an instructor can affiliate at
  signup.
- RPCs: `school_list_instructors`, `school_set_instructor_status`,
  `school_payouts_summary`, `school_update_profile`,
  `admin_upsert_school`, `admin_delete_school`,
  `admin_set_school_status`, `admin_search_users`. All school RPCs
  check `is_school_admin()`; admin RPCs check `is_admin()`.

Frontend: `(school)/(tabs)` route group (gated to `school_admin`) with
four tabs — Eğitmenler (approve/reject), Rezervasyonlar, Gelirler
(pending/released tiles), Profil (name/desc/IBAN). Auth and app layouts
redirect `school_admin` users into `/(school)/(tabs)`. Register screen
adds an optional "Kayak okulu" dropdown for instructors. Customer
instructor cards show a small school badge. Admin → Sistem → "Okullar"
sub-tab provides full CRUD with user search to assign the school admin.

Test data (`seed-schools.mjs`, run with `SUPABASE_SECRET_KEY` env):
`s@snow.com` / `123456` is the school_admin of "Snow Academy";
`i2@snow.com`, `i3@snow.com`, `i4@snow.com` are attached and approved;
`i@snow.com`, `i1@snow.com` stay independent. The seed script must run
*after* the phase8 migration is applied.

### Manual bookings + unified school calendar — Phase 9

`supabase/migrations/2026_05_phase9_manual_bookings.sql` lets school
admins enter walk-in / phone reservations directly; online and manual
bookings live in the same `bookings` table and share slot locking, so a
single Takvim view shows both.

- `bookings.source text default 'online' check in ('online','manual')`,
  `manual_customer_name`, `manual_customer_phone`, `manual_notes`.
  `customer_id` is now nullable.
- RPCs (signatures evolved later, see Phases 9b/12):
  `school_create_manual_booking(...)` — validates instructor belongs to
  caller's school, locks slots the same way `create_booking` does,
  inserts a manual booking row.
  `school_delete_manual_booking(id)` — only manual bookings of the
  caller's school's instructors; frees the slots.
  `school_day_calendar(date)` — one row per (instructor, slot) for the
  day, with booking + students info merged in.
- RLS: school admins can read `students` of their school's bookings.

Frontend: `(school)/(tabs)/bookings.tsx` is the unified "Günlük Takvim"
(14-day date strip, single **"Yeni Rezervasyon"** button, read-only
instructor cards beneath showing the day's bookings + blocked slots,
multi-hour lessons collapsed into one row with Manuel/Online pill).
Tapping a booked entry opens a detail modal with delete (and, after
Phase 12, payment-toggle) actions for manual ones. The new-reservation
modal: pick date → pick slot(s) → eğitmen list is filtered live to
those free for every chosen slot (reuses `school_day_calendar`) → fill
customer + students → save.

### Revenue split — Phase 9b

`supabase/migrations/2026_05_phase9b_instructor_share.sql`: each school
splits revenue between instructor and school (default **35% instructor
/ 65% school**, editable from Profil).

- `ski_schools.instructor_share_rate numeric default 0.35
  check (>=0 and <=1)`.
- Manual bookings now also create a `payouts` row (status `released`,
  release_date = lesson_date, recipient `school`) so manual income
  shows up in the Gelirler split. Skipped only when no price was
  entered. (Phase 12 later changes this to skip the payout when the
  manual booking is `pending` instead of `paid`.)
- `school_create_manual_booking` and `school_delete_manual_booking`
  updated in-place; signatures unchanged. Delete also removes the
  paired payout row.
- `school_payouts_summary` now returns `instructorShareRate` plus split
  totals (`pendingInstructorKurus`, `pendingSchoolKurus`,
  `releasedInstructorKurus`, `releasedSchoolKurus`).
- New RPC `school_instructor_breakdown()` — per-instructor totals
  (lesson count, gross, instructor share, school share).
- New RPC `school_update_share_rate(p_rate numeric)` for Profil.

Frontend: Gelirler top card shows total revenue with a stacked split
bar (school vs instructor) + two split tiles, then Bekleyen/Tahsil
tiles, then per-instructor breakdown, then per-payout history with
Online/Manuel + "Eğitmen X TL" pill on each row. Profil gains a
"Gelir Paylaşımı" card with percentage input + live preview; Save runs
`school_update_profile` and `school_update_share_rate` together.

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

### Effective school pricing (Phase 15)

Phase 10 added per-school tier prices on `ski_schools.price_X_kurus`
and a `school_update_pricing()` RPC, but `create_booking` and the
customer-facing screens were never wired to actually read them. As a
result, school-affiliated instructors showed ₺0 on their public profile
and bookings were priced from the (empty) `instructor_profiles`
columns.

Backend (`supabase/migrations/2026_05_phase15_school_pricing_effective.sql`):

- `create_booking()` replaced in-place. Effective tier price now
  resolves as: school tier (when school-affiliated and `> 0`) →
  instructor's own tier → legacy `base_price`. Same `coalesce(nullif(...))`
  pattern per tier so an unset school tier transparently falls back to
  the instructor's price.

Frontend:

- `lib/pricing.ts` — new `effectiveTieredProfile(profile, school)`
  helper that overlays a school's tier columns onto an instructor's
  profile and is reused by both customer-facing screens. Independent
  instructors get the original profile back unchanged.
- `app/(app)/instructor/[id].tsx` selects the school's price columns
  alongside `name`/`description` and runs them through
  `effectiveTieredProfile` before rendering the price card.
- `app/(app)/book/[instructorId].tsx` does the same before computing
  `calcBreakdown`, so the customer-facing estimate exactly matches the
  server total.

Apply this migration in the Supabase SQL editor before re-testing
school pricing.

### School → instructor cash settlements (Phase 14)

School admins can now record bulk cash transfers to their instructors and
each instructor can review the history of payments their school has made
to them. Bookkeeping only — no FK to `payouts` or `bookings`, no payment
gateway involvement.

Backend (`supabase/migrations/2026_05_phase14_school_instructor_payments.sql`):

- New table `school_instructor_payments` (`school_id`, `instructor_id`,
  `amount_kurus > 0`, `note`, `paid_at`, `created_by`). RLS: school
  admins read their school's rows; instructors read their own.
- Helpers `_school_instructor_earned_kurus(school, instructor)` (sums
  *released* school payouts for that instructor multiplied by the
  school's `instructor_share_rate`) and `_school_instructor_paid_kurus`
  (sum of recorded payments).
- RPCs:
  - `school_instructor_payment_summary()` — per-instructor earned/paid/
    balance + last payment date + IBAN. Includes ex-school instructors
    that still have payment history so balances stay reconciled.
  - `school_record_instructor_payment(p_instructor, p_amount_kurus,
    p_note)` — validates `paid + amount <= earned`.
  - `school_instructor_payment_history(p_instructor)` — newest first.
  - `school_delete_instructor_payment(p_id)` — 24h undo window for the
    school admin.
  - `instructor_my_school_payments()` — read-only feed for the
    instructor side.

Frontend:

- `(school)/(tabs)/index.tsx` rewritten with two top sub-tabs:
  **Onaylar** (existing approval flow, unchanged) and **Ödemeler** (new).
  The Ödemeler section lists every instructor with a hak edilen / ödenen
  / kalan tile row, IBAN display, "Ödeme Yap" + "Geçmiş" buttons.
  RecordPaymentModal pre-fills the input with the remaining balance and
  caps it client-side; PaymentHistoryModal lists each payment with the
  24h delete affordance.
- `(app)/instructor-panel/payments.tsx` gains a new
  "Okuldan Aldığım Ödemeler" card (collapsible, school name + amount +
  date + note per row). The card auto-hides when the RPC returns no
  rows so independent (non-school) instructors don't see an empty
  section.

Apply this migration in the Supabase SQL editor before opening the
Eğitmenler → Ödemeler sub-tab.

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

### Hotfix: school instructor bookable — Phase 9c

`supabase/migrations/2026_05_phase9c_school_instructor_booking_fix.sql`
fixes a customer-blocking bug: instructors registered with a school
dropdown selection landed with `verification_status='pending_documents'`
even though their school had auto-approved them, so `create_booking`
refused with "instructor not verified". The migration backfills
`verification_status='approved'` for existing school-approved rows,
updates `handle_new_user()` so new school-affiliated signups land
approved on both axes (independents still default to
`pending_documents`), and loosens `create_booking()`'s verification
gate to accept either platform approval or approved school affiliation.

## Workspace conventions

- Node 24, TypeScript 5.9, pnpm.
- Each package owns its dependencies; shared runtimes go in `pnpm-workspace.yaml` catalog.
- Static/client-only artifacts put runtime libs in `devDependencies`.
- Server artifacts put runtime libs in `dependencies`.

## Key commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

See the `pnpm-workspace` skill for monorepo details.
