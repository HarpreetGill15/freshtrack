import { ChevronDown, CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '../components/app-shell'

type Step = { title: string; summary: string; body: string[]; image: string }

const STEPS: Step[] = [
  {
    title: '1. Start a Code Date Check',
    summary: 'From the home screen — no sign-in needed.',
    image: '/help/01-start-check.png',
    body: [
      'Open the app and tap "Start new Code Date Check" on the home screen.',
      'Fill in your name, the Area (Grocery, Dairy, Meat, Produce), a Section, the Month, and the check date, then continue.',
      'This creates the "check" that every scan you do next gets grouped under — it\'s what lets you export or finish the whole thing later from any computer.',
    ],
  },
  {
    title: '2. Scan products',
    summary: 'Use the camera, or type the UPC in by hand.',
    image: '/help/02-scan.png',
    body: [
      'Tap "Scan" in the bottom navigation, then point the camera at the barcode — it scans continuously so you don\'t need to tap a shutter button.',
      'No camera, or the barcode won\'t scan? Use the manual entry field to type the UPC number instead.',
      'If the product isn\'t in the catalogue yet, you\'ll be asked to fill in its name/description once — after that, every future scan of that UPC recognizes it automatically.',
    ],
  },
  {
    title: '3. Record quantity and expiration date',
    summary: 'Set how many, and when it expires.',
    image: '/help/03-quantity.png',
    body: [
      'After scanning, enter the expiration (code) date and the quantity on the shelf, using the +/- buttons or by tapping the number to type it directly.',
      'Tap "Save & Scan Next" to jump straight back to the scanner for the next item — no extra screens in between.',
      'Scanning the same product with the same expiration date again on the same check just adds to the existing quantity instead of creating a duplicate entry.',
    ],
  },
  {
    title: '4. Mark an item down',
    summary: 'When something needs a discount before it expires.',
    image: '/help/04-mark-down.png',
    body: [
      'On the Dashboard, find the item\'s card and tap the orange ticket-shaped "Mark down" button.',
      'Pick a recheck date — the date you\'ll come back and see if it sold or needs to be pulled.',
      'The item moves into the "Marked Down — Recheck Required" section, which now shows at the very top of the Dashboard so it can\'t be missed.',
    ],
  },
  {
    title: '5. Recheck marked-down items',
    summary: 'The most commonly missed step — look here first.',
    image: '/help/05-recheck.png',
    body: [
      'Every time you open the Dashboard, check the "Marked Down — Recheck Required" section first — it now appears above everything else.',
      'Anything with a red bar and "(due now)" next to its recheck date needs your attention today. A banner and the "Marked Down" number at the top of the screen also flag this.',
      'Tap the "Marked Down" stat pill (or the tab further down) to jump straight to just those items if the list is long.',
    ],
  },
  {
    title: '6. Mark an item Sold or Removed',
    summary: 'Clears it off the active list.',
    image: '/help/06-sold-removed.png',
    body: [
      'On any card, tap the green check to mark it Sold (cleared), or the red trash icon to mark it Removed.',
      'The item moves to the "Cleared" or "Removed" tab and disappears from the active/marked-down lists immediately.',
      'New stock arrived with a different date after you cleared or removed an item? Open the Cleared or Removed tab, find the item, and tap the small "+" button on its card — it lets you add a new expiration date and quantity for that same product in a couple of taps, without starting a new scan.',
      'That quick "+" only works while the item\'s check is still for the current month. Once the calendar rolls into a new month, it\'ll prompt you to start a new Code Date Check instead, so months don\'t get mixed together in one check\'s records.',
    ],
  },
  {
    title: '7. See full product details',
    summary: 'Tap a product name to expand it.',
    image: '/help/07-product-details.png',
    body: [
      'Product names can be hard to read on a phone — tap anywhere on the name/date line of a card to expand it in place and see the full UPC number and description.',
      'From that expanded view, "Open full product page" takes you to that product\'s complete history of expiration dates.',
    ],
  },
  {
    title: '8. Use the Dashboard filters',
    summary: 'Tabs, search, and department buttons.',
    image: '/help/08-filters.png',
    body: [
      'The tabs (All active, Today, Next 5 Days, Marked Down, Cleared, Removed) narrow the list to exactly what you need.',
      'The four stat numbers at the top (Overdue, Due Today, Next 5d, Marked Down) are tappable shortcuts straight into the matching tab.',
      'Use the search box to find a product by name or UPC, and the department buttons to narrow by Produce/Dairy/Meat/etc.',
      'The "Impact so far" card shows your all-time totals — units sold via markdown vs. units removed, and the percentage saved from waste. Tap either number to jump to that tab.',
    ],
  },
  {
    title: '9. Finish a Code Date Check',
    summary: 'From the Checks tab, on any device.',
    image: '/help/09-finish-check.png',
    body: [
      'Open "Checks" in the bottom navigation to see every check, active or completed — this works from a computer even if the scanning was done on a phone.',
      '"Excel" downloads a spreadsheet of everything recorded under that check, sorted by expiration date.',
      '"Finish" closes out the check once everything on it has been actioned (you\'ll get a warning, not a block, if anything is still unresolved).',
    ],
  },
  {
    title: '10. Import a product catalogue',
    summary: 'Bulk-load products instead of typing them in one by one.',
    image: '/help/10-import.png',
    body: [
      'Open "Import" in the bottom navigation and upload a .csv or Excel file of your products.',
      'You\'ll get a breakdown of what was added, updated, unchanged, or skipped, plus a downloadable error report for any rows that couldn\'t be read.',
    ],
  },
]

export function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return <AppShell>
    <div className="flex items-center gap-2"><CircleHelp className="text-brand-600" size={22}/><h2 className="text-2xl font-bold">How to use FreshTrack</h2></div>
    <p className="mt-1 text-sm text-slate-500">A step-by-step walkthrough of the whole app. Tap a step to expand it.</p>
    <section className="mt-6 space-y-2.5">
      {STEPS.map((step, index) => {
        const open = openIndex === index
        return <article key={step.title} className="overflow-hidden rounded-2xl bg-white shadow-card">
          <button type="button" onClick={() => setOpenIndex(open ? null : index)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900">{step.title}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{step.summary}</p>
            </div>
            <ChevronDown size={18} className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
          </button>
          {open && <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
            <img src={step.image} alt={`Example: ${step.title}`} className="mx-auto max-h-96 w-auto rounded-xl border border-slate-200 shadow-sm" loading="lazy"/>
            <div className="space-y-2">{step.body.map((line, i) => <p key={i} className="flex gap-2"><span className="text-brand-500">•</span><span>{line}</span></p>)}</div>
          </div>}
        </article>
      })}
    </section>
  </AppShell>
}
