# Final automation setup

The package contains a server-side automation Edge Function and an hourly GitHub Actions scheduler.

Required GitHub secrets before true closed-app automation runs:
- `SUPABASE_FUNCTION_URL` = the deployed `projectvault-automation` function URL
- `PROJECTVAULT_AUTOMATION_SECRET` = a random secret shared by the workflow and Edge Function

For true AI-generated copy/images, add a server-side AI provider key and implement the provider call in the Edge Function. Never put an AI API key in `index.html`.

For true instant Android push, connect Firebase/FCM credentials to the Android project. The current Android package retains a background polling fallback.

For exact monthly email while the app is closed, configure an email provider (e.g. Resend/SMTP) server-side and invoke it from the same scheduled function. The database already has `pv_statement_receipts` to enforce one statement per user/month.
