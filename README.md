# Expenses Tracker — by ProjectVault

A Progressive Web App (PWA) for tracking expenses, income, debts, budgets, and recurring bills —
with cloud sync, live multi-device updates, and Android transaction auto-import.

[![Expenses Tracker icon](icon-192.png)](icon-192.png)

> **Note:** Earlier versions of this README described the app as "no backend, no signup servers"
> with data stored only in `localStorage`. That was accurate for the original build, but the app
> has since grown a real backend (Supabase). This README reflects the current architecture.

## Features

- 💰 Track income & expenses by category, with visual breakdowns
- 🧾 Debt tracker — money you owe and money owed to you, with partial repayments, interest, and
  installments
- 🎯 Monthly and per-category budget limits with progress tracking and rollover
- 🔁 Recurring bills **and** recurring income (e.g. salary), with reminders
- 📧 Automatic monthly email statements, weekly digests, and annual summaries
- 🔑 Email-based OTP password recovery, optional email-based two-factor login
- 📲 Installable as a native-feeling app on Android/iOS/desktop (PWA), with offline shell support
- ☁️ **Cloud sync via Supabase** — your account, transactions, debts, categories, and settings are
  backed up to a Supabase project and sync live across devices/tabs
- 📱 **Android transaction auto-import** — a companion Android notification-listener app can insert
  transactions (from PhonePe/GPay/Paytm notifications) directly into Supabase; the web app picks
  these up automatically and in real time
- 🔒 Local biometric/device login support (device-level, in addition to account password)
- 🌙 Light, dark, and high-contrast themes; mobile-first UI
- 🎉 Animated celebrations for cleared debts, budget wins, and savings milestones

## Architecture

This is still a **single-page, no-build-step web app** — one `index.html` with inline CSS/JS — but
it is no longer a purely local, backend-free app. Current architecture:

### Frontend
Plain HTML, CSS, and JavaScript. No framework, no bundler, no build step. `index.html` contains
the entire UI and application logic.

### Local storage
The browser's `localStorage` is still used as the primary, fast, offline-available store for the
signed-in user's data (transactions, debts, categories, budgets, settings, session). The app reads
and renders from `localStorage` first; Supabase acts as a sync/backup layer on top of it, not a
replacement for it.

