# Workspace

## Overview

pnpm workspace monorepo. Active product is **Snow Connects** — a Turkish, mobile-first
ski-lesson booking app (Expo + React Native) backed by Supabase.

## Artifacts

| Slug | Path | Kind | Purpose |
|------|------|------|---------|
| `snow-connects` | `/` | Expo (mobile + web) | The main product |
| `api-server` | `/api` | Express (Node) | Scaffold from template; not currently used (Supabase is hit directly) |
| `mockup-sandbox` | `/__mockup` | Vite | Internal canvas mockup tooling |

## Snow Connects

### Stack

- **App**: Expo Router 6 + React Native (web build for Replit preview)
- **Backend**: Supabase (Auth + Postgres + Realtime + RLS), called via `lib/supabase.ts`
- **State**: TanStack Query
- **Fonts**: Inter via `@expo-google-fonts/inter`
- **Language**: Turkish (Türkçe) primary
- **Theme**: Light only — winter palette (white / deep navy `#0e2a47` / ice blue `#7fb3d5`)

### Roles & flows

Four roles: `customer`, `instructor`, `school_admin`, `admin`. Stored on `public.users.role`
and written by the `handle_new_user()` trigger from `auth.users.raw_user_meta_data` (set by
`supabase.auth.signUp(..., { options: { data: { role, school_id? } } })`).

**Guest browsing.** App opens on the resort list — no login required to browse resorts,
instructor lists, or instructor profiles. Auth is prompted only on member-only actions
(booking, payment, chat, the Rezervasyonlar/Mesajlar/Profil tabs). Auth screens accept
`?next=<path>` and bounce the user back. See `components/ui/SignInGate.tsx`.

Role-aware routing in `(app)/_layout.tsx`, `(admin)/_layout.tsx`, `(school)/_layout.tsx`,
and `(auth)/login.tsx` (`resolveTarget`): admins → `/(admin)/(tabs)`, school_admin →
`/(school)/(tabs)`; everyone else stays in `(app)`. Customer flow: resort grid →
instructor list → detail → date pick → slots → students → summary → payment → bookings
+ chat. Instructor flow: today's overview, calendar (8 daily 50-min slots), bookings,
payouts, profile setup (new "Eğitmen" registrants land on `instructor-panel/setup`).

### Domain rules

- **Season**: configurable in `app_config.season_*_month/day` (default 15 Dec → 15 Apr).
  `create_booking` enforces it; admin Settings tile edits it live.
- **Slots**: 8 per day, 50-minute lessons starting on the hour `09:00 … 16:00` (last
  lesson `16:00–16:50`). See `lib/timeSlots.ts`.
- **Pricing**: per-tier per-person prices on `instructor_profiles.price_N_person` (kuruş).
  Customer total = `base × students × slots`, +20% KDV, + bank commission, + transaction
  fee. School-affiliated instructors price from the school's tariff (Phase 10/15) — see
  Effective school pricing below. Server is the source of truth (`create_booking`).
- **Payouts**: created on `confirm_payment` (or inline in `create_booking` when
  `app_config.test_mode=true`, Phase 6). Release date = lesson date + 21 business days.
  When the instructor has a `school_id`, payout `recipient_type='school'`.
- **Contact-info filter**: `detect_contact_info()` blocks emails/URLs/TR phones/10+ digit
  runs in chat. Instructor: 3 strikes → `blocked`. Customer: every violation flags for
  admin review.
- **Money**: integer **kuruş**. Display via `lib/format.ts:formatTRY`.
- **Payments**: Param.com integration **stubbed**. Payment screen simulates success then
  calls `confirm_payment`.

### Supabase setup (one-time, manual)

DDL must be pasted into the Supabase SQL editor — project keys can't apply DDL
programmatically. Steps: open SQL editor for `SUPABASE_URL`, paste the entire contents
of `supabase/schema.sql`, run. Idempotent. Then paste any `supabase/migrations/*.sql`
files added after schema (apply in filename order). Schema seeds 7 Turkish resorts
(Sarıkamış, Palandöken, Uludağ, Kartalkaya, Erciyes, Ilgaz, Ergan).

Promote a user to admin from the SQL editor:

```sql
update public.users set role = 'admin' where email = 'you@example.com';
```

