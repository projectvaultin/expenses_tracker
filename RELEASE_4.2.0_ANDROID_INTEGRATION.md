# Android + Web release integration — 4.2.0

## Scope
This release keeps the existing ProjectVault Expenses Tracker PWA, Android companion app and current Supabase project. The USB/standalone ProjectVault server is intentionally excluded.

## Current repository and build status
- The live PWA source of truth remains the `main` branch.
- The Android project currently exists on the owner's Windows machine; it is not present in this GitHub branch. Do not create a substitute Android project from the older backup.
- The owner reports a locally built release APK at version 1.0.1, package `com.projectvault.tracker`, size 1,952,641 bytes. The supplied PowerShell output confirms APK signature verification and SHA-256 certificate digest `79a6c62591edf42c7f409cda2cd5dc9a8c29fb832703e34a1ed5d10402fe9e25`.
- The actual APK binary and latest Android source archive have not yet been uploaded to this repository or this review session. Therefore no official GitHub release asset can be published yet.
- Android CI and signed-release workflows are intentionally not included until the current Android source is added at a confirmed repository path and its Gradle configuration is reviewed. This avoids workflows that silently skip because their expected `android/gradlew` path does not exist.
- Never commit `local.properties`, `keystore.properties`, signing keystores, passwords, Supabase service-role keys, or other secrets.

## PWA download behavior
- PWA installation and Android APK installation are separate user-confirmed operations.
- `android-download.html` provides the existing web-app install path and a separate Android section.
- `latest.json` remains in `preparing` state with an empty APK URL until a signed APK is actually published.
- The APK button is only displayed for a download URL under the official GitHub release download path.
- The service worker bypasses cache for `latest.json`, so release status is always fetched from the network. This avoids stale APK URLs or stale preparation status.
- Android sign-in uses the existing Supabase Auth-backed login UI. The download page never collects passwords.

## Integration risks that remain
1. Android login currently resolves username to email through the public SECURITY DEFINER RPC `get_auth_email_by_username_array`. The live project also exposes other email-lookup RPCs to anon. Do not revoke these grants until a replacement login flow is deployed to both clients.
2. Android transaction DTO uses UUID `user_id`, consistent with the previously inspected live `transactions.user_id` type. Historical SQL that assumes BIGINT is stale and must not be used as a migration specification.
3. Android accounts use a TEXT `user_id` linked to the Supabase Auth UUID; existing account policies are scoped to `auth.uid()`.
4. Android transaction push/pull and new-write sync have not been verified against the live customer database in this release pass. Historical customer records must not be bulk rewritten or deleted.
5. The supplied SQL archive contains historical/reference SQL, not a complete database backup. Do not replay it over the live database.

## Database safety
No Supabase schema, RLS policy, authentication record, or customer data was changed by this branch. Any future schema/auth changes require a read-only schema review first, an additive migration plan, and a rollback strategy.
