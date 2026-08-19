import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'

function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError') return 'Camera access was denied. Enable camera permission for this site in your browser settings, then try again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is already in use by another app. Close it and try again.'
  return 'Camera access was unavailable. Check browser permissions and try again.'
}

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null); const [error, setError] = useState('')
  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let controls: { stop(): void } | undefined
    let cancelled = false
    ;(async () => {
      try {
        controls = await reader.decodeFromVideoDevice(undefined, video.current!, result => {
          if (result && !cancelled) { controls?.stop(); onDetected(result.getText()) }
        })
      } catch (reason) { if (!cancelled) setError(cameraErrorMessage(reason)) }
    })()
    return () => { cancelled = true; controls?.stop() }
  }, [onDetected])
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 p-5 text-white">
    <header className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Camera size={20}/> Scan barcode</span><button onClick={onClose} aria-label="Close scanner"><X /></button></header>
    <div className="my-auto overflow-hidden rounded-3xl border-2 border-brand-500 bg-black"><video ref={video} className="aspect-[3/4] w-full object-cover" /></div>
    {error && <p className="mt-4 rounded-xl bg-red-950 p-3 text-sm text-red-300">{error}</p>}
    <Button className="mt-4" variant="secondary" onClick={onClose}>{error ? 'Enter UPC manually instead' : 'Cancel'}</Button>
  </div>
}
