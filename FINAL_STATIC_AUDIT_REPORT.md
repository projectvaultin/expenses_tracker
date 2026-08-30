# ProjectVault Final Audit — Supplied GITHUB_MIGRATION Package

Date: 2026-08-30

## Scope actually available

This ZIP contained a web application package only. It did NOT contain:
- Android source/APK
- Supabase SQL/migrations
- Supabase schema export
- Edge Functions
- package.json/build configuration
- a Git repository history/.git directory

Therefore this audit verifies the supplied web files and static integration only. Live
Supabase RLS/auth/realtime state and Android notification parsing cannot honestly be marked
as verified from this package.

## Verified

- `index.html` JavaScript syntax: all 4 executable inline script blocks passed `node --check`.
- Supabase client uses the publishable/anon key; no `service_role`, private-key, or obvious
  secret-key marker was found.
- Supabase Auth is used for password authentication and password recovery.
- `ensureAdminAccount()` and hardcoded admin password bootstrap code are not executable;
  only explanatory comments remain.
- Login resolves username through `get_auth_email_by_username()` and then uses
  `signInWithPassword()`.
- Logout explicitly calls `sb.auth.signOut()` and tears down realtime subscriptions.
- Realtime code contains account-generation/current-user guards.
- Password reset uses `resetPasswordForEmail()` and `updateUser()`, rather than writing
  `password_hash` from browser JavaScript.
- PWA service worker registration points to `sw.js`.

## Fixed in this release package

1. Renamed `index (5).html` -> `index.html`.
   The README and service worker already expect `index.html`; the previous filename could
   cause a 404 on static deployments.

2. Replaced missing `icon-192.svg` references with the supplied `icon-192.png`.

3. Replaced missing `brand-logo.svg` references with the supplied `brand-logo.png`.

4. Updated `manifest.json` to use the supplied PNG icons and added the 512px icon.

5. Renamed `_gitignore.txt` -> `.gitignore`, so Git actually recognizes the ignore rules.

6. Removed the unused `service-worker.js`, which referenced missing SVG assets and was not
   registered by the application. The active service worker is `sw.js`.

7. Updated the README's stale `index (4).html` filename reference.

## Remaining release blockers

### BLOCKER 1 — Live Supabase schema/RLS is not verified

The package contains no `/supabase/` SQL/migration files. The application depends on tables,
columns, RPCs and policies including (among others) `users`, `transactions`, `debts`,
`support_messages`, authentication linkage through `auth_user_id`, and
`get_auth_email_by_username()`.

The application cannot be declared production-secure until the live Supabase project is
checked for:
- exact columns/types/constraints
- `auth_user_id` linkage
- RPC signature and security
- SELECT/INSERT/UPDATE/DELETE RLS policies
- admin authorization function/policy
- realtime publication configuration
- storage policies for `pv-media`
- password-recovery redirect allow-list

### BLOCKER 2 — Android side is absent

The audit prompt requires verification of:
Android notification listener -> transaction parsing -> Supabase insert -> web consumption.
No Android source/APK is present in this ZIP, so PhonePe/GPay/Paytm parsing and the Android
write contract remain unverified.

### BLOCKER 3 — Client-side login 2FA remains

`require2FA` is still implemented as an application-level client-side OTP step. The password
itself is authenticated by Supabase Auth, but the extra OTP check can be bypassed by a user
who already has the authenticated browser session. A proper server-side Edge Function is
required if this extra factor is intended to be a security boundary.

### BLOCKER 4 — Mobile-number password reset lookup needs backend/RLS verification

The browser currently resolves a mobile number through a `users.email` lookup before calling
Supabase Auth recovery. This must be verified against the live RLS policy and should ideally
be implemented through a tightly controlled server-side/RPC path that does not expose email
addresses to anonymous clients.

### KNOWN CODE-QUALITY ISSUE — dead admin message function

`sendAdminMessage()` references `admin-msg-inp`, but the supplied markup uses the newer
support-ticket UI (`support-message`, `support-subject`, etc.) and no `admin-msg-inp` element
exists. The function is not referenced by a current button, so it is not currently on the
main user flow. It should be removed or deliberately migrated if that legacy admin-message
flow is still required.

### KNOWN HTML ISSUE — duplicate IDs

The supplied HTML contains duplicate IDs:
- `receipt-add-btn`
- `receipt-file`
- `profile-av-ph`

These should be deduplicated before claiming perfect HTML validity. They were not blindly
renamed here because the correct ownership of each duplicate needs functional confirmation.

## Final assessment

The supplied web package is materially cleaner and safer than a simple source dump, and the
release-path/asset problems found in the package have been corrected. However, it would be
incorrect to label the entire ProjectVault system "100% production verified" yet.

The next verification stage must use the actual Supabase project and the Android source/APK.
