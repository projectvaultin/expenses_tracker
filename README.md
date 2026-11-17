# ProjectVault Expenses Tracker

This is the existing ProjectVault Expenses Tracker application, upgraded in place. It remains a static single-page web app hosted from this repository and uses the existing Supabase project configured in `index.html`.

## Release 4.1.0 candidate

- Existing single application and route model retained.
- Supabase Auth client and existing Supabase table/API calls retained.
- No database migrations, table drops, data deletes, or Supabase writes are part of this GitHub release.
- PWA manifest icon paths corrected to the PNG assets already present in the repository.
- Service-worker cache version incremented and caching narrowed to same-origin static resources. Supabase API/auth/storage traffic is never cached.
- Static release smoke tests added.

## Deploy

GitHub Pages can serve this repository as a static site. Do not replace or recreate the Supabase project. Publish by merging the reviewed release branch into `main` after the existing GitHub Pages workflow/configuration is confirmed.

## Important existing architecture

The current app is a hybrid client:
- Supabase Auth is used for account authentication.
- Several tables (including Android transactions, debts and profile-related features) have explicit Supabase read/write/sync operations.
- Some app state and user-facing records also use per-user browser `localStorage`.

This update does not silently migrate local records or change their cloud ownership. Full local/cloud reconciliation requires a separate, schema-verified compatibility pass and should not be done using destructive SQL.

## Manual release validation

1. Open the deployed site in a fresh browser profile and confirm the manifest loads.
2. Confirm both icon paths return HTTP 200.
3. Confirm the service worker activates with cache `projectvault-expenses-cache-v11`.
4. Sign in with an existing test account; check dashboard, add/edit/delete transaction, debts, history, settings, profile and logout.
5. Confirm Supabase Auth session and existing data still load.
6. Confirm network requests to the Supabase hostname are not served from Cache Storage.
7. Test offline shell fallback and online revalidation.
8. Test Android Chrome install/update and an existing installed PWA after refreshing site data.

Do not treat this candidate as production-certified until the real hosted app and actual Supabase session/RLS flows have been exercised.
