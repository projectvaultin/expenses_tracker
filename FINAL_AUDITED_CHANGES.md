# ProjectVault WebApp Final Audited Changes

Date: 2026-08-17

## Changes

1. Removed the remaining login-time assignment from `public.users.password_hash` into localStorage.
2. Removed obsolete browser-side password hashing/comparison helpers used by the local lock screen.
3. Lock-screen password verification now uses Supabase Auth `signInWithPassword`.
4. Changed `resolveSupabaseUserId()` to return the authenticated Supabase Auth UUID via `sb.auth.getUser()`.
5. Changed profile update ownership lookup from the legacy profile `id` to `auth_user_id`.
6. No Supabase SQL, RLS, or schema changes were made.

## Verification

- `verifyAndMigratePassword` and `hashPassword` are no longer present in executable WebApp code.
- `user.password_hash` is no longer read during login.
- JavaScript syntax was rechecked after the modifications.
- Production password recovery remains based on Supabase Auth.

## Remaining required tests

A live production deployment/authentication/recovery/realtime test and live GitHub comparison remain required before the project can be declared Production Ready.
