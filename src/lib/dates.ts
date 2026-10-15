import type { DashboardEntry } from '../types/domain'

const DAY = 86400000
const startOfDay = (date: Date) => new Date(date).setHours(0, 0, 0, 0)

/** Whole calendar days from today (local time) to `date`: 0 = today, -2 = two days overdue. */
export const daysUntil = (date: Date) => Math.round((startOfDay(date) - startOfDay(new Date())) / DAY)

/** A marked-down item whose recheck date has arrived — someone needs to look at the shelf. */
export const recheckDue = (item: DashboardEntry) => item.status === 'marked_down' && item.recheckAt != null && daysUntil(item.recheckAt) <= 0

export const shortDate = (date: Date) => date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

/** Local YYYY-MM-DD for <input type="date"> values (toISOString is UTC and flips to tomorrow in the evening). */
export const inputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Local YYYY-MM for the current month (same reason). */
export const currentMonth = () => inputDate(new Date()).slice(0, 7)

export const addDays = (days: number, from = new Date()) => { const next = new Date(from); next.setDate(next.getDate() + days); return next }

/** Parses an <input type="date"> value as local noon, matching how expiry dates have always been stored. */
export const fromInputDate = (value: string) => new Date(`${value}T12:00:00`)

/** Counts used on Home and the To-do tabs. */
export function todoCounts(entries: DashboardEntry[]) {
  let rechecks = 0, todayOrOverdue = 0, next5 = 0, markedDown = 0
  for (const entry of entries) {
    if (entry.status === 'marked_down') { markedDown++; if (recheckDue(entry)) rechecks++; continue }
    if (entry.status !== 'active') continue
    const days = daysUntil(entry.expirationDate)
    if (days <= 0) todayOrOverdue++
    else if (days <= 5) next5++
  }
  return { rechecks, todayOrOverdue, next5, markedDown }
}
