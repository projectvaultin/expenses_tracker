# WEBAPP MASTER AUDIT — ProjectVault Expenses Tracker

Scope: `index.html` (single-file app), `manifest.json`, `sw.js`, `supabase/*.sql` (read-only,
not applied). Audited by static analysis, syntax validation (`node --check`), and manual
tracing of every function in the auth/signup/recovery/admin/sync code paths. **No live browser
or Supabase connection was available in this environment** — anything requiring a real network
round-trip is marked YELLOW/UNVERIFIED with an exact manual test procedure, never claimed as
GREEN without having actually run it.

---

## 0. Architecture mismatch found before any fixes (read this first)

The ZIP as uploaded authenticated by hashing the entered password client-side (SHA-256) and
comparing it to `public.users.password_hash`, fetched with the anon key — this directly
violated the master prompt's critical rule ("must NOT authenticate by comparing password_hash
in public.users") and is a textbook credential-exposure pattern: the entire `users` table,
including every account's hash, was reachable by anyone with the public anon key and no login
at all, limited only by whatever RLS existed (unverifiable from this ZIP). On top of that, a
hardcoded admin account (`admin` / `admin@2025`, base64-"encoded" — not hashed) was created
automatically on every page load via `ensureAdminAccount()`, using the anon key.

Per your direction, this was treated as a verified application bug requiring the described
Supabase-Auth architecture, and the frontend was migrated accordingly (Supabase's `auth.users`
+ `get_auth_email_by_username` + `handle_new_auth_user` + `is_current_user_admin`, which your
own DB audit reports as already deployed). **No Supabase-side SQL was executed or modified** —
only `index.html` (and its supporting docs) changed. See "SCHEMA ASSUMPTIONS" below for what
still needs confirming against your live project before this goes out.

---

## WEBAPP MASTER AUDIT

### GREEN — confirmed working (static/logical verification; see test matrix for live confirmation)
- HTML/CSS structure: all `<div>` tags balanced (625/625), all 5 `<script>` blocks parse cleanly
  under Node's JS parser after every edit.
- `manifest.json` — valid JSON, standalone display, correct icon set, "Add Expense" shortcut.
- `sw.js` — network-first for navigation (avoids stale GitHub Pages deploys), cache-first for
  static assets, versioned cache name (bumped v7→v8 for this release), proper offline fallback.
- `resolveSupabaseUserId()` and all downstream sync functions (`syncCategories`,
  `syncCategoryBudgets`, `syncUserSettings`, `syncReminders`, Android transaction import, debts
  realtime) are keyed off the in-memory `CU` username and `public.users.id` — none of these
  depended on the old password-comparison mechanism, so the auth migration doesn't touch them.
- `doLogout()` now actually calls `sb.auth.signOut()` (previously only cleared a localStorage
  marker, leaving the real session — once one exists — live).
- Admin UI gating (`isAdmin` in `startApp()`/`renderManage()`) now reads only
  `profile.isAdmin` (sourced from `public.users.is_admin`), no longer OR'd with a username
  string match against a hardcoded `"admin"` constant.

### YELLOW — implemented but needs testing/verification (cannot be verified without live DB access)
- **Full login flow** (`doLogin` → `get_auth_email_by_username` RPC → `signInWithPassword` →
  profile fetch by `auth_user_id`). Logic is correct against the architecture your prompt
  described, but the RPC's exact parameter name and the profile table's exact
  `auth_user_id` column name were assumed, not confirmed — see SCHEMA ASSUMPTIONS. A defensive
  fallback in `resolveEmailForUsername()` tries both `p_username` and `username` as the RPC arg.
- **Signup flow** (`sb.auth.signUp()` + reliance on the `handle_new_auth_user` trigger to
  create the `public.users` row from `options.data`). If that trigger doesn't map
  `username`/`name`/`mobile` from `raw_user_meta_data` the way this assumes, new signups could
  end up with a profile row missing those fields until the post-signup `update()` call patches
  them in (which itself requires an immediate session — see next point).
- **Email confirmation setting is unknown.** If your Supabase project requires confirming email
  before issuing a session, `doSignup()` correctly detects `!signUpData.session` and shows a
  "confirm your email" message instead of silently failing — but this specific branch has not
  been exercised against a real project.
- **Password reset email deliverability and redirect URL.** `sendPasswordResetLink()` calls
  `resetPasswordForEmail(email, {redirectTo: window.location.origin + window.location.pathname})`
  — this is correct in principle (never hardcodes localhost) but Supabase will reject/strip a
  `redirectTo` that isn't on the project's Redirect URL allow-list. **You must add your actual
  deployed WebApp URL** in Supabase Dashboard → Authentication → URL Configuration before this
  works. Not something I can verify or set from here.
- **RLS enforcement on admin actions** (`toggleAdminRole`, `deleteUserAccount`, announcements,
  support messages). The client code is written assuming RLS + `is_current_user_admin()` is the
  real gate (correct pattern), and your DB audit reports these functions/policies exist — but
  this repo cannot re-verify the policy definitions themselves. Run item 5 of
  `supabase/005_SCHEMA_VERIFICATION_before_deploy.sql`.
- **Login-2FA ordering.** `verifyLogin2FA()` now runs after a real Supabase Auth session is
  already established (previously it ran after only a local hash check). Functionally
  equivalent UX, but worth a manual click-through to confirm the modal still opens/closes
  correctly at the right point and `cancel2FA()`'s new `signOut()` doesn't strand the UI.
