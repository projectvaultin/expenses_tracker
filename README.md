# ProjectVault — All-in-One Expense Tracker

A fast, offline-first Progressive Web App (PWA) for tracking expenses, income, debts, budgets,
and recurring bills. No backend, no signup servers — everything runs in your browser and data
stays on your device.

![ProjectVault icon](icon-192.png)

## Features
- 💰 Track income & expenses by category, with visual breakdowns
- 🧾 Debt tracker — money you owe and money owed to you, with partial repayments
- 🎯 Monthly budget limits with progress tracking
- 🔁 Recurring bill reminders
- 📧 Automatic monthly email statements (income, expenses, daily/monthly averages)
- 🔑 Email-based OTP password recovery (find account by mobile number or email)
- 📲 Installable as a native-feeling app on Android/iOS/desktop (PWA)
- 🔒 Local biometric/device login support
- 🌙 Dark, mobile-first UI

## Tech stack
Plain HTML, CSS, and JavaScript — no framework, no build step. Data is stored in the browser's
`localStorage`. Emails (statements + OTP) are sent client-side via [EmailJS](https://www.emailjs.com).

## Getting started
1. Clone this repo
2. Open `index.html` directly in a browser, **or** serve it locally:
   ```bash
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000`
3. To enable real email delivery (monthly statements + OTP), follow **[EMAILJS_SETUP.md](EMAILJS_SETUP.md)**
   (~5 minutes, free tier available).

## Deploying
Works great on any static host — GitHub Pages, Netlify, Vercel, etc. Just push the repo and
point the host at the root folder; no build step required.

## Project structure
```
index.html         Main app (markup, styles, and logic)
manifest.json       PWA manifest (name, icons, theme)
sw.js               Service worker (offline caching)
icon-192.png         App icon (192×192)
icon-512.png         App icon (512×512)
EMAILJS_SETUP.md     How to enable real email sending
GITHUB_MIGRATION.md  Notes on repo/account migration
```

## Known limitations
- This is a client-only app — there's no server, so monthly statements are checked/sent the next
  time the app is opened after month-end, not at the exact moment the month ends.
- SMS OTP isn't supported (needs a paid gateway + backend); password recovery uses email OTP only.

## License
MIT — see [LICENSE](LICENSE).
