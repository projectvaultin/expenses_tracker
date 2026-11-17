# EXPENSES TRACKER — ProjectVault

This is the existing ProjectVault Expenses Tracker application. Release 4.1.0 is an in-place upgrade candidate: same app, repository, Supabase project, accounts and records.

## Product direction

- Premium, responsive, mobile-first UI with smooth and restrained animations.
- Top bar: menu, profile, app name/username, sync status, notifications and How to Use.
- Bottom navigation: Home, Add, History, Debts and Manage.
- Dashboard: Net Balance, Combined Total (Income + Expenses), Top Spending Category, Income and Expenses side by side, I Borrowed / I Gave, and By Category.
- Finance tools: income/expense records, search and filters, budgets, category budgets, savings insights, recurring reminders, debts and repayment history, reports and analytics.
- Account/admin: Supabase authentication, profile/security, announcements, notifications, support, admin tools, events and media.
- Delivery: installable PWA/web app; Android APK/WebAPK compatibility is verified against the actual Android source and a device separately.

## 4.1.0 candidate changes

- Corrected PWA manifest icon paths to use existing PNG assets.
- Added app description, stable ID/scope, and 192/512 icons.
- Bumped service-worker cache to v11.
- Corrected Supabase hostname matching and excluded cross-origin/Supabase traffic from service-worker caching.
- Added offline shell fallback and static smoke tests.
- Bumped in-app version label to 4.1.0.

## Existing data architecture

Supabase Auth authenticates accounts. Supabase tables store transactions, debts, reminders, categories, category budgets, settings, shared money, notifications, announcements, and event/media data. Browser `localStorage` remains a local cache/mirror for several durable records and preferences; some failure paths keep local-only records.

The next major engineering phase is a zero-loss, idempotent per-user migration:
1. Inventory and classify all local keys.
2. Assign stable IDs/idempotency keys to every durable record.
3. Upload without overwriting or duplicating existing cloud records.
4. Read records back and compare counts/field hashes.
5. Keep a recoverable backup until verification passes.
6. Switch reads/writes to Supabase, retaining a compatibility mirror during rollout.
7. Retire durable local keys only after every account is verified.

This release does not perform that migration or delete local data. Do not clear browser data during installation.

## Supabase safety

- Existing Supabase project remains the backend.
- No SQL migrations, DDL or database writes are part of this release candidate.
- Never expose service-role/secret keys in browser code.
- Current username/mobile login depends on RPCs that resolve identifiers to auth emails. Supabase security advisors flag these as anonymous-executable SECURITY DEFINER functions. Do not simply revoke access: replace them with a rate-limited server-side login flow and update web and Android callers together.
- Enable Supabase leaked-password protection and review security/performance findings before production sign-off.

## Validation

Run `node --test TESTS/release-smoke.test.js`. Then manually test hosted sign-in/signup/recovery/logout, transaction and debt CRUD, reminders, budgets, shared debts, notifications, admin-only actions, realtime sync, offline/online behavior, and Android PWA update. This is a candidate, not a production certification.
