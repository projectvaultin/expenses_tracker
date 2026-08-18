# TEST MATRIX — ProjectVault Expenses Tracker

Honesty note up front: this environment has no live browser and no network access to your
Supabase project. Every row below is either (a) verified by static code tracing / syntax
validation, which I did do, or (b) marked **UNVERIFIED — manual test required**, which means I
traced the logic and believe it's correct but have not and cannot actually click through it.
Treat every UNVERIFIED row as not-yet-passed until you've run it yourself on the real deployed
URL.

| # | TEST | EXPECTED | ACTUAL (static trace) | STATUS | NOTES |
|---|------|----------|------------------------|--------|-------|
| 1 | Admin signup/account existence | Admin account exists, linked to Supabase Auth | Per your DB audit, admin already exists (`public.users.id=0`, linked) | GREEN | Bootstrap code that used to (re-)create it on every load was removed |
| 2 | Admin login | `signInWithPassword` succeeds, profile loads, `is_admin=true` | Logic traced correctly | UNVERIFIED | Needs live click-through |
| 3 | Normal user login | Same flow, `is_admin=false` | Logic traced correctly | UNVERIFIED | Needs live click-through |
| 4 | Wrong password | `signInWithPassword` returns "Invalid login credentials", UI shows "Wrong password." | Error message pattern-matched and mapped | UNVERIFIED | Confirm Supabase's exact error string still matches the regex used |
| 5 | Wrong username | RPC returns no email, UI shows "Username not found." | Logic traced correctly | UNVERIFIED | Needs live click-through |
| 6 | Logout | `sb.auth.signOut()` + local state cleared + realtime torn down | Fixed this pass — `signOut()` was previously never called | UNVERIFIED | Was RED, now fixed; needs confirmation |
| 7 | Refresh session | `INIT` checks `sb.auth.getSession()` before offering lock-screen | Rewritten this pass | UNVERIFIED | Was previously trusting local marker alone (RED); needs confirmation |
| 8 | Forgot password (send link) | `resetPasswordForEmail` sends email, generic response either way | Rewritten this pass, replaces OTP flow | UNVERIFIED | Requires Redirect URL allow-list to include the deployed URL — see Release Blocker #2 |
| 9 | Password recovery (click link) | `PASSWORD_RECOVERY` event fires, step-2 form opens | Listener added at client init | UNVERIFIED | Needs a real email round-trip to test |
| 10 | New password (submit) | `sb.auth.updateUser({password})` succeeds, then signs out | Rewritten this pass | UNVERIFIED | Needs live click-through |
| 11 | Profile read | Profile loads via `auth_user_id` after login | Logic traced correctly | UNVERIFIED | Depends on `auth_user_id` column name matching — see Release Blocker #1 |
| 12 | Profile update | Saves via existing `sb.from('users').update()` calls (unchanged by this migration) | Not modified this pass | UNVERIFIED | Was already GREEN per prior integration reports; not re-broken by this migration (no shared code path) |
| 13 | Category CRUD | Unchanged by this migration | Not modified this pass | UNVERIFIED | Depends only on `CU`/`public.users.id`, unaffected by auth mechanism change |
| 14 | Budget CRUD | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 15 | Expense CRUD | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 16 | Income | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 17 | Debt CRUD | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 18 | Reminder CRUD | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 19 | Settings | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 20 | Android/WebAPK transaction arrival | Unchanged | Not modified this pass | UNVERIFIED | Out of scope — Android app not in this repo |
| 21 | Realtime transaction update | Unchanged | Not modified this pass | UNVERIFIED | Not affected by auth mechanism change |
| 22 | Cross-user isolation | Depends entirely on RLS | Cannot verify without DB access | UNVERIFIED | See Release Blocker #1 and SECURITY section |
| 23 | Admin authorization | `is_current_user_admin()` gates writes; UI gate fixed this pass | ADMIN_USERNAME fallback removed (was RED) | UNVERIFIED | Fixed logic bug; RLS enforcement still needs confirming |
| 24 | Announcements | Unchanged | Not modified this pass | UNVERIFIED | Depends on RLS, same as #22 |
| 25 | App updates | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 26 | Support messages | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 27 | PWA install | `manifest.json` valid | Verified valid JSON, correct fields | GREEN | No changes needed |
| 28 | Service-worker update | Cache bumped v7→v8 | Verified in `sw.js` | GREEN | Ensures this release isn't served stale |
| 29 | Mobile layout | Unchanged by this migration | Not modified this pass | UNVERIFIED | No CSS/layout changes made |
| 30 | Desktop layout | Unchanged | Not modified this pass | UNVERIFIED | Same as above |
| 31 | Network failure handling | try/catch present around all new Supabase Auth calls | Verified in code | GREEN | Errors logged to console + shown as user-facing messages, not raw stack traces |
| 32 | Logout then another user login | `CU`/`_acctGeneration` reset, realtime torn down before next login | Unchanged logic, `signOut()` addition doesn't affect this | UNVERIFIED | Needs live click-through |
| 33 | Browser refresh after login | `INIT`'s `getSession()` check | Rewritten this pass | UNVERIFIED | Needs live click-through |
| 34 | Browser refresh after password recovery | Recovery session ends via explicit `signOut()` after reset completes | Implemented this pass | UNVERIFIED | Needs live click-through |
| 35 | No console errors | Static syntax check passed; runtime errors can't be ruled out without a browser | `node --check` clean on all 3 inline script blocks | UNVERIFIED | Static check only — open devtools console during manual testing |

## Why so many UNVERIFIED rows
This environment cannot open a browser, cannot reach `*.supabase.co` (network is restricted to
package registries), and has no test Supabase project to point at. Every row above that depends
on an actual network round-trip is honestly marked UNVERIFIED rather than guessed at as GREEN.
The rows that changed this pass (6, 7, 8, 9, 10, 23) are where I'd focus manual testing first —
they're both the most changed and the most security-relevant.
