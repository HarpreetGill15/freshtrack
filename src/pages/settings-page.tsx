import { Gauge, LogOut, Store, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { useAuth } from '../hooks/use-auth'
import { backfillCodeDateDetails } from '../services/product-service'

export function SettingsPage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')

  async function logout() { await signOut(); navigate('/login') }

  async function upgradeOldRecords() {
    setUpgrading(true); setUpgradeMessage('Checking records…')
    try {
      const { updated, failed } = await backfillCodeDateDetails((done, total) => setUpgradeMessage(`Updating ${done} of ${total}…`))
      setUpgradeMessage(updated + failed === 0 ? 'All records are already up to date.' : `Done — ${updated} record${updated === 1 ? '' : 's'} updated${failed ? `, ${failed} could not be updated (try again)` : ''}.`)
    } catch (reason) {
      setUpgradeMessage(reason instanceof Error ? reason.message : 'Could not update records.')
    } finally { setUpgrading(false) }
  }

  return <AppShell>
    <h2 className="text-2xl font-bold">Settings</h2>
    <p className="mt-1 text-sm text-slate-500">Manage your FreshTrack account and store.</p>
    <section className="mt-7 space-y-3">
      <article className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><UserRound size={19}/></span><div><p className="font-semibold">Account</p><p className="text-sm text-slate-500">Store admin</p></div></article>
      <article className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Store size={19}/></span><div><p className="font-semibold">Store</p><p className="text-sm text-slate-500">Default store</p></div></article>
      <article className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><Gauge size={19}/></span><div><p className="font-semibold">Speed up old records</p><p className="text-sm text-slate-500">One-time upgrade so the dashboard loads faster. Safe to run again.</p></div></div>
        <Button variant="secondary" className="mt-3 w-full" disabled={upgrading} onClick={() => void upgradeOldRecords()}>{upgrading ? 'Working…' : 'Run upgrade'}</Button>
        {upgradeMessage && <p className="mt-2 text-center text-xs text-slate-500">{upgradeMessage}</p>}
      </article>
    </section>
    <Button variant="danger" className="mt-7 w-full" onClick={() => void logout()}><LogOut size={17} className="mr-2"/>Sign out</Button>
  </AppShell>
}
