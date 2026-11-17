# EXPENSES TRACKER 4.1.0 — Engineering audit and upgrade plan

## Safety and scope

Inspected the existing `projectvaultin/expenses_tracker` repository and its active Supabase project. This branch is an in-place candidate. Production `main` remains unchanged. No database migration, Supabase data write, record deletion, account change, or storage mutation was performed.

## Existing application

The source is a large single-file HTML/CSS/JavaScript app. It already includes Supabase Auth, Home, income/expense entry, history, edit/delete, budgets, category budgets, reminders, debts/repayments, shared money, connections, notifications, announcements, support, app updates, admin tools, festivals, birthdays, sponsored media and PWA support. The upgrade should strengthen this product, not replace it.

## Read-only Supabase findings

- The project is active in ap-south-1.
- Core tables have RLS enabled and contain existing user and financial data.
- Transactions and debts use authenticated UUID ownership in their own-row policies.
- Reminders map the authenticated UUID to the legacy profile ID.
- `pv_user_app_state` exists with owner-scoped policies, but current HTML does not use it.
- `pv_automation_runs` has RLS enabled but no public policies; confirm trusted backend-only access is intended.
- Supabase advisors report multiple permissive policies, duplicate/unused indexes and unindexed foreign keys. Do not remove or alter these without policy-union and query-plan review.

## Important findings

### Hybrid storage is not yet cloud-first

The app still uses per-user localStorage for transactions, debts, reminders, categories, budgets and preferences. Several paths sync to Supabase, but some failure paths retain local-only records. Manual transaction creation writes to Supabase in the normal path; if the write fails, it keeps a local record with no Supabase ID. Android sync imports rows from Supabase into local state. That is not yet a complete, verified two-way reconciliation strategy.

Required: stable client IDs, idempotent upload, per-account checkpoints, read-back comparison, rollback snapshot, cloud-first reads and a compatibility period. Do not clear local storage or bulk-overwrite cloud data before verification.

### Authentication RPC exposure

Security advisors report five SECURITY DEFINER RPCs callable by anon, including signup availability and username/mobile-to-auth-email lookups. The lookup functions return email addresses and can enable account enumeration. They currently support username/mobile login; simply revoking anon execution would break sign-in. Replace the contract with a rate-limited server-side login endpoint and migrate web and Android callers together before tightening grants.

### Other security items

- Leaked-password protection is disabled according to Supabase Auth advisor.
- `pg_net` is installed in public; review extension dependencies before moving it.
- Review the no-policy automation-run table finding.
- Review security-definer function grants and search_path settings as a tested migration, not a blanket revoke.

## 4.1.0 foundation changes

- Fixed manifest icon paths to existing PNG assets.
- Added both 192px and 512px icon declarations, description, stable ID and scope.
- Bumped service-worker cache to v11.
- Fixed Supabase hostname matching and excluded Supabase/cross-origin requests from service-worker interception.
- Added offline shell fallback and static smoke tests.
- Bumped app version to 4.1.0.

## Major upgrade phases

A. Reliability baseline: syntax/asset checks; auth, account switching, sync, realtime, duplicate handling and failure recovery.

B. Cloud-first migration: inventory local keys; stable IDs; idempotent upload; read-back/hash reconciliation; backup; cloud-backed reads/writes; compatibility period; retire durable local keys only after verified accounts.

C. Finance completion: transaction tags/search/filters, recurring entries, reminder payment/undo, budgets/rollover, savings goals, debt lifecycle, reports, analytics, export/backup.

D. UI polish: preserve requested navigation and dashboard hierarchy; consistent premium design; responsive charts/tables; empty/loading/error states; accessibility and touch targets.

E. Notifications/admin: verify scheduling, receipts, read states, duplicate prevention, timezone, role checks and admin audit trail.

F. Android/release: inspect Android source separately (not in this repository); validate notification parsing, account identity, idempotent transaction insert and realtime consumption; build and test APK/WebAPK on device; release via reviewed PR with backups.

## Release gate

The 4.1.0 candidate requires CI and real browser, Supabase Auth/RLS, multi-account, Android and recovery tests. Do not merge to production until they pass.
