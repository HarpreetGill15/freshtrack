# FreshTrack

FreshTrack is a mobile-first grocery code-date management PWA. Staff create a **Code Date Check**
(no login required), scan UPCs with the phone camera, record expiration dates and quantities, and
track items through Active → Marked Down (needs recheck) → Cleared/Removed. Managers get a
department/section dashboard, Excel export per check, and a daily reminder feed for Zapier.

Stack: React + Vite + TypeScript, Firebase/Firestore, Tailwind, ZXing (barcode scanning),
SheetJS/xlsx (import + export), pdfjs-dist (PDF catalogue import), Vercel (hosting + the
`/api/reminders` serverless endpoint), Firebase Cloud Functions (optional secondary email path).

## Core workflow

```
Home -> Create Code Date Check (name, area, section, month, check date)
     -> Scanner (camera or manual UPC entry)
     -> Product found (Firebase catalogue) or created manually
     -> Quantity (+/- buttons) + expiration date -> Save & scan next
     -> repeat for every item
     -> Finish Check -> summary counts -> Export Excel -> Complete
```

No Firebase Authentication is required anywhere in this workflow. Sign-in only gates the
back-office views (Dashboard, Product Import, Settings) -- see `firestore.rules` for the exact
read/write permissions, which are intentionally open (no-auth) for `products` and `codeDates`.

## Status model

Each code-date record has one status: `active` -> `marked_down` (recheck required, stays visible on
the dashboard and in reminders with a recheck date) -> `cleared` or `removed` (resolved, excluded
from reminders). Marking a product down never removes it from view -- see `PROJECT_STATUS.md` for
the exact dashboard grouping rules.

## Local development

```
npm install
cp .env.example .env.local   # fill in your Firebase web config
npm run dev
```

See `DEPLOYMENT.md` for Firebase, Vercel, and Zapier setup.

## Product catalogue import

Product Import (under Dashboard) accepts `.xls`, `.xlsx`, `.csv`, or `.pdf`. Required columns:
UPC and Description (several header spellings are auto-detected -- see
`src/pages/product-import-page.tsx`). Vendor/SAP Code and Sub Department are optional. UPCs are
normalized to digits-only and, for numeric Excel cells that lost a leading zero, padded back to 12
digits as a best-effort recovery. A downloadable CSV error report lists every skipped row and why.

## Known gaps

See `PROJECT_STATUS.md` for the current, honest list of what's finished, what's best-effort, and
what genuinely needs your credentials/device testing to close out.
