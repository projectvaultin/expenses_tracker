# Setting up real email delivery (EmailJS) — ~5 minutes

ProjectVault is a serverless app (no backend), so it uses **EmailJS** to send real emails
straight from the browser using your own email account. It's free for up to 200 emails/month.

Until you complete this, the app still works — OTPs and statements just get shown on-screen
instead of emailed (with an on-screen warning), so nothing breaks.

## 1. Create an EmailJS account
Go to https://www.emailjs.com → Sign Up (free plan is fine).

## 2. Connect an email service
- Dashboard → **Email Services** → **Add New Service**
- Choose **Gmail** (or Outlook, etc.) and connect your account
- Copy the **Service ID** (looks like `service_xxxxxxx`)

## 3. Create two email templates
Dashboard → **Email Templates** → **Create New Template**, twice:

### Template A — OTP (password reset)
Subject: `Your ProjectVault OTP`
Body (use these exact variable names so the app's data lines up):
```
Hi {{to_name}},

Your one-time password to reset your ProjectVault account ({{username}}) is:

{{otp_code}}

If you didn't request this, you can ignore this email.

— {{app_name}}
```
Copy this template's **Template ID** (e.g. `template_otp123`).

### Template B — Monthly Statement
Subject: `Your ProjectVault statement — {{month}} {{year}}`
Body:
```
Hi {{to_name}},

Here's your ProjectVault summary for {{month}} {{year}}:

Registered mobile: {{mobile}}
Total income: {{total_income}}
Total expenses: {{total_expense}}
Average daily spend this month: {{avg_daily_spend}}

Year-to-date ({{year}}):
Total expenses: {{year_total_expense}}
Average monthly spend: {{year_avg_monthly_spend}}

— {{app_name}}
```
Copy this template's **Template ID** (e.g. `template_statement456`).

## 4. Get your Public Key
Dashboard → **Account** → **General** → copy the **Public Key**.

## 5. Paste your 4 values into the app
Open `index.html`, find this block near the top of the `<script>` section:

```js
const EMAILJS_CONFIG={
  publicKey:'YOUR_PUBLIC_KEY',
  serviceId:'YOUR_SERVICE_ID',
  otpTemplateId:'YOUR_OTP_TEMPLATE_ID',
  statementTemplateId:'YOUR_STATEMENT_TEMPLATE_ID'
};
```
Replace the four placeholder strings with your real values, save, and re-deploy.

## 6. Test it
Log in → **Manage** tab → **"Send Last Month's Statement Now"** button. If it says
"📧 Statement emailed to..." you're done. If it warns "EmailJS not configured", double-check
the 4 values above.

---

## Important limitations to know

- **No true "at midnight on month-end" auto-send.** This is a static, serverless app — there's
  no server running around the clock. The app checks "has this month's statement been sent yet?"
  each time a user logs in, and sends it then if not. For a truly server-triggered send (fires even
  if the user never opens the app that day), you'd need a small backend/cron job (e.g. a scheduled
  Cloud Function or a cheap VPS) — happy to help build that separately if you want it.
- **SMS OTP is not implemented** — real SMS delivery needs a paid gateway (Twilio, MSG91, etc.)
  called from a secure backend, since any API key embedded in client-side code is publicly visible.
  Per your choice, mobile number is stored for record-keeping only; all OTPs go by email.
- EmailJS's free tier caps at 200 emails/month total across all users — fine for personal/small use,
  upgrade if this app grows.