### Supabase (backend)
The app connects to a Supabase project (Postgres + REST + Realtime + a public anon API key
embedded in the client, which is normal for Supabase's client-side model) and uses these tables:

| Table | Purpose |
|---|---|
| `users` | Accounts — username, name, email, mobile, password hash, admin flag, 2FA flag |
| `transactions` | Income/expense entries, including ones auto-imported from the Android app |
| `debts` | Money borrowed/given, repayments, interest, installments |
| `categories` | Per-user custom categories |
| `category_budgets` | Per-category monthly budget limits |
| `user_settings` | Theme, text size, and other per-user appearance settings |
| `reminders` | Recurring bill/income reminders |
| `support_messages` | User-submitted support tickets and admin replies |
| `announcements` / `app_updates` | Admin-broadcast banners and "what's new" notices |

### Authentication model
Authentication is **Supabase Auth**, not a custom scheme. On signup/login, the app:

1. Resolves the entered username to its account email via the `get_auth_email_by_username`
   RPC (the only thing allowed to see that mapping from the anon key's perspective).
2. Calls `sb.auth.signInWithPassword({email, password})` — Supabase verifies the password
   server-side; this app never sees, hashes, or compares a password itself.
3. Loads the matching `public.users` profile row via `auth_user_id`, and stores a local
   session marker (`exp_session`) for a fast lock-screen-style re-entry — but only after
   confirming a real Supabase session backs it (see `INIT` in `index.html`).

Signup uses `sb.auth.signUp()`; the corresponding `public.users` row is created server-side by
a `handle_new_auth_user` trigger. Password changes and password reset (forgot password) go
through `sb.auth.updateUser()` and `sb.auth.resetPasswordForEmail()` respectively — the latter
sends a real Supabase recovery link rather than an in-app OTP.

Optional email-based two-factor login (`require2FA`) sends a one-time code via EmailJS **after**
the password has already been verified by Supabase Auth — it's an extra app-level step on an
already-authenticated session, not a replacement for real authentication. See
`SECURITY_TODO_B4_SERVER_SIDE_OTP.md` for why that ordering matters and what's still left to
harden there.

A legacy `password_hash` column may still exist on `public.users` from an earlier version of
this app; it is not read or written anywhere in `index.html` anymore.

### EmailJS
Outbound email that isn't handled by Supabase Auth itself — monthly statements, weekly digests,
annual summaries, and the optional login-2FA code — is sent **client-side** via
[EmailJS](https://www.emailjs.com), configured through the `EMAILJS_CONFIG` block near the top
of `index.html`'s script. Password-reset email is sent by Supabase Auth directly
(`resetPasswordForEmail`), not EmailJS. See `EMAILJS_SETUP.md` for setup steps. Without valid
EmailJS credentials, statement/2FA sending is skipped gracefully rather than erroring.

### Android sync
A separate Android notification-listener companion app (not part of this repo) reads UPI payment
notifications (PhonePe, Google Pay, Paytm) and inserts corresponding rows into the Supabase
`transactions` table. This web app:
- Pulls in any not-yet-seen rows on login (`syncAndroidTransactions`)
- Subscribes to Supabase Realtime (`postgres_changes` on `transactions`, filtered by user) so new
  Android-imported transactions appear in the web app live, without a page reload
- Tags every imported entry with `supaId` so re-syncing never creates duplicates

### Realtime
Beyond Android transaction imports, debts also sync live via Supabase Realtime
(`subscribeDebtsRealtime`) — inserts, updates (repayments/clearing), and deletes made on one
device or by another process reflect in the app within the same session.

### PWA
- `manifest.json` — installable app metadata (name, icons, theme, start URL, an "Add Expense"
  shortcut)
- `sw.js` — service worker: network-first for navigation/HTML (so GitHub Pages deploys aren't
  stuck behind stale cache), cache-first for static assets, versioned cache name, offline fallback
  to the cached shell
- **Multi-tab sync**: opening the app in multiple tabs now keeps them in sync — edits, Android/
  Realtime-driven updates, and logging out in one tab are reflected in every other open tab for
  the same account (via the browser's native `storage` event)

Note: because core functionality (login, saving new data to the cloud, sending email) depends on
Supabase and EmailJS, "offline-first" today means the app **shell** loads and previously-cached
data is viewable offline — not that every feature works with no connection.

### Deployment
Works on any static host — GitHub Pages, Netlify, Vercel, etc. Push the repo and point the host at
the root folder; no build step required. On GitHub Pages (project pages, i.e.
`username.github.io/repo-name/`), the relative paths used throughout (`./index.html`, `./manifest.json`,
icons) work correctly out of the box.

## Getting started

1. Clone this repo
2. Open `index.html` directly in a browser, **or** serve it locally:
   ```
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000`
3. Point the app at your own Supabase project by editing `SUPABASE_URL` and `SUPABASE_KEY` near
   the end of `index.html`'s script section, and set up the tables listed above.
4. To enable real email delivery (statements, OTP, 2FA), follow **EMAILJS_SETUP.md**
   (~5 minutes, free tier available).

## Project structure

```
index.html            Main app (markup, styles, and all application logic)
manifest.json          PWA manifest (name, icons, theme, install shortcuts)
sw.js                  Service worker (offline caching, install support)
icon-192.png            App icon (192×192)
icon-512.png            App icon (512×512)
brand-logo.png          ProjectVault wordmark, used on auth/lock/splash screens
EMAILJS_SETUP.md        How to enable real email sending
GITHUB_MIGRATION.md     Notes on repo/account migration
supabase/005_SCHEMA_VERIFICATION_before_deploy.sql   Read-only checks to run before deploying the Supabase Auth migration
```

## Important security limitations

This app's current security model has real limitations that anyone deploying or forking it should
understand before relying on it for sensitive data:

- **RLS is still the actual enforcement boundary.** Supabase Auth now handles password
  verification, but every table read/write (transactions, debts, admin actions like granting
  admin or deleting accounts) still goes through the anon/authenticated client key from the
  browser. This is safe **only if Supabase Row Level Security (RLS) policies** correctly restrict
  what each authenticated user can read/write on every table — this cannot be verified from the
  client code alone. Run `supabase/005_SCHEMA_VERIFICATION_before_deploy.sql` and review the RLS
  policies directly in the Supabase dashboard before deploying.
- **Admin-role changes rely on RLS, not the UI.** `toggleAdminRole()` sends an UPDATE to
  `users.is_admin` from an ordinary authenticated client; the app has no way to stop a technically
  inclined non-admin user from sending the same request directly unless RLS (via
  `is_current_user_admin()`) blocks it. Verify this policy exists — see item 5 in the schema
  verification script.
- **Login-2FA (`require2FA`) is still a client-side check.** It runs after real password
  verification, so it's a weaker exposure than the old password-reset flow was, but it can still
  be skipped by a devtools user who already has an authenticated session (e.g. an unlocked
  device). See `SECURITY_TODO_B4_SERVER_SIDE_OTP.md` for what a real fix looks like.
- **Deleting a user only removes their `public.users` profile row**, not the underlying
  `auth.users` account — the anon/authenticated client key cannot call Supabase's Admin API. The
  person is effectively locked out of the app (profile lookup fails on next login) but the
  `auth.users` row itself becomes orphaned. A full fix needs a service-role-backed admin action
  (Edge Function or the Supabase dashboard), not something this static app can do on its own.
- **EmailJS keys are public by design.** EmailJS's public key model expects the key to be exposed
  in client code; the real access control lives in EmailJS's own service/template configuration
  and rate limits, not in keeping the key secret. EmailJS is no longer involved in
  password-reset delivery — only statements/digests and the optional login-2FA code.

None of this is unusual for a serverless/anon-key architecture, but the RLS points above are load-
bearing: verify them directly against your live Supabase project before treating this as
production-ready.

## Known limitations

- Monthly/weekly/annual email summaries are checked and sent the next time the app is opened after
  the period ends, not at the exact moment it ends (there's no server-side scheduler).
- SMS OTP isn't supported (would need a paid SMS gateway + backend); password recovery uses email
  OTP only.
- The Android auto-import companion app is a separate project, not included in this repository.

## License

MIT — see [LICENSE](LICENSE).
