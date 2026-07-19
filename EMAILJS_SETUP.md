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
Dashboard → **Email Templates** → **Create New Template**, twice.

For each one, switch the body editor from **Design Editor** to **Code Editor** (a `</>` icon
near the top of the editor) and paste the raw HTML below instead of typing plain text. This
gives you a real branded email — logo, dark card, colored numbers — instead of plain text.
The app now automatically sends a `{{logo_url}}` variable (an absolute link to `icon-512.png`
on wherever you've deployed the app), so the logo will appear once you've deployed it (e.g. to
GitHub Pages); it won't resolve while you're just opening `index.html` from your own computer.

### Template A — OTP (password reset)
Subject: `Your {{app_name}} OTP`
Body (Code Editor — HTML):
```html
<div style="background:#0f1117;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:420px;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="text-align:center;padding-bottom:20px;">
        <img src="{{logo_url}}" width="56" height="56" alt="{{app_name}}" style="border-radius:14px;display:inline-block;">
        <div style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#f0f0f5;margin-top:10px;">
          {{app_name}}
        </div>
      </td>
    </tr>
    <tr>
      <td style="background:#1a1d27;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px 24px;">
        <p style="color:#f0f0f5;font-size:15px;margin:0 0 14px;">Hi {{to_name}},</p>
        <p style="color:#a7a9bd;font-size:14px;line-height:1.6;margin:0 0 18px;">
          Your one-time password to reset your <b style="color:#f0f0f5;">{{app_name}}</b> account
          (<b style="color:#f0f0f5;">{{username}}</b>) is:
        </p>
        <div style="background:#22263a;border:1px solid rgba(108,99,255,.4);border-radius:14px;padding:16px 8px;text-align:center;margin-bottom:18px;">
          <span style="font-family:Georgia,serif;font-size:28px;font-weight:bold;letter-spacing:4px;color:#6c63ff;">{{otp_code}}</span>
        </div>
        <p style="color:#7a7d99;font-size:12px;line-height:1.6;margin:0;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding-top:18px;">
        <span style="color:#7a7d99;font-size:11px;">— {{app_name}}</span><br><span style="color:#4a4d66;font-size:10px;">Powered by {{brand_name}}</span>
      </td>
    </tr>
  </table>
</div>
```
Copy this template's **Template ID** (e.g. `template_otp123`).

### Template B — Monthly Statement
Subject: `Your {{app_name}} statement — {{month}} {{year}}`
Body (Code Editor — HTML):
```html
<div style="background:#0f1117;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:460px;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="text-align:center;padding-bottom:20px;">
        <img src="{{logo_url}}" width="56" height="56" alt="{{app_name}}" style="border-radius:14px;display:inline-block;">
        <div style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#f0f0f5;margin-top:10px;">
          {{app_name}}
        </div>
      </td>
    </tr>
    <tr>
      <td style="background:#1a1d27;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px 24px;">
        <p style="color:#f0f0f5;font-size:15px;margin:0 0 4px;">Hi {{to_name}},</p>
        <p style="color:#7a7d99;font-size:13px;margin:0 0 20px;">Here's your summary for {{month}} {{year}}.</p>

        <table role="presentation" width="100%" style="border-collapse:collapse;table-layout:fixed;margin-bottom:18px;">
          <tr>
            <td width="50%" style="padding:0 4px 0 0;">
              <div style="background:#22263a;border-radius:14px;padding:14px;">
                <div style="color:#7a7d99;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Income</div>
                <div style="color:#00d084;font-family:Georgia,serif;font-size:20px;font-weight:bold;">{{total_income}}</div>
              </div>
            </td>
            <td width="50%" style="padding:0 0 0 4px;">
              <div style="background:#22263a;border-radius:14px;padding:14px;">
                <div style="color:#7a7d99;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Expenses</div>
                <div style="color:#ff6584;font-family:Georgia,serif;font-size:20px;font-weight:bold;">{{total_expense}}</div>
              </div>
            </td>
          </tr>
        </table>

        <div style="background:rgba(108,99,255,.12);border:1px solid rgba(108,99,255,.3);border-radius:14px;padding:12px 14px;margin-bottom:18px;text-align:center;">
          <div style="color:#7a7d99;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Remaining</div>
          <div style="color:#6c63ff;font-family:Georgia,serif;font-size:22px;font-weight:bold;">{{remaining_balance}}</div>
        </div>

        <p style="color:#a7a9bd;font-size:13px;line-height:1.9;margin:0 0 18px;">
          Registered mobile: <b style="color:#f0f0f5;">{{mobile}}</b><br>
          Average daily spend this month: <b style="color:#f0f0f5;">{{avg_daily_spend}}</b>
        </p>

        <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:16px;">
          <div style="color:#7a7d99;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Year-to-date ({{year}})</div>
          <p style="color:#a7a9bd;font-size:13px;line-height:1.9;margin:0;">
            Total expenses: <b style="color:#f0f0f5;">{{year_total_expense}}</b><br>
            Average monthly spend: <b style="color:#f0f0f5;">{{year_avg_monthly_spend}}</b>
          </p>
        </div>

        <div style="background:#22263a;border-radius:12px;padding:12px 14px;margin-top:18px;">
          <p style="color:#a7a9bd;font-size:11px;line-height:1.6;margin:0;">
            💡 <b style="color:#f0f0f5;">Tip:</b> This app stores your data only on your device — if you
            ever uninstall it, that data is gone for good. Open the app → menu (☰) → Manage Account →
            Export &amp; Data to download a backup regularly, and Import it back any time you reinstall.
          </p>
        </div>
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding-top:18px;">
        <span style="color:#7a7d99;font-size:11px;">— {{app_name}}</span><br><span style="color:#4a4d66;font-size:10px;">Powered by {{brand_name}}</span>
      </td>
    </tr>
  </table>
</div>
```
Copy this template's **Template ID** (e.g. `template_statement456`).

**Added:** the statement template now includes a reminder at the bottom to export/backup your
data regularly, since this app stores data only on your device with no cloud copy.

**Added:** a "Remaining" figure (income minus expenses) now shows between the Income/Expenses
boxes and the rest of the email — Income and Expenses themselves are unchanged. Re-paste Template
B if you already had a previous version in.

**Fixed:** the statement template previously caused horizontal scrolling on narrow/mobile
previews — the two income/expense boxes had both `width:50%` and their own padding on the same
cell, which in HTML email rendering means the padding adds on top of that 50%, overflowing past
100% combined. Fixed by moving the padding to an inner `<div>` instead of the table cell itself.
If you already pasted the old version in, re-copy and re-paste the Template B code below.

## 4. Get your Public Key
Dashboard → **Account** → **General** → copy the **Public Key**.

## 5. Paste your values into the app
Open `index.html`, find this block near the top of the `<script>` section:

```js
const EMAILJS_CONFIG={
  publicKey:'YOUR_PUBLIC_KEY',
  serviceId:'YOUR_SERVICE_ID',
  otpTemplateId:'YOUR_OTP_TEMPLATE_ID',
  statementTemplateId:'YOUR_STATEMENT_TEMPLATE_ID'
};
```
Replace the placeholder strings with your real values, save, and re-deploy.

Note: only two templates (OTP + statement) are used, which fits EmailJS's free-plan
limit of 2 templates. A separate "welcome email" template is intentionally not used,
since adding a 3rd template requires a paid EmailJS plan.

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
