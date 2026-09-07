# ProjectVault WebApp Step 13 — requested updates

- Festival/ad campaigns now respect configured start/end dates; active campaigns do not appear outside their date window.
- Accepted friend/shared debts are reconciled into the main Debts list, not only the Shared Money summary.
- Announcement dismissal is now recorded server-side per user so a viewed announcement does not return on another device.
- Monthly statement send guard now has a server-side per-user/month receipt in `pv_statement_receipts` to prevent duplicate sends across devices.
- Weekly digest auto-send has been disabled; the intended recurring email is the monthly statement only.
- Added clear PWA/native Android installation guidance. A website cannot silently install a native Android APK; Android requires user approval.
