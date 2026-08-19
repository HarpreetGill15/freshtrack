# Project Status

Written against the 22-section spec, in the same order. This build could not be run through `npm
install`/`build`/`lint` or tested on a real device from the environment that produced it (sandboxed,
no network access to npm registry, no camera, no real Firebase/Vercel/Zapier accounts) -- every
item below is either (a) manually code-reviewed carefully against the existing patterns in the repo,
or (b) explicitly flagged as needing your test pass. **Please run `npm install && npm run build &&
npm run lint` and report back before deploying** -- that's the fastest way to catch anything I got wrong.

## 1. Code Date Check -- Done
Name / Area (dropdown: Grocery, Dairy, Meat, Produce) / Section (free text) / Month / Check date,
no auth required. Resume works via a `localStorage` pointer to the active check (survives closing
the tab/app; does not sync across devices without real auth -- noted as a limitation, not a bug).

## 2. Barcode scanning -- Preserved, improved
Existing ZXing continuous-scan implementation kept as-is (it already worked). Camera error messages
now distinguish permission-denied / no-camera / camera-in-use rather than one generic message.
Cleanup-on-unmount (`return () => controls?.stop()`) was already correct and is unchanged.
**Needs your test**: real iPhone Safari + Android Chrome camera behavior -- I cannot access a camera
from this environment.

## 3. Product lookup — Done
Firebase catalogue lookup only. External lookups (Open Food Facts, UPCitemdb) were removed at your
request — the catalogue is populated via Product Import and manual entry only now, no live external
API calls in the scan flow. Product carries all the listed fields (vendorCode, subDepartment,
brand, active, createdAt/updatedAt).
UPC is the Firestore document ID for both the scan path and the import path, so duplicates by UPC
are structurally impossible, not just checked-for.

## 4. Product catalogue import -- Done, with one caveat
Added/Updated/Unchanged/Skipped/Errors breakdown, downloadable CSV error report, `.xls`/`.xlsx`/`.csv`
support, broadened header-name matching, leading-zero recovery for numeric UPC cells.
**Caveat**: leading-zero recovery is a heuristic (pad to 12 digits if the cell already lost its
zero) -- if your source file's UPCs are consistently a different length, tell me and I'll adjust
the threshold. I could not test this against your real file.

## 5. Code date entry -- Done
Product name/description/UPC/sub-department/image shown, quantity + expiry entry, "+ Add another
date" button, separate `codeDates` collection, same-product/same-check/same-day duplicate detection
increments quantity instead of creating a new record (checked client-side against the product's
already-indexed code dates -- see the comment in `addOrIncrementCodeDate` for why that's the
"simplest production-ready" choice over adding a third composite index for this).

## 6. Quantity workflow -- Done
+/- buttons, tap-to-select-all on the number field, Save & Scan Next returns straight to the
scanner (or refocuses manual entry) with zero extra screens.

## 7. Markdown workflow -- Done
Statuses are `active` / `marked_down` / `cleared` / `removed`. Marking down prompts for a recheck
date, records `markedDownAt` + `recheckAt`, and the item stays fully visible under "Marked Down --
Recheck Required" everywhere (dashboard, Excel export, Zapier feed) until cleared or removed.

## 8. Dashboard -- Done
Grouped into "Needs Initial Action" (bucketed TODAY/TOMORROW/N DAYS/OVERDUE, sorted soonest-first)
and "Marked Down -- Recheck Required", with filter chips (All / Today / Next 5 Days / Marked Down /
Cleared / Removed), Area and Section dropdown filters, and search. Cleared/Removed are lazy-loaded
only when their tab is selected, to avoid pulling resolved history into every page load.

## 9. Complete Code Date Check -- Done
New `/checks/finish` page: counts (products scanned, records, needs action, marked down, cleared,
removed), a warning (not a block) if items are unresolved, Excel export button, Finish button.

## 10. Excel export -- Done, simplified at your request
Originally built to the spec's full column list; simplified to just UPC, Description, and Expiring
Date per your later request, since that's all you need. Still sorted by expiry ascending, frozen
header row, auto-sized columns via SheetJS's `!freeze`/`!cols` properties -- **I could not render
an actual .xlsx file to confirm these apply correctly in Excel** (no ability to open Office files
in this sandbox); if the header isn't frozen or columns look off, tell me and I'll adjust
`src/lib/excel-export.ts`.

## 11-12. Zapier integration -- Done, needs your credentials to activate
`GET /api/reminders` (Vercel serverless function, `api/reminders.ts`) returns the exact JSON shape
from the spec, filterable by `status`/`check`/`area`/`section`, protected by a shared `ZAPIER_API_KEY`
header. Firebase Admin credentials are server-only env vars, never in client code. Full setup steps
are in `DEPLOYMENT.md`. **This cannot go live until you provide**: a Firebase service account, a
generated API key, and your actual Zapier account to build the Zap against. I also could not
type-check `api/reminders.ts` locally -- it's outside the Vite build's `tsconfig` scope by design
(Vercel compiles `/api` separately); please run `vercel dev` or a preview deploy to confirm it
builds before relying on it.

## 13. Firebase / Firestore -- Done
Reviewed and updated `firestore.rules` for the new schema (marked_down status, codeDates quantity
updates for the dedupe feature, a new `codeDateChecks` update rule needed for Finish Check --
this was previously missing entirely and would have failed silently). Added the composite index
`codeDates(codeDateCheckId, expirationDate)` needed by the Finish Check summary and Excel export.
**Needs your deploy**: `firebase deploy --only firestore:rules,firestore:indexes`, then wait for
the new index to show Enabled before testing Finish Check / Excel export.

