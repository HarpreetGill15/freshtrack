# Deployment

## 1. Firebase project setup

1. Create (or reuse) a Firebase project. Enable **Firestore** (production mode, not test mode).
2. Enable **Authentication > Email/Password** if you want the back-office sign-in (Dashboard,
   Product Import, Settings) to work. The scanning workflow itself never requires this.
3. Deploy the rules and indexes from this repo:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use <your-project-id>
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   Wait for indexes to show **Enabled** in Firebase Console > Firestore > Indexes before testing --
   "Building" will still throw a `failed-precondition` error on affected queries.

## 2. Environment variables (frontend)

Copy `.env.example` to `.env.local` for local dev, and set the same keys in **Vercel > Project
Settings > Environment Variables** for each environment (Production/Preview/Development):

| Variable | Where to find it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console > Project settings > General > Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_STORAGE_BUCKET` | same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |

These are safe to expose in the client bundle -- access is controlled by `firestore.rules`, not by
keeping this config secret. This is standard Firebase web practice.

## 3. Vercel deployment

1. Import the repo into Vercel. Framework preset: Vite (auto-detected).
2. Build command / output directory are set in `vercel.json` (`npm run build` / `dist`) --
   Vercel should pick these up automatically.
3. Add the frontend env vars from step 2, plus the server-only ones from step 4 and 5 below.
4. Deploy. `/api/reminders` is auto-detected as a serverless function from the `api/` directory.

## 4. Daily email (Vercel Cron + Resend) — recommended

This is the simplest path to a single daily reminder email: no Zapier account, no Firebase Blaze
upgrade. `/api/send-reminder.ts` is a Vercel serverless function, triggered once a day by a Vercel
**Cron Job** (configured in `vercel.json`), that reads Firestore directly and sends one HTML email
via [Resend](https://resend.com), grouped the same way as the dashboard: **Marked Down — Recheck
Required** first (flagging anything overdue for recheck), then **Needs Initial Action**. Cron Jobs
work on Vercel's free Hobby plan (limited to once/day, which is exactly what this needs).

### One-time setup

1. **Generate a Firebase Admin service account** (skip if you've already done this for the Zapier
   feed below): Firebase Console > Project settings > Service accounts > Generate new private key.
   This downloads a JSON file — do not commit it.
2. **Create a free Resend account** at resend.com and grab your API key from
   Dashboard > API Keys. The free tier (100 emails/day) is more than enough for one daily digest.
   For testing with no domain setup, Resend's shared sandbox sender `onboarding@resend.dev` works
   out of the box — it only delivers to the email address you signed up to Resend with.
3. **Set these Vercel env vars** (Project Settings > Environment Variables):
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — from the service
     account JSON (skip if already set for the Zapier feed — they're shared).
   - `RESEND_API_KEY` — from Resend.
   - `REMINDER_TO_EMAIL` — the address that should receive the digest.
   - `CRON_SECRET` — any random string (e.g. `openssl rand -hex 32`). Vercel automatically sends
     this back as `Authorization: Bearer <CRON_SECRET>` when it triggers the cron job, which is
     what authenticates the scheduled request — you don't call it yourself in production.
4. Redeploy so the new env vars and the `crons` entry in `vercel.json` take effect. The default
   schedule is `0 11 * * *` (11:00 UTC, ~7am Eastern during DST) — edit that cron expression in
   `vercel.json` for a different time; Vercel Cron is UTC-only.

### Testing it right away (don't wait for the schedule)

The endpoint also accepts the same shared secret as `/api/reminders` for manual testing:
```
curl -H "x-api-key: <your ZAPIER_API_KEY value>" https://<your-vercel-domain>/api/send-reminder
```
It returns `{"sent": true, "count": <n>, "recheckDueCount": <n>}` (or `{"sent": false, "count": 0}`
if nothing currently needs attention) and the email lands within a few seconds.

### Going live with your own domain later

Once you're happy with the test emails, verify your own sending domain in Resend (Dashboard >
Domains) and set `RESEND_FROM_EMAIL` (e.g. `FreshTrack <reminders@yourdomain.com>`) as a Vercel env
var — this unlocks sending to any recipient, not just your own Resend account email.

## 5. Zapier integration (`/api/reminders`)

Use this instead of (or alongside) section 4 if you want more flexible routing later — multiple
recipients, per-department splits, Slack instead of email — since it's a plain JSON feed rather
than a fixed email format. Note: Zapier's **Webhooks by Zapier** step (needed to call this URL) is
a paid-plan feature on some Zapier tiers — check your plan before building the Zap.

### Server-side setup (Vercel env vars -- never commit these)

1. **Generate a Firebase Admin service account**: Firebase Console > Project settings > Service
   accounts > Generate new private key. This downloads a JSON file -- do not commit it. (Skip if
   you already set this up for section 4 — the env vars are shared between both endpoints.)
2. From that JSON, set three Vercel env vars:
   - `FIREBASE_PROJECT_ID` -- the `project_id` field
   - `FIREBASE_CLIENT_EMAIL` -- the `client_email` field
   - `FIREBASE_PRIVATE_KEY` -- the `private_key` field, pasted as-is (Vercel's env var UI handles
     the embedded newlines; the code un-escapes `\n` automatically either way)
3. **Generate a random API key** (e.g. `openssl rand -hex 32`) and set it as `ZAPIER_API_KEY` in
   Vercel. This is the shared secret Zapier will send back on every request -- it's the only thing
   protecting this endpoint (and also works as the manual-test key for `/api/send-reminder` above)
   -- treat it like a password.
4. Redeploy so the new env vars take effect.

### Zapier setup

1. Create a new Zap. Trigger: **Schedule by Zapier** -> "Every Day" at whatever time you want the
   reminder.
2. Action: **Webhooks by Zapier** -> "GET".
   - URL: `https://<your-vercel-domain>/api/reminders`
   - Headers: `x-api-key: <your ZAPIER_API_KEY value>`
   - (Alternative if your Zapier plan doesn't support custom headers on GET: append
     `?apiKey=<key>` to the URL instead -- the endpoint accepts either.)
