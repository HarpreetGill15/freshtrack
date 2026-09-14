import JsBarcode from 'jsbarcode'
import { useEffect, useRef, useState } from 'react'

/**
 * Renders a scannable barcode from the product's stored UPC (RF/handheld scanners read this
 * straight off the screen — useful when the physical shelf label is missing or damaged). Sized
 * generously (thick bars, tall) since a small barcode is the #1 reason a laser/imager scanner
 * fails to pick one up off a phone screen.
 *
 * Tries true UPC-A symbology first, but that format validates the 12th digit as a checksum and
 * throws if it doesn't match — and this catalogue's UPCs come from leading-zero-padding heuristics
 * on import (see product-import-page.tsx), not all of them recomputed checksums, so a real product
 * can easily fail that validation. Falls back to CODE128 (no checksum requirement, still reads on
 * any RF gun) so a scannable barcode always renders; plain text is the last resort.
 */
export function Barcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!svgRef.current) return
    const options = { width: 3, height: 90, fontSize: 18, margin: 12, background: '#ffffff', lineColor: '#0f172a' }
    try {
      JsBarcode(svgRef.current, value, { ...options, format: 'UPC' })
      setFailed(false)
    } catch {
      try {
        JsBarcode(svgRef.current, value, { ...options, format: 'CODE128' })
        setFailed(false)
      } catch {
        setFailed(true)
      }
    }
  }, [value])

  if (failed) return <p className="rounded-xl bg-slate-50 p-3 text-center font-mono text-sm text-slate-600">{value}</p>
  return <div className="overflow-x-auto rounded-xl bg-white p-2"><svg ref={svgRef} className="mx-auto"/></div>
}