- **Lock-screen re-entry** (`INIT`, `doUnlock`). Now gated on `sb.auth.getSession()` returning a
  real session before offering the lock screen at all; the actual unlock PIN check still uses
  the locally cached `password_hash` (see DUPLICATE/OBSOLETE below) — needs a live click-through
  across a token-expiry window to confirm the "stale local marker, no real session" fallback path
  triggers correctly.

### RED — broken (found and fixed during this audit)
- ~~`doChangePw()` only wrote the new password hash to the local cache~~ — the version found in
  this ZIP updated `public.users.password_hash` directly, which is now dead code from
  `doLogin()`'s perspective anyway since login no longer reads that column at all. Rewritten to
  go through `sb.auth.updateUser()` after re-verifying the old password via
  `signInWithPassword`.
- `isAdmin` gate at (formerly) two call sites accepted `CU === 'admin'` as suficient for
  showing the admin section, independent of the real `is_admin` DB flag — meaning any account
  literally named `admin` (which anyone could sign up as, before this fix, since usernames
  weren't reserved) got the admin UI shown regardless of actual privilege. Real data access was
  still gated by RLS either way, but this was a genuine client-side logic bug. Fixed.
- `ensureAdminAccount()` ran on every single page load for every visitor, attempting an INSERT
  into `public.users` with a hardcoded password hash, using the anon key. Removed entirely (see
  section 0).

### MISSING — not implemented
- No Supabase Edge Function for server-side login-2FA verification (see
  `SECURITY_TODO_B4_SERVER_SIDE_OTP.md` — documented as a known, lower-severity gap, not fixed
  in this pass; out of the stated scope of "authenticate via Supabase Auth").
- No account-deletion path that removes the linked `auth.users` row — `deleteUserAccount()` can
  only delete the `public.users` profile with the anon/authenticated key. A full fix needs a
  service-role-backed admin action (Edge Function), which this repo intentionally does not add
  since it would require exposing or wiring up the service-role key, an explicit non-goal here.

### DUPLICATE/OBSOLETE — should be consolidated
- `hashPassword()` / `verifyAndMigratePassword()` are no longer used for real authentication but
  are kept intentionally for the **local device lock-screen** re-entry check (`doUnlock`), which
  is a distinct, lower-stakes feature (re-confirming on an already-authenticated device, not
  logging in). This is a legitimate design choice, not leftover dead code — flagged here so a
  future cleanup pass doesn't mistake it for a login authority and doesn't delete it without
  replacing the lock-screen mechanism first.
- `public.users.password_hash` itself is now a legacy column: nothing in `index.html` reads or
  writes it anymore (the local device-lock cache is populated from it once at login for
  convenience, but that's a read of an already-legacy value, not a dependency). Whether to drop
  the column entirely is a Supabase-side decision outside this audit's scope (Supabase side is
  closed per your instructions) — flagging it as a candidate for a future migration, not doing
  it now.
- `EMAILJS_CONFIG.otpTemplateId` is now only used by the optional login-2FA email, not password
  reset (comment updated in `index.html` to reflect this — the template ID itself is unchanged,
  so no EmailJS dashboard action needed unless you want to rename it for clarity).

### SECURITY — risks
- **[Addressed this pass]** Client-side password comparison against `password_hash` — replaced
  with real Supabase Auth (`signInWithPassword`/`signUp`/`updateUser`/`resetPasswordForEmail`).
- **[Addressed this pass]** Hardcoded admin credential shipped in client source — removed.
- **[Addressed this pass]** Password-reset OTP checked and password written entirely client-side
  — replaced with Supabase's server-validated recovery-link flow.
- **[Remaining, documented]** Login-2FA OTP still checked client-side (post-authentication, lower
  severity — see MISSING section and `SECURITY_TODO_B4_SERVER_SIDE_OTP.md`).
- **[Remaining, needs your verification, cannot fix from this repo]** Whether RLS on
  `public.users` (and every other table) actually restricts what an authenticated
  non-admin/non-owner can read or write. This app's entire security model outside of the
  password itself now rests on RLS being correct — see
  `supabase/005_SCHEMA_VERIFICATION_before_deploy.sql`.
- **[Remaining, known, documented]** `deleteUserAccount()` can orphan an `auth.users` row (see
  MISSING). Not a data-exposure risk by itself, but worth knowing before relying on "delete" as
  a real account-removal guarantee.

### RELEASE BLOCKERS — must be fixed before deployment
1. **Run `supabase/005_SCHEMA_VERIFICATION_before_deploy.sql`** and confirm the `auth_user_id`
   column name, the `get_auth_email_by_username` RPC's parameter name, and that
   `handle_new_auth_user` actually populates `username`/`name`/`mobile` from signup metadata. If
   any of these differ from what `index.html` assumes, the specific call sites need a one-line
   fix each (all six `auth_user_id` references, and `resolveEmailForUsername()`'s two attempted
   parameter names, are easy to grep for).
2. **Add your actual deployed WebApp URL** to Supabase Dashboard → Authentication → URL
   Configuration → Redirect URLs, or password-reset links will fail to return users to a working
   page.
3. **Manually exercise the full test matrix below on the actual deployed WebApp** (not
   localhost) — this environment has no live Supabase connection or browser to do that from here.
