# ProjectVault Expenses Tracker — WebApp

This WebApp is the supplied `index (4).html`, integrated into the complete ProjectVault source package.

## Included
- Supabase Auth client integration already present in the supplied app
- Existing expenses, accounts, debts, reminders, budgets, sync and admin functionality
- Social Money / connection / shared-debt UI already present in the supplied app
- Events & Media layer added for festivals, birthdays, festival media and sponsored media
- Admin event/media controls using the existing `pv-media` Supabase Storage bucket
- PWA manifest + service worker

## Supabase
The WebApp uses the Supabase project configured in `index.html`. The browser uses the publishable/anon key only; no service-role key is included.

The live project was checked during packaging: the feature tables for festivals, festival media, advertisements and Social Money exist, RLS is enabled on the public tables, and the `pv-media` storage bucket exists.

## Run
Serve this folder from a static HTTP server (not `file://`). For example, use GitHub Pages, Netlify, Vercel static hosting, or any local static server.

## Admin media
An authenticated admin can open **Events & Media** from the drawer to create festivals/campaigns and upload supported JPG/PNG/GIF/MP4/WebM media to Supabase Storage.
