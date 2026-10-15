import { Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BottomSheet } from './bottom-sheet'
import { Button } from './ui/button'
import { getStoreEmails, parseEmails, previewEmails, saveStoreEmails, sendTestEmails, type EmailPreview, type SendResult } from '../services/reminder-settings-service'

/**
 * Settings → Daily emails. Every morning at 7 AM each department (Grocery, Dairy, Meat, Produce)
 * gets its own printable checklist, sent to the store email — only on days with something due.
 * Preview shows today's emails without sending; Send test sends them now with "[Test]" in the subject.
 */
export function DailyEmailsCard() {
  const [text, setText] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'test' | null>(null)
  const [message, setMessage] = useState('')
  const [previews, setPreviews] = useState<EmailPreview[] | null>(null)
  const [viewing, setViewing] = useState<EmailPreview | null>(null)
  const [results, setResults] = useState<SendResult[] | null>(null)

  useEffect(() => {
    getStoreEmails().then(emails => setText(emails.join('\n'))).catch(e => { setText(''); setMessage(e instanceof Error ? e.message : 'Could not load the store email.') })
  }, [])

  async function save() {
    if (text == null) return
    const { valid, invalid } = parseEmails(text)
    if (invalid.length) { setMessage(`This doesn't look like an email address: ${invalid.join(', ')}`); return }
    setSaving(true); setMessage('')
    try { await saveStoreEmails(valid); setText(valid.join('\n')); setMessage('Saved.') }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save.') }
    finally { setSaving(false) }
  }

  async function preview() {
    setBusy('preview'); setMessage(''); setResults(null)
    try { setPreviews(await previewEmails()) } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not load the preview.') } finally { setBusy(null) }
  }

  async function sendTest() {
    if (!window.confirm('Send today\'s department emails to the store email now? The subject will start with [Test].')) return
    setBusy('test'); setMessage(''); setPreviews(null)
    try { setResults(await sendTestEmails()) } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not send.') } finally { setBusy(null) }
  }

  return <article className="rounded-2xl bg-white p-4">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700"><Mail size={19}/></span><div><p className="font-bold">Daily emails</p><p className="text-sm text-muted">A printable list for each department, sent to the store email at 7 AM — only on days with something due.</p></div></div>
    {text == null ? <p className="mt-3 text-sm text-muted">Loading…</p> : <>
      <label className="mt-4 block">
        <span className="font-bold">Store email</span>
        <span className="block text-sm text-muted">Add more than one on separate lines if needed.</span>
        <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="store@example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" className="mt-1 w-full rounded-xl border-2 border-line px-3 py-2 text-base" />
      </label>
      <Button className="mt-3 w-full" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save store email'}</Button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy != null} onClick={() => void preview()}>{busy === 'preview' ? 'Loading…' : 'Preview today'}</Button>
        <Button variant="secondary" disabled={busy != null} onClick={() => void sendTest()}>{busy === 'test' ? 'Sending…' : 'Send test now'}</Button>
      </div>
    </>}
    {message && <p role="status" className="mt-3 text-sm font-bold text-muted">{message}</p>}

    {previews && <ul className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">{previews.map(p => <li key={p.list} className="flex min-h-14 items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1"><span className="block font-bold">{p.list}</span><span className="block truncate text-sm text-muted">{p.count ? `${p.count} item${p.count === 1 ? '' : 's'}` : 'Nothing due — no email today'}</span></span>
      {p.count > 0 && <button type="button" onClick={() => setViewing(p)} className="min-h-11 shrink-0 px-2 text-sm font-bold text-brand-600">View</button>}
    </li>)}</ul>}

    {results && <ul className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">{results.map(r => <li key={r.list} className="px-3 py-2.5 text-sm">
      <span className="font-bold">{r.list}: </span>{r.sent ? <span className="text-brand-700">sent to {r.to.join(', ')}</span> : <span className="text-muted">not sent — {r.reason}</span>}
    </li>)}</ul>}

    {viewing && <BottomSheet label="Email preview" title={viewing.subject} subtitle={viewing.to.length ? `To ${viewing.to.join(', ')}` : 'No store email set yet'} onClose={() => setViewing(null)}>
      <iframe title="Email preview" srcDoc={viewing.html} sandbox="" className="h-[60vh] w-full rounded-xl border border-hairline bg-white" />
    </BottomSheet>}
  </article>
}
