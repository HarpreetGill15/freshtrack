import { AlertCircle, ArrowLeft, CheckCircle2, Minus, Plus, ScanLine, Search, WifiOff } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { addOrIncrementCodeDate, codeDateDetails, findProductByUpc, saveScannedProduct } from '../services/product-service'
import { activeCodeDateCheckId, getActiveCodeDateCheck } from '../services/code-date-check-service'
import { addDays, fromInputDate, inputDate } from '../lib/dates'
import type { CodeDateCheck, Product } from '../types/domain'

// The barcode reader library is fetched in the background as soon as this page opens (see the
// effect below), so it's ready by the time someone taps Scan — but it isn't part of the first download.
const loadScanner = () => import('../components/barcode-scanner')
const BarcodeScanner = lazy(async () => ({ default: (await loadScanner()).BarcodeScanner }))

export function ScanPage() {
  const [check, setCheck] = useState<CodeDateCheck | null>(null)
  const [scanning, setScanning] = useState(false); const [wasCameraScan, setWasCameraScan] = useState(false)
  const [upc, setUpc] = useState(''); const [manualDescription, setManualDescription] = useState(''); const [notFound, setNotFound] = useState(false); const [loading, setLoading] = useState(false); const [message, setMessage] = useState('')
  const [product, setProduct] = useState<Product | null>(null)
  const [expiry, setExpiry] = useState(''); const [lastExpiry, setLastExpiry] = useState('')
  const [quantity, setQuantity] = useState(1); const [saving, setSaving] = useState(false); const [savedMessage, setSavedMessage] = useState(''); const [saveError, setSaveError] = useState('')
  const upcInputRef = useRef<HTMLInputElement>(null); const dateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void loadScanner().catch(() => undefined) }, [])
  useEffect(() => { void getActiveCodeDateCheck().then(setCheck).catch(() => setCheck(null)) }, [])
  useEffect(() => { if (product) dateInputRef.current?.focus() }, [product])

  const lookup = useCallback(async (rawUpc: string, fromCamera: boolean) => {
    const code = rawUpc.trim(); if (!code) return
    setWasCameraScan(fromCamera); setScanning(false); setLoading(true); setNotFound(false); setMessage('Searching product list…'); setUpc(code)
    try {
      const existing = await findProductByUpc(code)
      if (existing) { setProduct(existing); setMessage(''); return }
      setNotFound(true); setMessage('Not in the product list yet. Add a description to create it.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Product lookup failed. Check your connection and try again.') } finally { setLoading(false) }
  }, [])

  async function createManually(event: React.FormEvent) { event.preventDefault(); if (!upc || !manualDescription.trim()) return; setLoading(true); try { const created = await saveScannedProduct({ upc, name: manualDescription.trim(), description: manualDescription.trim() }, wasCameraScan); setProduct(created); setNotFound(false); setMessage('') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not create product.') } finally { setLoading(false) } }

  async function saveDate(andNext: boolean) {
    const codeDateCheckId = activeCodeDateCheckId()
    if (!product || !codeDateCheckId) { setSaveError('Start a check before adding an expiry date.'); return }
    if (!expiry) { setSaveError('Enter an expiry date.'); return }
    setSaving(true); setSaveError('')
    const offline = !navigator.onLine
    try {
      // Cached on the phone, so this doesn't add a network round trip to every save.
      const activeCheck = check?.id === codeDateCheckId ? check : await getActiveCodeDateCheck().catch(() => null)
      const result = await addOrIncrementCodeDate({ productId: product.id, codeDateCheckId, expirationDate: fromInputDate(expiry), quantity }, activeCheck?.id === codeDateCheckId ? codeDateDetails(product, activeCheck) : undefined)
      const name = product.name
      setSavedMessage(offline ? `Saved on this phone: ${name} · qty ${quantity}. It will sync when the connection is back.` : result.merged ? `Added to existing date: ${name} · now qty ${result.quantity}` : `Saved: ${name} · qty ${quantity}`)
      setLastExpiry(expiry); setQuantity(1); setExpiry('')
      if (andNext) {
        setProduct(null); setUpc(''); setManualDescription('')
        if (wasCameraScan) setScanning(true)
        else setTimeout(() => upcInputRef.current?.focus(), 0)
      } else {
        dateInputRef.current?.focus()
      }
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : 'Could not save the expiry date. It has not been recorded — please try again.') } finally { setSaving(false) }
  }

  function startScanner() { setMessage(''); setNotFound(false); setManualDescription(''); setProduct(null); setSavedMessage(''); setScanning(true) }

  if (!activeCodeDateCheckId()) return <Navigate to="/checks/new" replace />

  const checkLine = check ? `${check.name} · ${check.department}` : 'Check in progress'
  const savedBanner = savedMessage && <p role="status" className="mt-3 flex items-center gap-2.5 rounded-xl bg-brand-100 px-3.5 py-3 text-[15px] font-bold text-brand-700"><CheckCircle2 size={20} className="shrink-0" aria-hidden="true"/>{savedMessage}</p>
  const offlineBanner = !navigator.onLine && <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-soon"><WifiOff size={18} className="shrink-0" aria-hidden="true"/>No connection — saves stay on this phone and sync automatically.</p>

  if (product) {
    const chips = [{ label: 'Today', value: inputDate(new Date()) }, { label: 'Tomorrow', value: inputDate(addDays(1)) }, ...(lastExpiry ? [{ label: 'Same as last', value: lastExpiry }] : [])]
    return <AppShell footer={<div className="space-y-2.5">
      <Button className="min-h-[60px] w-full text-[19px]" disabled={saving} onClick={() => void saveDate(true)}>{saving ? 'Saving…' : 'Save & scan next'}</Button>
      <Button variant="secondary" className="w-full" disabled={saving} onClick={() => void saveDate(false)}>Save &amp; add another date for this item</Button>
    </div>}>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Scan a different item" onClick={() => { setProduct(null); setMessage('') }} className="grid h-11 w-11 place-items-center rounded-xl"><ArrowLeft size={22} /></button>
        <p className="min-w-0 truncate text-[13px] font-bold text-muted">{checkLine}</p>
      </div>
      {savedBanner}
      {offlineBanner}
      <section className="mt-3 rounded-[18px] bg-white p-4">
        <h1 className="text-[22px] font-extrabold leading-tight">{product.name}</h1>
        {product.description && product.description !== product.name && <p className="mt-1 text-sm text-muted">{product.description}</p>}
        <p className="mt-1.5 text-sm text-muted">UPC {product.upc || product.barcode}{product.subDepartment ? ` · ${product.subDepartment}` : ''}</p>
        <Link to={`/products/${encodeURIComponent(product.id)}`} state={{ from: '/scan' }} className="mt-1 inline-block py-2 text-sm font-bold text-brand-600">See other dates for this item</Link>
      </section>
      <form className="mt-3.5 space-y-3.5 rounded-[18px] bg-white p-4" onSubmit={e => { e.preventDefault(); void saveDate(true) }}>
        <label className="flex flex-col gap-1.5 text-[15px] font-bold">Expiry date
          <input ref={dateInputRef} type="date" value={expiry} onChange={e => setExpiry(e.target.value)} required className="min-h-14 rounded-2xl border-2 border-brand-600 bg-white px-4 text-xl" />
        </label>
        <div className="flex flex-wrap gap-2">
          {chips.map(chip => <button key={chip.label} type="button" onClick={() => setExpiry(chip.value)} aria-pressed={expiry === chip.value} className={`min-h-11 rounded-full border px-3.5 text-sm font-bold ${expiry === chip.value ? 'border-brand-600 bg-brand-100 text-brand-700' : 'border-line bg-ground'}`}>{chip.label}</button>)}
        </div>
        <div>
          <span className="text-[15px] font-bold" id="qty-label">Quantity</span>
          <div className="mt-1.5 grid grid-cols-[64px_minmax(0,1fr)_64px] gap-2.5">
            <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="grid h-16 place-items-center rounded-2xl border-2 border-line bg-white active:bg-ground"><Minus size={26} /></button>
            <input aria-labelledby="qty-label" type="number" min="1" inputMode="numeric" value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))} onFocus={e => e.target.select()} required className="h-16 min-w-0 rounded-2xl border-2 border-line text-center font-display text-3xl font-extrabold" />
            <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(q => q + 1)} className="grid h-16 place-items-center rounded-2xl border-2 border-line bg-white active:bg-ground"><Plus size={26} /></button>
          </div>
        </div>
        {saveError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-overdue">{saveError}</p>}
        {/* Enter on the keyboard submits as "Save & scan next"; the visible buttons sit in the footer. */}
        <button type="submit" className="sr-only">Save &amp; scan next</button>
      </form>
    </AppShell>
  }

  return <AppShell>
    <p className="text-[13px] font-bold text-muted">{checkLine}</p>
    {savedBanner}
    {offlineBanner}
    <section className="mt-3 rounded-[20px] bg-white p-6 text-center">
      <ScanLine className="mx-auto text-brand-600" size={40} aria-hidden="true" />
      <h1 className="mt-3 text-2xl font-extrabold">Scan a product</h1>
      <p className="mt-1 text-muted">Point the camera at the barcode.</p>
      <Button className="mt-5 min-h-14 w-full text-lg" onClick={startScanner} disabled={loading}>Open camera</Button>
    </section>
    <form className="mt-4 rounded-[18px] bg-white p-4" onSubmit={event => { event.preventDefault(); void lookup(upc, false) }}>
      <label className="text-[15px] font-bold" htmlFor="manual-upc">Or type the UPC</label>
      <div className="relative mt-1.5"><Search className="absolute left-3.5 top-4 text-muted" size={20} aria-hidden="true"/><input id="manual-upc" ref={upcInputRef} className="min-h-14 w-full rounded-2xl border-2 border-line bg-white pl-11 pr-3 text-lg" value={upc} onChange={event => setUpc(event.target.value)} placeholder="e.g. 068700115234" inputMode="numeric" required /></div>
      <Button className="mt-3 w-full" variant="secondary" disabled={loading}>{loading ? 'Looking up…' : 'Look up product'}</Button>
    </form>
    {message && <p className={`mt-4 flex gap-2 rounded-xl p-3 text-sm font-bold ${notFound ? 'bg-amber-50 text-soon' : 'bg-brand-100 text-brand-700'}`}><AlertCircle size={18} className="shrink-0" aria-hidden="true"/>{message}</p>}
    {notFound && <form onSubmit={createManually} className="mt-4 rounded-[18px] bg-white p-4"><h2 className="font-bold">Add this product</h2><label className="mt-3 block text-[15px] font-bold">Product description<input className="mt-1.5 min-h-14 w-full rounded-2xl border-2 border-line px-4 text-lg font-normal" value={manualDescription} onChange={event => setManualDescription(event.target.value)} placeholder="e.g. 2% Milk 4L Bag" required /></label><Button className="mt-3 w-full" disabled={loading}>{loading ? 'Saving…' : 'Save and add date'}</Button></form>}
    <Link to="/checks/finish" className="mt-4 flex min-h-12 items-center justify-center rounded-2xl text-base font-bold text-brand-600">Finish this check</Link>
    {scanning && <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950 text-sm text-white">Starting camera…</div>}><BarcodeScanner onDetected={code => void lookup(code, true)} onClose={() => setScanning(false)} /></Suspense>}
  </AppShell>
}
