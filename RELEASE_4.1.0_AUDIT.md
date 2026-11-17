# Release 4.1.0 audit status

This is an in-place update candidate for the existing GitHub Pages app. It retains the current Supabase URL/client initialization and does not modify Supabase schema or data.

Fixed: PWA manifest references non-existent SVG icon and now references the present PNG assets; cache key bumped to v11; service worker excludes cross-origin/Supabase requests and caches only successful same-origin resources; offline shell fallback retained.

Not certified: browser UI, Supabase Auth, RLS, Edge Functions, email delivery, Android notification ingestion, device-to-web sync, current production Pages configuration. These require real-browser and live-project verification.

Release gate: run `node --test TESTS/release-smoke.test.js`; then run the manual matrix in README.md against the deployed candidate. No production `main` update is made by this branch.
