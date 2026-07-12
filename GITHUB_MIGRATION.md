# Moving this project to your new GitHub account

I can't touch your GitHub accounts directly (no access), but here's exactly how to move it —
pick whichever path fits your situation.

## Option A — Fresh repo on the new account (simplest, recommended)
Use this if you don't need to preserve commit history from the old repo.

1. Log into your **new** GitHub account in the browser (or use a separate browser profile /
   incognito window if you're staying logged into both accounts).
2. Create a new repository, e.g. `github.com/new-username/expense-tracker` (Public or Private,
   your call — don't initialize with a README so it stays empty).
3. On your machine, in the project folder:
   ```bash
   cd path/to/your/project
   git init                     # only if this folder isn't already a git repo
   git add .
   git commit -m "Initial commit — ProjectVault"
   git branch -M main
   git remote add origin https://github.com/new-username/expense-tracker.git
   git push -u origin main
   ```
4. If it asks for credentials and you're still logged into your **main** account's git
   credentials, either:
   - Use a **Personal Access Token** for the new account (Settings → Developer settings →
     Personal access tokens → generate one, use it as the password when pushing), or
   - Use SSH with a key added specifically to the new account.

## Option B — Preserve full commit history from the old repo
1. Create the empty new repo on your new account (same as step 2 above).
2. From your existing local clone of the old repo:
   ```bash
   cd path/to/old/project
   git remote set-url origin https://github.com/new-username/expense-tracker.git
   git push -u origin main
   ```
   This keeps all commits/history but now pushes to the new account's repo.
   ⚠️ The old repo on your main account is untouched — delete/archive it separately if you want.

## Option C — Use GitHub's built-in transfer (keeps stars/issues/URL redirects)
Only works between two accounts you control:
1. On the **old** repo → Settings → scroll to **Danger Zone** → **Transfer ownership**.
2. Enter your new account's username, confirm.
3. GitHub automatically sets up a redirect from the old URL to the new one.
4. This is the cleanest option if you want to fully move (not copy) the repo, including all
   issues, stars, and history — GitHub does not require the two accounts to be linked.

## If you're using GitHub Pages to host this app
After moving, re-enable Pages on the **new** repo: Settings → Pages → choose branch (usually
`main`) → Save. Your live URL will change to
`https://new-username.github.io/expense-tracker/` — update that anywhere you've shared/bookmarked
the old link (and in `manifest.json`'s `start_url`/`scope` if you hardcoded the old domain,
though this project uses relative paths so it should just work).

## Avoiding cross-account auth mix-ups
The most common snag is git still being authenticated as your main account. Fixes:
- Check current remote: `git remote -v`
- Check whose credentials are cached: on macOS, Keychain Access → search "github"; on Windows,
  Credential Manager; or just use a Personal Access Token per-repo to sidestep the issue entirely.
- Alternatively, keep two separate local folders/SSH keys, one per GitHub account, to avoid mixing
  them up.
