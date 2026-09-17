/**
 * Label field extraction — ported line-for-line from the backend's
 * utils/ocr.py, which was calibrated against 4 real Shockwave Medical IVL
 * console labels. Keep this in sync with that file if the patterns change.
 *
 * Real-world finding: these labels have NO "MFG:" text label — the
 * manufacture date sits directly beneath "SN", inside the same shaded box
 * as the serial, marked only by a pictogram icon that OCR cannot read as
 * text. So manufacturing-date extraction relies primarily on finding a bare
 * YYYY-MM(-DD) date positioned near the SN block, not a text label.
 */

const SERIAL_LABELLED = /(?:SERIAL(?:\s*(?:NO|NUMBER))?|S\/?N)\s*[:.\-#]?\s*([A-Z0-9][A-Z0-9\-/]{2,})/i
const REF_LABELLED = /(?:REF(?:ERENCE)?|CAT(?:ALOG(?:UE)?)?(?:\s*NO)?)\s*[:.\-#]?\s*([A-Z0-9][A-Z0-9\-/]{2,})/i
// Explicit label case — kept for manufacturers who DO print "MFG:"/"Manufactured"
const MFG_LABELLED = /(?:MFG|MFD|MANUF(?:ACTURED|ACTURING)?(?:\s*(?:DATE|ON))?|DATE\s*OF\s*MANUFACTURE|DOM)\s*[:.\-]?\s*([0-9]{1,4}[\-/. ][0-9]{1,4}(?:[\-/. ][0-9]{1,4})?|[A-Z]{3,9}\s*[\-/. ]?\s*[0-9]{4})/i
// Bare date, no label — this is the primary path on real hardware
const BARE_DATE = /\b(20\d{2})[\-/.]([01]?\d)(?:[\-/.]([0-3]?\d))?\b/

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function normalizeMfgDate(raw) {
  if (!raw) return null
  const s = raw.trim()

  const monthName = s.match(/^([A-Za-z]{3,9})\s*[\-/. ]?\s*(\d{4})$/)
  if (monthName) {
    const mon = monthName[1].slice(0, 3).toLowerCase()
    if (MONTHS[mon]) return `${monthName[2]}-${MONTHS[mon]}`
  }

  const parts = s.split(/[\-/. ]+/).filter(Boolean)

  if (parts.length >= 2 && parts[0].length === 4 && /^\d+$/.test(parts[0])) {
    const mm = parseInt(parts[1], 10)
    if (/^\d+$/.test(parts[1]) && mm >= 1 && mm <= 12) {
      return `${parts[0]}-${String(mm).padStart(2, '0')}`
    }
  }

  if (parts.length === 2 && parts[1].length === 4 && /^\d+$/.test(parts[1])) {
    const mm = parseInt(parts[0], 10)
    if (/^\d+$/.test(parts[0]) && mm >= 1 && mm <= 12) {
      return `${parts[1]}-${String(mm).padStart(2, '0')}`
    }
  }
  if (parts.length === 3 && parts[2].length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const mm = parseInt(parts[1], 10)
    if (mm >= 1 && mm <= 12) return `${parts[2]}-${String(mm).padStart(2, '0')}`
  }

  return null
}

function first(pattern, text) {
  const m = text.match(pattern)
  return m ? m[1].trim() : null
}

export function parseFields(text) {
  const t = text || ''
  let serial = first(SERIAL_LABELLED, t)
  const ref = first(REF_LABELLED, t)

  let mfgRaw = first(MFG_LABELLED, t)

  if (!mfgRaw) {
    // No text label on real hardware — prefer a bare date positioned near
    // the SN block over one found anywhere else, since a standards/
    // compliance footer (AAMI/IEC/CSA references) can otherwise be the
    // nearest thing that looks date-shaped.
    const snMatch = t.match(SERIAL_LABELLED)
    const searchFrom = snMatch ? snMatch.index + snMatch[0].length : 0
    const window = t.slice(searchFrom, searchFrom + 60)
    const m = window.match(BARE_DATE) || t.match(BARE_DATE)
    if (m) mfgRaw = m[0]
  }

  if (!serial) {
    const candidates = (t.toUpperCase().match(/\b[A-Z0-9][A-Z0-9\-/]{5,}\b/g) || [])
      .filter((c) => /\d/.test(c) && /[A-Z]/.test(c))
      .filter((c) => !ref || c !== ref.toUpperCase())
    if (candidates.length) {
      serial = candidates.reduce((a, b) => (b.length > a.length ? b : a))
    }
  }

  return {
    serial_number: serial,
    ref_number: ref,
    mfg_date_raw: mfgRaw,
    mfg_date: normalizeMfgDate(mfgRaw),
  }
}
