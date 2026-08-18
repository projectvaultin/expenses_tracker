# B4 — Server-side OTP verification

## Status: PASSWORD RESET — FIXED. LOGIN 2FA — STILL CLIENT-SIDE (lower severity, documented below).

This originally covered two separate features that both used to run entirely in
browser JavaScript: the "forgot password" flow, and the optional "require2FA"
extra step during login. They've diverged as of the Supabase Auth migration —
see the audit report for the full change list.

## Forgot-password — fixed

`doLogin()`/`sendForgotOTP()`/`verifyForgotOTP()` used to compare a 6-digit code
against a JS variable, then write the new `password_hash` directly from the
browser as soon as that comparison passed. Anyone with devtools access could
call the same Supabase update directly and skip the OTP check entirely — the
original problem this document described.

This is now replaced with Supabase Auth's own recovery flow:
`sb.auth.resetPasswordForEmail()` sends the email and issues a server-signed
recovery token; `sb.auth.updateUser({password})` performs the actual write,
and only succeeds if Supabase has already validated that token server-side.
No OTP code, and no password, is ever compared or written in this app's own
JavaScript anymore for this flow. See `sendPasswordResetLink()` and
`completePasswordReset()` in `index.html`.

**Before relying on this in production**, confirm in the Supabase Dashboard
(Authentication -> URL Configuration -> Redirect URLs) that your actual deployed
WebApp URL is on the allow-list — `resetPasswordForEmail`'s `redirectTo` is
rejected/stripped otherwise. See `supabase/005_SCHEMA_VERIFICATION_before_deploy.sql`
item 7.

## Login 2FA (`require2FA`) — still client-side, and that's a smaller problem now

`verifyLogin2FA()` still compares a 6-digit code against a JS variable before
calling `startApp()`. This is unchanged from before. The reason it's lower
severity than the old password-reset gap: by the point this check runs, the
password itself has *already* been verified server-side by
`sb.auth.signInWithPassword()` — a live, real Supabase Auth session already
exists. Someone who bypasses this specific check via devtools has already
proven they know the account's real password; they aren't bypassing
authentication, only an extra app-level speed bump on top of it. It's still
worth closing properly (a stolen/unlocked device with an already-open browser
tab could skip it), but it is no longer an authentication bypass the way the
password-reset gap was.

**If you want this closed too**, the correct fix is the same shape as before:
move OTP generation/verification into a Supabase Edge Function (using the
service-role key server-side) that the client calls, rather than generating
and comparing the code in browser JS. Rate-limit the function per-account to
prevent OTP brute force, and never ship the service-role key to the browser.
