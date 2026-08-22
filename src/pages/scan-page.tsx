import { AlertCircle, CheckCircle2, Minus, Plus, Search, ScanLine, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ActiveCheckBanner } from '../components/active-check-banner'
import { AppShell } from '../components/app-shell'
import { BarcodeScanner } from '../components/barcode-scanner'
import { Button } from '../components/ui/button'
import { addOrIncrementCodeDate, findProductByUpc, saveScannedProduct } from '../services/product-service'
import { activeCodeDateCheckId } from '../services/code-date-check-service'
import type { Product } from '../types/domain'

export function ScanPage() {
  const [scanning, setScanning] = useState(false); const [wasCameraScan, setWasCameraScan] = useState(false)
  const [upc, setUpc] = useState(''); const [manualDescription, setManualDescription] = useState(''); const [notFound, setNotFound] = useState(false); const [loading, setLoading] = useState(false); const [message, setMessage] = useState('')
  const [product, setProduct] = useState<Product | null>(null)
  const [expiry, setExpiry] = useState(''); const [quantity, setQuantity] = useState(1); const [saving, setSaving] = useState(false); const [savedMessage, setSavedMessage] = useState(''); const [saveError, setSaveError] = useState('')
  const upcInputRef = useRef<HTMLInputElement>(null); const dateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (product) dateInputRef.current?.focus() }, [product])

  const lookup = useCallback(async (rawUpc: string, fromCamera: boolean) => {
    const code = rawUpc.trim(); if (!code) return
    setWasCameraScan(fromCamera); setScanning(false); setLoading(true); setNotFound(false); setSavedMessage(''); setMessage('Searching product catalogue…'); setUpc(code)
    try {
      const existing = await findProductByUpc(code)
      if (existing) { setProduct(existing); setMessage(''); return }
      setNotFound(true); setMessage('Not in the catalogue yet. Add a description to create it.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Product lookup failed. Check your connection and try again.') } finally { setLoading(false) }
  }, [])

  async function createManually(event: React.FormEvent) { event.preventDefault(); if (!upc || !manualDescription.trim()) return; setLoading(true); try { const created = await saveScannedProduct({ upc, name: manualDescription.trim(), description: manualDescription.trim() }, wasCameraScan); setProduct(created); setNotFound(false); setMessage('') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not create product.') } finally { setLoading(false) } }

  async function saveDate(andNext: boolean) {
    const codeDateCheckId = activeCodeDateCheckId()
    if (!product || !codeDateCheckId) { setSaveError('Start a Code Date Check before adding an expiration date.'); return }
    if (!expiry) { setSaveError('Enter an expiration date.'); return }
    setSaving(true); setSaveError('')
    const offline = !navigator.onLine
    try {
      const result = await addOrIncrementCodeDate({ productId: product.id, codeDateCheckId, expirationDate: new Date(`${expiry}T12:00:00`), quantity })
      setSavedMessage(offline ? 'Saved locally — waiting for connection.' : result.merged ? `Added to existing date — now qty ${result.quantity}.` : 'Saved.')
      setQuantity(1); setExpiry('')
      if (andNext) {
        setProduct(null); setUpc(''); setManualDescription('')
        if (wasCameraScan) setScanning(true)
        else setTimeout(() => upcInputRef.current?.focus(), 0)
      } else {
        dateInputRef.current?.focus()
      }
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : 'Could not save expiration date. It has not been recorded — please try again.') } finally { setSaving(false) }
  }

  function startScanner() { setMessage(''); setNotFound(false); setManualDescription(''); setProduct(null); setScanning(true) }

  if (!activeCodeDateCheckId()) return <Navigate to="/checks/new" replace />

  if (product) {
    return <AppShell>
      <button onClick={() => { setProduct(null); setMessage('') }} className="text-sm font-semibold text-brand-600">← Scan a different item</button>
      <ActiveCheckBanner/>
      {!navigator.onLine && <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><WifiOff size={16} className="shrink-0"/>No connection — saves will queue locally and sync automatically.</p>}
      <section className="mt-4 rounded-2xl bg-white p-5 shadow-card">
        <div className="flex gap-4">
          {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-20 w-20 rounded-xl object-cover"/> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-brand-50 text-2xl">🥫</div>}
          <div className="min-w-0"><h2 className="text-lg font-bold leading-tight">{product.name}</h2>{product.description && product.description !== product.name && <p className="mt-1 truncate text-sm text-slate-600">{product.description}</p>}<p className="mt-1 text-xs text-slate-500">UPC: {product.upc || product.barcode}{product.subDepartment ? ` · ${product.subDepartment}` : ''}</p><Link to={`/products/${encodeURIComponent(product.id)}`} className="mt-1 inline-block text-xs font-semibold text-brand-600">View full history</Link></div>
        </div>
      </section>
      <form className="mt-4 rounded-2xl bg-brand-50 p-4" onSubmit={e => { e.preventDefault(); void saveDate(true) }}>
        <label className="text-sm font-medium">Expiration date<input ref={dateInputRef} className="mt-1 w-full rounded-xl border bg-white p-3 text-base" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} required /></label>
        <label className="mt-3 block text-sm font-medium">Quantity</label>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" aria-label="Decrease quantity" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border bg-white text-lg font-bold text-slate-700 active:bg-slate-100" onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={18}/></button>
          <input className="w-full rounded-xl border bg-white p-3 text-center text-lg font-bold" type="number" min="1" inputMode="numeric" value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))} onFocus={e => e.target.select()} required />
          <button type="button" aria-label="Increase quantity" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border bg-white text-lg font-bold text-slate-700 active:bg-slate-100" onClick={() => setQuantity(q => q + 1)}><Plus size={18}/></button>
        </div>
        {saveError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
        {savedMessage && <p className="mt-3 flex items-center gap-2 rounded-xl bg-brand-100 p-3 text-sm text-brand-800"><CheckCircle2 size={16}/>{savedMessage}</p>}
        <div className="mt-4 flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" disabled={saving} onClick={() => void saveDate(false)}>{saving ? 'Saving…' : '+ Add another date'}</Button>
          <Button className="flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save & scan next'}</Button>
        </div>
      </form>
    </AppShell>
  }

  return <AppShell>
    <div className="flex items-start justify-between"><div><h2 className="text-2xl font-bold">Scan product</h2><p className="mt-1 text-sm text-slate-500">Scan a UPC to add an expiration date.</p></div><Button onClick={startScanner}><ScanLine size={17} className="mr-2"/>Scan</Button></div>
    <ActiveCheckBanner/>
    {!navigator.onLine && <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><WifiOff size={16} className="shrink-0"/>No connection — Firebase catalogue lookups and saves still work from the local cache and will sync automatically.</p>}
    <section className="mt-7 rounded-3xl bg-brand-50 p-7 text-center"><ScanLine className="mx-auto text-brand-600" size={38}/><p className="mt-4 font-semibold">Ready to scan</p><p className="mt-1 text-sm text-slate-500">Use the phone camera or enter a UPC manually.</p><Button className="mt-5" onClick={startScanner} disabled={loading}>Open camera</Button></section>
    <form className="mt-6" onSubmit={event => { event.preventDefault(); void lookup(upc, false) }}>
      <label className="text-sm font-medium">Enter UPC manually<div className="relative mt-1"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input ref={upcInputRef} className="w-full rounded-xl border bg-white py-3 pl-10 pr-3 text-base" value={upc} onChange={event => setUpc(event.target.value)} placeholder="e.g. 012345678901" inputMode="numeric" required /></div></label>
      <Button className="mt-3 w-full" variant="secondary" disabled={loading}>{loading ? 'Looking up…' : 'Look up product'}</Button>
    </form>
    {message && <p className={`mt-5 flex gap-2 rounded-xl p-3 text-sm ${notFound ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700'}`}><AlertCircle size={17} className="shrink-0"/>{message}</p>}
    {notFound && <form onSubmit={createManually} className="mt-5 rounded-2xl bg-white p-5 shadow-card"><h3 className="font-bold">Create product manually</h3><label className="mt-4 block text-sm font-medium">Product description<input className="mt-1 w-full rounded-xl border p-3 text-base" value={manualDescription} onChange={event => setManualDescription(event.target.value)} placeholder="Enter product description" required /></label><Button className="mt-4 w-full" disabled={loading}>{loading ? 'Saving…' : 'Save and add date'}</Button></form>}
    {scanning && <BarcodeScanner onDetected={code => void lookup(code, true)} onClose={() => setScanning(false)} />}
  </AppShell>
}