3. Test the step -- you should get back JSON shaped like:
   ```json
   { "count": 2, "generatedAt": "...", "items": [
     { "product": "Baby Spinach", "upc": "123456789012", "expirationDate": "2026-08-20",
       "daysRemaining": 2, "quantity": 4, "status": "active", "area": "Produce",
       "section": "Salads", "codeDateCheck": "August Produce", "needsRecheck": false }
   ] }
   ```
4. Add a **Formatter/Looping by Zapier** step to iterate `items`, then an email action (Gmail,
   Outlook, or Email by Zapier) to send the digest in whatever format you like. Looping is also a
   paid-plan feature on some tiers — a Formatter "Text" step that joins the items into one block is
   a free-tier-friendly alternative if Looping isn't available.

### Optional filters

`GET /api/reminders` accepts query params: `status` (exact status match), `check` (one specific
Code Date Check's `id`), `area`, `section`. Omit all of them for the default rule: everything
`active` and expiring within 5 days, plus everything `marked_down` regardless of date, excluding
`cleared`/`removed`.

## 5b. Cloud Function + Resend (alternative, needs Firebase Blaze)

`functions/src/index.ts` implements the same daily-email idea as section 4, but as a Firebase
Cloud Function instead of a Vercel Cron Job. Functionally equivalent — only worth using instead of
section 4 if you specifically want it running on Firebase's infrastructure. It requires upgrading
the Firebase project to the **Blaze (pay-as-you-go)** plan, since Cloud Scheduler and Secret
Manager aren't available on the free Spark plan.
```
firebase use freshtrack-590fc
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set REMINDER_TO_EMAIL
firebase functions:secrets:set TEST_TRIGGER_KEY   # generate one with: openssl rand -hex 32
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions
```
Test on demand with `curl -H "x-api-key: <TEST_TRIGGER_KEY>" https://us-central1-freshtrack-590fc.cloudfunctions.net/testSendExpiryReminders`.

## 6. Testing checklist before calling this production-ready

Run through `PROJECT_STATUS.md`'s testing section -- it lists the exact end-to-end workflow to
verify on a real iPhone, since none of this was testable from the build environment that produced
these changes (no camera, no real Firebase project, no real Zapier account).
