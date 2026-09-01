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

## 4. Daily email (Cloud Function + Resend)

This is the recommended path for a single daily reminder email — no Zapier account needed. It's a
scheduled Cloud Function (`functions/src/index.ts`) that queries Firestore directly every morning
and sends one HTML email via [Resend](https://resend.com), grouped the same way as the dashboard:
**Marked Down — Recheck Required** first (flagging anything overdue for recheck), then
**Needs Initial Action**.

### One-time setup

1. **Create a free Resend account** at resend.com and grab your API key from
   Dashboard > API Keys. The free tier (100 emails/day) is more than enough for one daily digest.
2. **For testing (no domain setup needed)**: Resend gives every account a shared sandbox sender,
   `onboarding@resend.dev`, which the function uses by default. It only delivers to the email
   address you signed up to Resend with — that's fine for testing to yourself.
3. **Set the secrets** (each prompts for a value in your terminal):
   ```
   firebase use freshtrack-590fc
   firebase functions:secrets:set RESEND_API_KEY
   firebase functions:secrets:set REMINDER_TO_EMAIL
   ```
   For `REMINDER_TO_EMAIL`, use the same address you signed up to Resend with while testing.
4. **Build and deploy**:
   ```
   cd functions && npm install && npm run build && cd ..
   firebase deploy --only functions
   ```
   This requires the project to be on Firebase's **Blaze (pay-as-you-go)** plan — scheduled
   functions (Cloud Scheduler) aren't available on the free Spark plan. You won't be charged for
   normal usage at this volume; Blaze just removes the hard cap.

### Testing it right away (don't wait for 7am)

The deploy also creates `testSendExpiryReminders`, an on-demand HTTPS version of the exact same
email, protected by its own shared secret:
```
firebase functions:secrets:set TEST_TRIGGER_KEY   # generate one with: openssl rand -hex 32
curl -H "x-api-key: <TEST_TRIGGER_KEY>" https://us-central1-freshtrack-590fc.cloudfunctions.net/testSendExpiryReminders
```
It returns `{"sent": true, "count": <n>}` (or `{"sent": false, "count": 0}` if nothing currently
needs attention) and the email lands within a few seconds. Once you've deployed, you can also
"Force run" the scheduled job itself from Google Cloud Console > Cloud Scheduler, without needing
the curl command.

### Going live with your own domain later

Once you're happy with the test emails, verify your own sending domain in Resend (Dashboard >
Domains) and set:
```
firebase functions:secrets:set RESEND_FROM_EMAIL   # e.g. "FreshTrack <reminders@yourdomain.com>"
```
This unlocks sending to any recipient, not just your own Resend account email.

## 5. Zapier integration (`/api/reminders`)

This is the primary reminder path per the spec. It's a plain JSON GET endpoint, not a Firebase
callable -- Zapier's "Webhooks by Zapier" app (or any HTTP-capable Zap step) can call it directly.

### Server-side setup (Vercel env vars -- never commit these)

1. **Generate a Firebase Admin service account**: Firebase Console > Project settings > Service
   accounts > Generate new private key. This downloads a JSON file -- do not commit it.
2. From that JSON, set three Vercel env vars:
   - `FIREBASE_PROJECT_ID` -- the `project_id` field
   - `FIREBASE_CLIENT_EMAIL` -- the `client_email` field
   - `FIREBASE_PRIVATE_KEY` -- the `private_key` field, pasted as-is (Vercel's env var UI handles
     the embedded newlines; the code un-escapes `\n` automatically either way)
3. **Generate a random API key** (e.g. `openssl rand -hex 32`) and set it as `ZAPIER_API_KEY` in
   Vercel. This is the shared secret Zapier will send back on every request -- it's the only thing
   protecting this endpoint, so treat it like a password.
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
   Outlook, or Email by Zapier) to send the digest in whatever format you like.

### Optional filters

`GET /api/reminders` accepts query params: `status` (exact status match), `check` (one specific
Code Date Check's `id`), `area`, `section`. Omit all of them for the default rule: everything
`active` and expiring within 5 days, plus everything `marked_down` regardless of date, excluding
`cleared`/`removed`.

## 6. Testing checklist before calling this production-ready

Run through `PROJECT_STATUS.md`'s testing section -- it lists the exact end-to-end workflow to
verify on a real iPhone, since none of this was testable from the build environment that produced
these changes (no camera, no real Firebase project, no real Zapier account).
