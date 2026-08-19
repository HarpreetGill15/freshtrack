/**
 * Canonical UPC form used everywhere (scan lookup, manual entry, import): digits only, with
 * leading zeros stripped then re-padded to the standard 12-digit UPC-A length. This means
 * "0000000003364", "3364", and "000000003364" all normalize to the same value and match each
 * other — the exact amount of leading-zero padding on a given UPC varies a lot between how it
 * was typed, scanned, or exported from Excel (which drops leading zeros from numeric cells), so
 * treating them as equivalent is what makes lookups actually reliable in practice.
 *
 * Codes already at or beyond 12 digits (13-digit EAN-13 like "3017620422003", 14-digit ITF-14,
 * etc.) are left untouched — this only pads short values up, never truncates. One known edge case:
 * a genuine 8-digit EAN-8 code will also get padded to 12 here, since there's no reliable way to
 * distinguish "a short EAN-8" from "a UPC-A that lost its leading zeros" from the digits alone.
 * EAN-8 is rare in grocery retail; flag it if this becomes a real conflict.
 */
export function normalizeUpc(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const stripped = digits.replace(/^0+/, '') || '0'
  return stripped.length <= 12 ? stripped.padStart(12, '0') : digits
}
