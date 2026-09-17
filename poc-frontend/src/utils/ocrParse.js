/**
 * Label field extraction — ported line-for-line from the backend's
 * utils/ocr.py, which was calibrated against 4 real Shockwave Medical IVL
 * console labels. Keep this in sync with that file if the patterns change.
 *
 * Real-world finding #1: these labels have NO "MFG:" text label — the
 * manufacture date sits directly beneath "SN", inside the same shaded box
 * as the serial, marked only by a pictogram icon that OCR cannot read as
 * text. So manufacturing-date extraction relies primarily on finding a bare
 * YYYY-MM(-DD) date positioned near the SN block, not a text label.
 *
 * Real-world finding #2: a same-line "SN 53941" assumption breaks on actual
 * phone photos. The label is a dense grid of icon boxes + address blocks +
 * hazard pictograms; Tesseract's page segmentation frequently reorders text
 * from that layout, so the label word and its value often land on different
 * OCR lines even though they're on the same physical row. Fields are
 * therefore searched line-by-line with a small look-ahead, not as a single
 * "label immediately followed by value" regex on the raw string. This also
 * fixed a real failure where, with no SN value found nearby, a fallback
 * scan of "anything alnum with both a letter and a digit" grabbed the
 * manufacturer's Irish postal code (EC REP address, "D18 X5R3") instead of
 * the real serial — that fallback is now restricted to a window near the
 * SN label and skips lines that look like address/company text.
 */

const SERIAL_LABEL = /(?:SERIAL(?:\s*(?:NO|NUMBER))?|S\s?\/?\s?N)\b\s*[:.\-#]?\s*(.*)$/i
const REF_LABEL = /(?:REF(?:ERENCE)?|CAT(?:ALOG(?:UE)?)?(?:\s*NO)?)\b\s*[:.\-#]?\s*(.*)$/i
// Explicit label case — kept for manufacturers who DO print "MFG:"/"Manufactured"
const MFG_LABEL = /(?:MFG|MFD|MANUF(?:ACTURED|ACTURING)?(?:\s*(?:DATE|ON))?|DATE\s*OF\s*MANUFACTURE|DOM)\b\s*[:.\-]?\s*(.*)$/i

const VALUE_TOKEN = /\b[A-Z0-9][A-Z0-9\-/]{2,}\b/i
const BARE_DATE = /\b(20\d{2})[\-/.]([01]?\d)(?:[\-/.]([0-3]?\d))?\b/
const MONTH_DATE = /\b([A-Z]{3,9})\s*[\-/. ]?\s*(\d{4})\b/i

// Lines carrying these words are manufacturer/EC-REP address blocks, not the
// SN/REF value block — skip them when scanning nearby lines for a value so
// a postal code or building number is never mistaken for the serial.
const ADDRESS_LINE = /\b(DUBLIN|IRELAND|COUNTY|LEOPARDSTOWN|BUSINESS|PARK|LIMITED|LTD|DRIVE|STREET|ROAD|CLARA|SANTA|ROSS|BETSY|REP|ICON|INC|INDIA|INDUSTRIAL|inc\.)\b/i

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

function splitLines(text) {
  return (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * Find a label (e.g. "SN") anywhere in the line array, then look for a
 * value matching `valuePattern` — first in the remainder of that same line,
 * then in the following `lookahead` lines (skipping ones that look like an
 * address block). This tolerates the label and value landing on separate
 * OCR lines, which is the common case for this label's layout.
 */
function findNear(lines, labelPattern, valuePattern, lookahead = 2) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelPattern)
    if (!m) continue

    const sameLineRest = m[1] || ''
    const sameLineHit = sameLineRest.match(valuePattern)
    if (sameLineHit) return { value: sameLineHit[0], lineIndex: i }

    for (let j = i + 1; j <= Math.min(i + lookahead, lines.length - 1); j++) {
      if (ADDRESS_LINE.test(lines[j])) continue
      const hit = lines[j].match(valuePattern)
      if (hit) return { value: hit[0], lineIndex: j }
    }
  }
  return null
}

export function parseFields(text) {
  const t = text || ''
  const lines = splitLines(t)

  const serialHit = findNear(lines, SERIAL_LABEL, VALUE_TOKEN)
  let serial = serialHit ? serialHit.value : null

  const refHit = findNear(lines, REF_LABEL, VALUE_TOKEN)
  const ref = refHit ? refHit.value : null

  let mfgRaw = null
  const mfgLabelHit = findNear(lines, MFG_LABEL, /.+/, 1)
  if (mfgLabelHit) {
    const dateInValue = mfgLabelHit.value.match(BARE_DATE) || mfgLabelHit.value.match(MONTH_DATE)
    if (dateInValue) mfgRaw = dateInValue[0]
  }

  if (!mfgRaw) {
    // No text label on real hardware — the date sits on the line right
    // after (or on) the SN row, inside the same box. Search near the SN
    // label first so a compliance/standards footer elsewhere on the label
    // isn't mistaken for the manufacture date.
    if (serialHit) {
      for (let j = serialHit.lineIndex; j <= Math.min(serialHit.lineIndex + 2, lines.length - 1); j++) {
        const m = lines[j].match(BARE_DATE)
        if (m) { mfgRaw = m[0]; break }
      }
    }
    if (!mfgRaw) {
      const m = t.match(BARE_DATE)
      if (m) mfgRaw = m[0]
    }
  }

  if (!serial) {
    // Last-resort fallback: scan for a standalone value token near wherever
    // "SN" appears (even if findNear's stricter label match failed). This
    // is deliberately anchored — it only runs when "SN" was actually found
    // somewhere in the OCR text. Guessing with no anchor at all (e.g.
    // "longest token anywhere on the label") was tried and is unsafe: with
    // no SN/REF block legible, it confidently returned the brand name
    // ("SHOCKWAVE") as the serial instead of leaving the field for the
    // engineer to fill in — a wrong auto-fill is worse than an empty one,
    // since it can silently corrupt the console's registered identity.
    // Candidates must contain a digit (a serial can be pure digits, like
    // "53941", but is never a plain dictionary/brand word), and
    // address/company lines are excluded so a postal code isn't picked up.
    const snIdx = lines.findIndex((l) => /\bS\s?\/?\s?N\b/i.test(l) && !ADDRESS_LINE.test(l))
    if (snIdx >= 0) {
      const searchLines = lines.slice(snIdx, Math.min(snIdx + 3, lines.length))
      for (const line of searchLines) {
        if (ADDRESS_LINE.test(line)) continue
        const candidates = (line.toUpperCase().match(VALUE_TOKEN) || [])
          .filter((c) => /\d/.test(c))
          .filter((c) => !ref || c !== ref.toUpperCase())
          .filter((c) => !/^(SN|REF|MFG|MFD|EC|LR|CE|MD)$/.test(c))
        if (candidates.length) {
          serial = candidates.reduce((a, b) => (b.length > a.length ? b : a))
          break
        }
      }
    }
  }

  return {
    serial_number: serial,
    ref_number: ref,
    mfg_date_raw: mfgRaw,
    mfg_date: normalizeMfgDate(mfgRaw),
  }
}
