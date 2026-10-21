import { ChevronDown, CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '../components/app-shell'

// To add a screenshot to a step, put the picture in public/help/ and set `image` to its path,
// e.g. image: '/help/scan.png'. Steps without one just show the text.
type Step = { title: string; summary: string; body: string[]; image?: string }

const STEPS: Step[] = [
  {
    title: '1. Getting around',
    summary: 'The six buttons along the bottom.',
    body: [
      'Home: what needs doing today, and the check you\'re working on.',
      'Scan: scan products into the current check.',
      'To-do: every item that needs action. Mark down, sold, removed.',
      'Export: every check, with its Excel download.',
      'Dashboard: charts (manager login only).',
      'More: Import products, Settings, Help, and sign in or out.',
      'Scanning, the To-do list and Export work without signing in.',
    ],
  },
  {
    title: '2. Start a check',
    summary: 'From Home: "Start a new check".',
    body: [
      'On Home, tap "Start a new check".',
      'Pick the Department (Grocery, Dairy, Meat or Produce). The name is optional, and the Month and Check date fill in for today.',
      'Tap "Start scanning". Every item you scan next is saved under this check.',
      'Home now shows a green "Check in progress" card. Tap "Continue scanning" on it to get back to the scanner any time.',
    ],
  },
  {
    title: '3. Scan a product',
    summary: 'Use the camera, or type the UPC.',
    body: [
      'On Scan, tap "Open camera" and point it at the barcode. It reads it on its own, so there\'s no button to press.',
      'Barcode won\'t scan? Type the number under "Or type the UPC" and tap "Look up product".',
      'If the product isn\'t in the list yet, type a description and tap "Add this product". You only do this once per product.',
    ],
  },
  {
    title: '4. Enter the expiry date and quantity',
    summary: 'Then "Save & scan next".',
    body: [
      'Pick the expiry date, or tap a shortcut: "Today", "Tomorrow" or "Same as last".',
      'Set the quantity with − and +, or tap the number and type it.',
      'Tap "Save & scan next" to go straight back to the camera for the next item.',
      'Same item with more than one date on the shelf? Tap "Save & add another date for this item" instead, then enter the next date.',
      'Scanning the same item with the same date again adds to its quantity. It doesn\'t make a second entry.',
      '"See other dates for this item" shows every date already recorded for it.',
      'No wifi? Keep going. Saves stay on the phone and send automatically when the connection is back.',
    ],
  },
  {
    title: '5. Finish scanning',
    summary: '"Finish this check" at the bottom of Scan.',
    body: [
      'When the section is done, tap "Finish this check" on the Scan screen.',
      'The finish screen shows how many products you scanned. Tap "Download .xlsx" if you want the spreadsheet now, then tap "Finish check".',
      'Finishing only closes the scanning. Marking items down, sold or removed happens on the To-do list.',
    ],
  },
  {
    title: '6. Check the To-do list every day',
    summary: 'Start with "Today on the floor" on Home.',
    body: [
      'Home shows three counts: "Markdowns to recheck", "Expire today or overdue" and "Expire in the next 5 days". Tap one to open that list.',
      'On To-do, the buttons along the top filter the list: All, Rechecks, Today, Next 5 days, Sold, Removed.',
      'Markdowns that are due for a recheck are always at the top, under "Recheck due now". Then come Overdue, Expires today, and the next few days.',
      'Use the search box for a product name or UPC, and "All depts" to show one department.',
    ],
  },
  {
    title: '7. Mark an item down',
    summary: 'The orange "Mark down" button on a card.',
    body: [
      'On the item\'s card, tap "Mark down".',
      'Choose when someone should recheck it: "Tomorrow", "In 2 days", or "Pick date". Then tap "Mark down".',
      'The item moves to Rechecks. On its recheck day it jumps to the top of the To-do list and Home highlights it.',
    ],
  },
  {
    title: '8. Recheck a markdown',
    summary: 'Did it sell? Three choices.',
    body: [
      'Go to the shelf and look for the item.',
      'All gone? Tap "Sold".',
      'Pulled or thrown out? Tap "Removed".',
      'Still on the shelf? Tap "Still here", pick when to check again, and tap "Save recheck".',
    ],
  },
  {
    title: '9. Sold, Removed and new stock',
    summary: 'Clearing an item, and adding the next date.',
    body: [
      'Tap "Sold" or "Removed" on any card. It leaves the list straight away.',
      'The app then asks "New stock of …?". If fresh stock went up, enter its expiry date and quantity and tap "Save new date". Otherwise tap "Skip".',
      'To add a date later, open the Sold or Removed list, find the item and tap "Add new date".',
      'If the item came from last month\'s check, the new date goes into this month\'s check for that department. If there isn\'t one yet, it asks you to start one.',
    ],
  },
  {
    title: '10. Product details',
    summary: 'Tap a product name to see more.',
    body: [
      'Tap the name on any To-do card to see its full UPC and description.',
      '"Open product page" shows every expiry date recorded for that product, oldest first.',
    ],
  },
  {
    title: '11. Export to Excel',
    summary: 'The Export button. Works from any phone or computer.',
    body: [
      'Export lists every check, open or finished, whichever device did the scanning.',
      '"Excel" downloads that check as a spreadsheet, sorted by expiry date.',
      'For a check that isn\'t finished yet, "Continue scanning" picks it up again and "Finish" closes it.',
      'The trash button deletes a check and every item scanned under it. It asks you to sign in first and can\'t be undone.',
    ],
  },
  {
    title: '12. Daily 7 AM emails',
    summary: 'A printable list for each department.',
    body: [
      'Every morning around 7 AM the store email gets a separate list for each department (Grocery, Dairy, Meat, Produce): markdowns to recheck, items to pull or mark down today, and what\'s expiring in the next 5 days.',
      'A department with nothing due gets no email that day.',
      'Print it or take a picture, tick each box as you go, then update the items in the app.',
      'To change the store email: More → Settings → Daily emails (sign in first). "Preview today" shows what will be sent, and "Send test now" sends it right away.',
    ],
  },
  {
    title: '13. Signing in and the Dashboard',
    summary: 'Only needed for a few things.',
    body: [
      'The staff login is needed to import products, change Settings, or delete a check.',
      'The manager login can do all of that and also open the Dashboard charts: what\'s expiring over the next 14 days, sold vs removed, markdowns per week, and what was thrown out by department.',
      'Sign in or out from More. Closing the browser tab also signs you out.',
    ],
  },
  {
    title: '14. Import products',
    summary: 'More → Import products (sign in).',
    body: [
      'Upload the product list as .xls, .xlsx, .csv or .pdf. It needs a UPC and a Description. Vendor/SAP code and Sub Department are optional.',
      'Check the preview of the first rows, then import.',
      'You\'ll see how many products were added, updated, unchanged or skipped, and you can download a list of any rows that couldn\'t be read.',
    ],
  },
]

export function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return <AppShell>
    <div className="flex items-center gap-2"><CircleHelp className="text-brand-600" size={22}/><h2 className="text-2xl font-bold">How to use FreshTrack</h2></div>
    <p className="mt-1 text-sm text-slate-500">Step by step, from starting a check to clearing the To-do list. Tap a step to open it.</p>
    <section className="mt-6 space-y-2.5">
      {STEPS.map((step, index) => {
        const open = openIndex === index
        return <article key={step.title} className="overflow-hidden rounded-2xl bg-white shadow-card">
          <button type="button" onClick={() => setOpenIndex(open ? null : index)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-4 text-left">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900">{step.title}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{step.summary}</p>
            </div>
            <ChevronDown size={18} className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
          </button>
          {open && <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
            {step.image && <img src={step.image} alt={`Example: ${step.title}`} className="mx-auto max-h-96 w-auto rounded-xl border border-slate-200 shadow-sm" loading="lazy"/>}
            <div className="space-y-2">{step.body.map((line, i) => <p key={i} className="flex gap-2"><span className="text-brand-500">•</span><span>{line}</span></p>)}</div>
          </div>}
        </article>
      })}
    </section>
  </AppShell>
}
