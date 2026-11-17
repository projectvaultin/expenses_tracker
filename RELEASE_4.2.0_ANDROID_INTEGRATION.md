# Android + Web release integration — 4.2.0

## Scope
This release keeps the existing ProjectVault Expenses Tracker web app, Android companion app and current Supabase project. The USB/standalone ProjectVault server is intentionally excluded.

## Backup findings
- Android source backup: Phase 1–15 project; Room, notification listener, payment parsers, WorkManager queue, Supabase transaction push/pull, account sync and username/password login UI are present.
- Web app backup dated 2026-09-05 is older than the current GitHub main branch. The current main branch (4.1.0) remains the web source of truth.
- The SQL archive contains historical/reference SQL, not a complete database dump. Do not replay it over the live database.
- Android backup includes a machine-specific local.properties file; it must not be committed. No signing keystore/password is supplied.

## Current integration risks
1. Android login currently resolves username to email through the public SECURITY DEFINER RPC get_auth_email_by_username_array. The live project also exposes other email-lookup RPCs to anon. Do not revoke these grants until a replacement login flow is deployed to both clients.
2. Android transaction DTO uses UUID user_id and the live transactions.user_id is UUID. The supplied audit SQL's BIGINT check is stale and must not be used as a migration specification.
3. Android accounts use a TEXT user_id linked to the Supabase Auth UUID; existing accounts policies are scoped to auth.uid().
4. The current Android build uses compileSdk 36, AGP 8.9.1, Kotlin 2.0.21, Gradle 8.11.1 and versionName 1.0.1. Build must be verified on CI; local build was blocked because this environment cannot resolve services.gradle.org and has no Android SDK.
5. No signed APK can be published until the owner configures a persistent Android signing keystore and the four GitHub Actions secrets. Never upload the keystore or passwords to chat/GitHub.

## Release download behavior
- PWA install and Android APK installation are separate user-confirmed operations.
- The web app links to android-download.html.
- latest.json remains in preparing state until a signed APK is actually published. The page will only display the APK download button for a URL under the official GitHub release download path.
- Android sign-in uses the existing Supabase Auth-backed login UI. Passwords are never collected by the download page.

## Database safety
No database schema or user data was changed by this release branch. The production schema and RLS policies need a coordinated auth/RLS migration after the Edge Function login replacement is implemented and both clients are updated.