### Environment

The Expo `dev` script in `artifacts/snow-connects/package.json` exposes:

- `EXPO_PUBLIC_SUPABASE_URL` ← `SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ← `SUPABASE_PUBLISHABLE_KEY`

Both come from workspace secrets. `SUPABASE_SECRET_KEY` is used only by Node seed scripts.

### Layout

```
artifacts/snow-connects/
├── app/
│   ├── (auth)/{login,register}.tsx
│   ├── (app)/                       # customer + instructor surfaces
│   │   ├── (tabs)/{index,bookings,messages,profile}.tsx
│   │   ├── resort/[id].tsx · instructor/[id].tsx · dates/[instructorId].tsx
│   │   ├── book/[instructorId].tsx · payment/[bookingId].tsx
│   │   ├── booking-detail/[bookingId].tsx · messages/[userId].tsx
│   │   └── instructor-panel/{calendar,setup,payments,verification}/…
│   ├── (admin)/(tabs)/{index,approvals,users,operations,system}.tsx
│   │              + verification/[id].tsx
│   └── (school)/(tabs)/{index,bookings,payouts,profile}.tsx
├── components/{ui,admin}/           # Button, Card, Pill, AdminUI, …
├── contexts/AuthContext.tsx
├── lib/                             # supabase, types, pricing, contactFilter, season,
│                                    #   timeSlots, format, adminTheme
├── constants/colors.ts              # winter palette
├── supabase/schema.sql              # one-time DB setup
└── supabase/migrations/2026_05_*.sql  # apply in filename order after schema
```

### Admin panel (`app/(admin)/`)

Dedicated route group for `role='admin'`. Distinct dark theme (`lib/adminTheme.ts`) and
admin-only primitives (`components/admin/AdminUI.tsx`); admin screens never reuse the
warm customer Card/Pill/Header — except verification detail, which still uses customer
chrome (known visual inconsistency).

| Tab | File | Sub-sections |
|---|---|---|
| Pano | `(tabs)/index.tsx` | Stats (revenue, payouts, queue, flags, users, resorts) |
| Onaylar | `(tabs)/approvals.tsx` | Eğitmen onay kuyruğu (pending/approved/rejected) |
| Kullanıcılar | `(tabs)/users.tsx` | Eğitmenler / Müşteriler (search, block/unblock) |
| Operasyon | `(tabs)/operations.tsx` | Rezervasyonlar / Ödemeler / Şikayetler / İtirazlar / Okul Ödemeleri |
| Sistem | `(tabs)/system.tsx` | Pistler / Okullar / Ayarlar (KDV, komisyon, sezon) |

Verification detail at `(admin)/verification/[id].tsx`. Backend in
`supabase/migrations/2026_05_admin_panel.sql`: admin-additive RLS + RPCs `admin_stats`,
`admin_set_user_status`, `admin_release_payout`, `admin_resolve_flag`,
`admin_upsert_resort`, `admin_delete_resort`, `admin_update_config` (all gated on
`role='admin'`).

Test admin (seeded via `auth.admin.createUser` with `SUPABASE_SECRET_KEY`):
`admin@snowconnects.com` / `admin123` (id `793cbd02-08f3-43bf-8316-a3596c853b1a`).

### Migrations summary (apply in order)

Each migration is in `supabase/migrations/` and is idempotent. Apply via SQL editor.

- **Phase 5 — Disputes (`2026_05_phase5_disputes.sql`).** Disputes table + RLS,
  `payouts.status` gains `cancelled`. RPCs `file_dispute(uuid,text,text)`,
  `admin_resolve_dispute(uuid,text,integer,text)`. One dispute per paid booking, file-able
  from lesson date via "Sorun Bildir" in `booking-detail/[bookingId].tsx`. Admin reviews
  in Operasyon → İtirazlar; approve refunds (capped at `total_price`), frees slots, marks
  booking refunded, cancels pending payout. Reject keeps funds with instructor.

- **Phase 6 — Test-mode payout fix (`2026_05_phase6_payouts_fix.sql`).** When
  `app_config.test_mode=true`, `create_booking` auto-pays inline but originally forgot to
  insert a `payouts` row. Migration inserts the payout (release_date = lesson_date + 21
  business days) and backfills already-paid bookings. `schema.sql` carries the fix too.

- **Phase 8 — Ski schools (`2026_05_phase8_ski_schools.sql`).** Adds `school_admin` role,
  `ski_schools` table (name, slug, description, iban, iban_holder_name, admin_user_id,
  status), `instructor_profiles.school_id` + `school_approval_status`. School-affiliated
  instructors skip platform verification (their school approves them; `verification_status`
  is kept in lockstep). `payouts.recipient_type` (`instructor`|`school`) +
  `recipient_id`; `confirm_payment` and the test-mode `create_booking` route to the school
  when `school_id` is set. RPCs: `school_list_instructors`,
  `school_set_instructor_status`, `school_payouts_summary`, `school_update_profile`,
  `admin_upsert_school`, `admin_delete_school`, `admin_set_school_status`,
  `admin_search_users`. Frontend: `(school)/(tabs)` with Eğitmenler / Rezervasyonlar /
  Gelirler / Profil. Register screen has optional "Kayak okulu" dropdown for instructors;
  customer instructor cards show a small school badge; admin Sistem → Okullar manages CRUD.
  Seed via `seed-schools.mjs` (Snow Academy: `s@snow.com`/`123456`, instructors
  `i2/i3/i4@snow.com` attached, `i/i1@snow.com` independent).

- **Phase 9 — Manual bookings + unified school calendar
  (`2026_05_phase9_manual_bookings.sql`).** School admins enter walk-in / phone
  reservations; online and manual bookings share the `bookings` table and slot locking.
  Adds `bookings.source ('online'|'manual')`, `manual_customer_name/phone/notes`,
  `customer_id` nullable. RPCs `school_create_manual_booking`,
  `school_delete_manual_booking`, `school_day_calendar(date)` (one row per
  instructor×slot for the day). RLS lets school admins read `students` of their school's
  bookings. Frontend: `(school)/(tabs)/bookings.tsx` is the unified Günlük Takvim
  (14-day strip, "Yeni Rezervasyon" button, multi-hour lessons collapsed with
  Manuel/Online pill); modal flow date → slots → eğitmen filtered to free for every
  chosen slot → customer + students → save.

- **Phase 9b — Revenue split (`2026_05_phase9b_instructor_share.sql`).** Each school
  splits revenue between instructor and school (default **35/65**, editable from Profil).
  Adds `ski_schools.instructor_share_rate`. Manual bookings now also create a `payouts`
  row (recipient `school`, status `released`, release_date = lesson_date) — Phase 12 later
  refines this to skip the row for `pending` manual bookings. `school_payouts_summary`
  returns `instructorShareRate` + per-side totals; new RPCs
  `school_instructor_breakdown()` (per-instructor totals) and
  `school_update_share_rate(numeric)`. Gelirler tab: stacked split bar + tiles + per-
  instructor breakdown + per-payout history with Online/Manuel pill.

- **Phase 9c — School instructor bookable
  (`2026_05_phase9c_school_instructor_booking_fix.sql`).** Hotfix: instructors registered
  through the school dropdown landed `verification_status='pending_documents'` even when
  school-approved, so `create_booking` refused. Backfills `approved`, updates
  `handle_new_user()` so school-affiliated signups land approved on both axes, and loosens
  `create_booking`'s gate to accept either platform approval or approved school
  affiliation.

- **Phase 10 — School pricing tiers (`2026_05_phase10_school_pricing.sql`).** Adds
  `ski_schools.price_{1,2,3,4plus}_kurus` (default 0, non-negative). New RPC
  `school_update_pricing(p_price_1, p_price_2, p_price_3, p_price_4plus)`. Profil gains
  "Ders Fiyatlandırması" card; manual booking modal auto-fills `Tutar` from
  `pricePerStudent50min × studentCount × slotCount` with a "Sıfırla" link.

- **Phase 11 — Online vs Manuel revenue split
  (`2026_05_phase11_payouts_source_split.sql`).** `school_payouts_summary` (signature
  unchanged) gains `pending/released/total OnlineKurus/ManualKurus` + `online/manualCount`
  by joining payouts with `bookings.source`. `(school)/(tabs)/payouts.tsx` adds a
  "Kaynak Bazında" card with stacked online/manual bar. `SchoolPayoutsSummary` type
  extends source-split fields as optional for backwards compatibility.

- **Phase 12 — Manual booking payment status
  (`2026_05_phase12_manual_payment_status.sql`).** Tracks whether a manual booking has
  actually been paid via `bookings.payment_status` (`paid`|`pending`). New-reservation
  modal exposes "Ödeme Durumu" (default Bekliyor); slot detail modal shows the pill and
  a flip button. A `payouts` row is created **only when paid** (and `total_price > 0`);
  toggling pending↔paid inserts/deletes it. RPCs: `school_create_manual_booking` adds
  `p_payment_status text default 'paid'`; new
  `school_set_manual_payment_status(p_booking_id uuid, p_status text)`.

- **Phase 13 — Super-admin "Okul Ödemeleri"
  (`2026_05_phase13_admin_school_payouts.sql`).** Admin Operasyon → Okul Ödemeleri lists
  every school with bekleyen / tahsil / toplam totals + expandable per-instructor
  breakdown + IBAN (warning if missing). RPC `admin_school_payouts()` returns one entry
  per school joined to `payouts` where `recipient_type='school'` (admin-only).

- **Phase 14 — School ↔ instructor cash settlements
  (`2026_05_phase14_school_instructor_payments.sql`).** Bookkeeping for bulk cash
  transfers from school to instructor (no FK to payouts/bookings, no gateway). New table
  `school_instructor_payments` (`school_id`, `instructor_id`, `amount_kurus > 0`, `note`,
  `paid_at`, `created_by`) with RLS so school admins read their school's rows and
  instructors read their own. Helpers `_school_instructor_earned_kurus` (sums *released*
  school payouts × `instructor_share_rate`) and `_school_instructor_paid_kurus`. RPCs:
  `school_instructor_payment_summary` (per-instructor earned/paid/balance + last paid +
  IBAN, includes ex-school instructors with history),
  `school_record_instructor_payment(instructor, amount, note)` (validates
  `paid + amount ≤ earned`), `school_instructor_payment_history(instructor)`,
  `school_delete_instructor_payment(id)` (24h undo for school admin),
  `instructor_my_school_payments()` (read-only for instructor side). Frontend:
  `(school)/(tabs)/index.tsx` has two top sub-tabs Onaylar / Ödemeler; the new Ödemeler
  section lists each instructor with hak edilen / ödenen / kalan + IBAN + Ödeme Yap +
  Geçmiş buttons. `(app)/instructor-panel/payments.tsx` gains a collapsible "Okuldan
  Aldığım Ödemeler" card (auto-hides for independents).

- **Phase 17 — Hide manual payouts from super-admin
  (`2026_05_phase17_admin_school_payouts_online_only.sql`).** Manual bookings still
  insert a school payout (Phase 9b) so the school's Gelirler tab works, but those rows
  must not surface on the super-admin side. `admin_school_payouts()` is replaced
  in-place to only count payouts whose underlying `bookings.source = 'online'` (joins
  via `payouts.booking_id`); per-school + per-instructor totals therefore exclude manual
  income. `admin_stats().pendingPayoutsKurus` is filtered the same way so the Pano tile
  reflects what the platform actually owes. Manual rows stay in the database for the
  school side and DB lookups.

- **Phase 16 — Hide manual bookings from super-admin
  (`2026_05_phase16_admin_stats_exclude_manual.sql`).** Schools' internal manual
  (walk-in / phone) bookings are bookkeeping artefacts the platform never collects money
  for, so they shouldn't appear in super-admin views. `admin_stats()` is replaced
  in-place to count `totalBookings` / `paidBookings` / `revenueKurus` only where
  `bookings.source = 'online'` (other counters unchanged). The Operasyon → Rezervasyonlar
  list query in `(admin)/(tabs)/operations.tsx` adds `.eq('source', 'online')` for the
  same reason.

- **Phase 18 — Request-to-Book / Airbnb-style approval
  (`2026_05_phase18_request_to_book.sql`).** Customers no longer auto-charge
  on booking — they SEND a REQUEST and the instructor has 12h to accept/reject.
  Slots are tentatively held the moment the request is sent; freed if the
  request is rejected, customer-cancelled, or auto-expired. After 12h without
  a response the request moves to `awaiting_response` (NOT cancelled), and the
  customer is offered "Beklemeye Devam" (+12h, increments `extension_count`)
  or "Geri Çek". Hard guardrail: any still-pending request within 24h of the
  lesson date is auto-cancelled. New columns on `bookings`: `approval_status`
  (pending|awaiting_response|approved|rejected|expired|customer_cancelled —
  NULL on legacy paid bookings, which the migration backfills to `approved`),
  `requested_at`, `approval_deadline`, `approved_at`, `rejection_reason`,
  `extension_count`, `payment_method_token`. New column on
  `instructor_profiles`: `instant_book_enabled boolean default false` —
  when true, requests skip approval and are auto-paid (legacy flow). New
  table `push_tokens(user_id, token, platform)` with RLS for Expo push.
  RPCs (all `security definer`): `request_booking` (replaces `create_booking`
  for the customer flow; falls back to instant when `test_mode` or
  `instant_book_enabled` — same payout behaviour as before),
  `instructor_accept_request` (captures stub payment, inserts payout, routes
  to school recipient when `school_id` set), `instructor_reject_request`
  (frees slots, no charge), `customer_extend_request` (clamps new deadline
  to `lesson_date − 24h`), `customer_cancel_request` (frees slots),
  `mark_overdue_requests` (sweeper: pending → awaiting_response after 12h),
  `auto_cancel_late_requests` (24h-before-lesson guardrail),
  `instructor_set_instant_book(boolean)`, `register_push_token(text,text)`.
  Optional pg_cron jobs (every 5/15 min) registered when extension exists.
  Frontend: `book/[instructorId]` calls `request_booking` and routes to
  bookings list with "Talebin gönderildi" alert (instant flow still routes
  to payment screen); `booking-detail/[bookingId]` renders 4 new states with
  the empathetic 12h "Eğitmen henüz dönüş yapmadı" card +
  Beklemeye-Devam / Geri-Çek buttons (customer side) and Onayla / Reddet
  buttons (instructor side); Eğitmen home (`(tabs)/index.tsx`
  `InstructorHome`) shows a "Bekleyen Talepler" card with count badge,
  customer name, slot count, time-since-request, and inline accept/reject;
  `instructor-panel/setup.tsx` exposes the Anında Onay toggle. Push
  notification UI is scaffolded but token-registration wiring is intentionally
  left for a Phase 18b — the table + RPC are in place so the client can opt
  in without further DB work.

- **Phase 18b — Request-to-Book 24h guardrail hotfix
  (`2026_05_phase18b_request_book_fixes.sql`).** Phase 18 only checked
  `p_date < current_date + 1`, which let through any lesson scheduled for
  tomorrow even when the earliest slot started in just a few hours — making
  both the 12h SLA and the 24h auto-cancel guardrail useless. Replaces
  `request_booking` in-place to compare against the actual earliest slot
  timestamp: `(p_date + min(slot_time))::timestamptz < now() + 24h` →
  `lesson_too_soon`. Same translation already exists in
  `book/[instructorId].tsx:translateError`.

- **Phase 15 — Effective school pricing
  (`2026_05_phase15_school_pricing_effective.sql`).** Phase 10 added per-school tier
  prices but `create_booking` and the customer screens never read them, so school-
  affiliated instructors showed ₺0. `create_booking` is replaced in-place to resolve
  effective tier price as: school tier (if set, > 0) → instructor's own tier → legacy
  `base_price`. New helper `lib/pricing.ts:effectiveTieredProfile(profile, school)`
  overlays the school's tiers onto the instructor's profile (returns the profile
  untouched for independents). Used by `(app)/resort/[id].tsx` (list cards),
  `(app)/instructor/[id].tsx` (price card), and `(app)/book/[instructorId].tsx`
  (`calcBreakdown`), so customer estimates match the server total exactly.

## Workspace conventions

- Node 24, TypeScript 5.9, pnpm.
- Each package owns its dependencies; shared runtimes go in the `pnpm-workspace.yaml`
  catalog.
- Static/client-only artifacts put runtime libs in `devDependencies`; server artifacts in
  `dependencies`.

## Key commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/snow-connects run typecheck` — Snow Connects only

See the `pnpm-workspace` skill for monorepo details.