## 14. Authentication -- Preserved, hardened
Real Firebase email/password sign-in is untouched and still gates Dashboard/Product
Import/Settings only -- never the check-creation/scan/finish workflow.
**Change from earlier in this project**: the hardcoded local-admin test backdoor
(username/password `928`/`928`) has been removed. It was fine for early interactive testing, but a
credential-in-source-code is a real issue for the production-readiness pass this spec explicitly
asks for (sections 18-19). If you still want an interim no-Firebase preview mode, tell me and I'll
build a safer version (e.g. a real env-var-gated password, not one shipped in the JS bundle).

## 15. UI cleanup -- Partial, deliberately deprioritized
Per your own stated priority order (#12 of 14), I did not do a full visual polish pass this round --
the core workflow (1-10) got the engineering time instead. What's already consistent: buttons,
spacing, loading/empty states, and error messaging follow the patterns already established earlier
in this project. Deferred: a dedicated design pass, icon/spacing audit, and a check for any
remaining rough edges once you've clicked through the real app.

## 16. Error handling -- Key paths covered, not exhaustively audited
Covered: camera permission/availability errors, offline lookup/save, invalid/missing expiry date,
Firestore write failures (surfaced, not silently swallowed), import row-level errors with a
downloadable report. Not individually audited: every single failure mode listed in section 16 --
this would need real error injection testing (killing wifi mid-scan, corrupting a file, etc.) that
I can't perform here. The general pattern throughout (try/catch with a user-facing message, never a
raw stack trace) is applied consistently, so most of these should already degrade reasonably.

## 17. Offline resilience -- Done, with an honest caveat on messaging
Firestore's `persistentLocalCache` (with multi-tab support) is enabled in `src/lib/firebase.ts` --
writes queue locally and sync automatically on reconnect, which is exactly what section 17 asks
for. The scan page shows "Saved locally -- waiting for connection" when `navigator.onLine` is false
at save time. **Caveat**: `navigator.onLine` is not a perfectly reliable signal (a device can report
"online" while actually having no real connectivity to Firebase) -- for a fully rigorous offline
indicator you'd want to listen to Firestore's own connection-state snapshots, which I did not build
out given time constraints. What's there is honest (it never claims success it can't back up) but
not a complete network-state UI.

## 18. Security -- Done
Firebase web config moved to `VITE_FIREBASE_*` env vars (not committed) -- see `.env.example`.
Zapier's Firebase Admin credentials and API key are server-only Vercel env vars, never in client
code. The local-admin backdoor is removed (see section 14). `firestore.rules` reviewed and is not
in test-mode (`allow read, write: if true` was never present in this repo -- it already had scoped
rules; they're now updated for the new schema, not loosened).

## 19. Demo/placeholder removal -- Done
Removed: the `928` backdoor, the dead `inventory` Firestore collection and its service functions
(from an earlier pass), an unused `InventoryList` component. Searched for TODO/mock/fake/placeholder
markers relevant to core functionality -- found none beyond what's already listed here.

## 20. Testing -- Not performed (needs you)
I cannot open a browser, use a camera, or deploy to Vercel/Firebase from this environment. The
25-step test script in the spec needs to be run by you against a real deployment. Please work
through it and report back anything that breaks -- that's the fastest path to a genuinely verified
MVP, and I'll fix issues as you find them the same way we've been working through this project.

## 21. Production deployment -- Config done, execution needs you
`vercel.json` added (SPA rewrite that doesn't interfere with `/api`). Env var requirements
documented in `DEPLOYMENT.md`. **I cannot run `npm install`/`build`/`lint` from this sandbox** (its
network policy blocks the npm registry outright, unrelated to this codebase) -- every prior round
of this project has used the same pattern: I make the change, you run the actual build/lint and
report results, I fix what comes back. Please do that once more for this full batch of changes
before deploying, since this is by far the largest set of changes in one pass so far.

## 22. Priority order -- Followed
Worked in the order specified: scanner (preserved+improved) -> product lookup (fixed) -> quantity
(done) -> multiple expiry dates + dedupe (done) -> check organization (done) -> dashboard (done) ->
markdown/recheck (done) -> Excel export (done) -> catalogue import (done) -> Zapier (done, needs
your credentials) -> security (done) -> UI cleanup (deferred per your own stated priority) ->
production testing (needs you) -> this document.

---

## What genuinely cannot be completed without you

- **Real device/browser testing** (iPhone Safari, Android Chrome, desktop) -- no camera or browser
  access in this environment.
- **Firebase index/rule deployment** -- I've written the correct `firestore.rules` and
  `firestore.indexes.json`, but they only take effect once you run `firebase deploy`.
- **Zapier activation** -- needs your Firebase service account, a generated API key, and your
  actual Zapier account.
- **`npm install`/`build`/`lint` verification** -- blocked by this sandbox's network policy every
  time it's been attempted in this project; needs to be run on your machine or in CI.
- **Vercel deployment** -- needs your Vercel account/project connected to the repo.
- **Excel file rendering confirmation** -- I built the export to spec but can't open the resulting
  `.xlsx` in Excel to visually confirm frozen headers/column widths look right.
