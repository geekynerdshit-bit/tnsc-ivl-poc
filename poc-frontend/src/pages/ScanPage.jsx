import React, { useState, useEffect, useRef } from 'react'
import { getConsole, submitScan } from '../api/client'
import { runLocalOcr } from '../utils/tesseractOcr'
import LoadingSpinner from '../components/LoadingSpinner'
import ScanResult from '../components/ScanResult'
import CameraCapture from '../components/CameraCapture'

/**
 * Field workflow, in the order required:
 *
 *   1. GPS is captured IMMEDIATELY on tap, before anything else and before the
 *      engineer can interact with the form. Location must reflect where the tag
 *      was actually tapped, not where the phone ended up minutes later.
 *   2. Photograph the console label (camera only — see CameraCapture).
 *   3. OCR reads serial / REF / manufacturing date; the engineer confirms or
 *      corrects them.
 *   4. Site detail — hospital is fixed on the console record; department,
 *      floor and room are captured fresh on THIS visit (a console can move
 *      rooms within the same hospital, which the GPS geo-fence can't see).
 *   5. Engineer detail, then submit.
 *
 *   Every field is mandatory except notes — this is the audit record for a
 *   real medical asset, so a partial visit is not accepted. GPS is the one
 *   exception: a denied/unavailable location still lets the visit through
 *   as NO_GPS, since blocking submission entirely on a hardware/permission
 *   failure would lose the visit record rather than just its geo-verification.
 *
 *   First visit registers the identity against the tag. Later visits verify
 *   it and flag any mismatch for a human — the record is never silently
 *   overwritten.
 */
export default function ScanPage() {
  const [tag, setTag] = useState(null)

  const [consoleData, setConsoleData] = useState(null)
  const [consoleLoading, setConsoleLoading] = useState(false)
  const [consoleError, setConsoleError] = useState(null)

  // GPS — started on mount, never gated behind the form
  const [gps, setGps] = useState({ lat: null, lng: null, accuracy: null })
  const [gpsState, setGpsState] = useState('pending')  // pending | ok | denied
  const gpsStartedRef = useRef(false)

  // Photo + OCR
  const [photo, setPhoto] = useState(null)
  const [ocrState, setOcrState] = useState('idle')     // idle | running | done | unavailable
  const [ocrMessage, setOcrMessage] = useState(null)
  const [ocrRead, setOcrRead] = useState({ serial: null, ref: null, mfg: null, raw: null })

  // Confirmed identity values (prefilled from OCR, editable)
  const [serial, setSerial] = useState('')
  const [refNo, setRefNo] = useState('')
  const [mfgDate, setMfgDate] = useState('')
  const [overrideReason, setOverrideReason] = useState('')

  // Site + engineer detail
  const [department, setDepartment] = useState('')
  const [floor, setFloor] = useState('')
  const [roomName, setRoomName] = useState('')
  const [userName, setUserName] = useState('')
  const [userMobile, setUserMobile] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  // ---- 1. tag + immediate GPS -------------------------------------------
  useEffect(() => {
    const tagParam = new URLSearchParams(window.location.search).get('tag')
    setTag(tagParam || '')
    if (!tagParam) return

    if (!gpsStartedRef.current) {
      gpsStartedRef.current = true
      if (!navigator.geolocation) {
        setGpsState('denied')
      } else {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setGps({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            })
            setGpsState('ok')
          },
          () => setGpsState('denied'),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
      }
    }

    setConsoleLoading(true)
    getConsole(tagParam)
      .then((res) => {
        setConsoleData(res.data)
        // Prefill site detail from the console's last-known location — most
        // visits are to the same room, so this saves retyping; still editable.
        setDepartment(res.data.current_department || '')
        setFloor(res.data.current_floor || '')
        setRoomName(res.data.current_room || '')
      })
      .catch((err) => {
        setConsoleError(
          err?.response?.status === 404
            ? 'This tag is not registered in the system.'
            : 'Could not load console details. Please try again.'
        )
      })
      .finally(() => setConsoleLoading(false))
  }, [])

  const isRegistered = Boolean(consoleData?.is_registered)

  // ---- 3. OCR on capture — runs entirely in the browser, no network call --
  const handleCapture = async (dataUrl) => {
    setPhoto(dataUrl)
    setOcrState('running')
    setOcrMessage(null)
    try {
      const d = await runLocalOcr(dataUrl)
      if (!d.ocr_available) {
        setOcrState('unavailable')
        setOcrMessage(d.message || 'Automatic reading is unavailable — enter the details manually.')
        return
      }
      setOcrRead({
        serial: d.serial_number, ref: d.ref_number,
        mfg: d.mfg_date, raw: d.raw_text,
      })
      setSerial(d.serial_number || '')
      setRefNo(d.ref_number || '')
      setMfgDate(d.mfg_date || '')
      setOcrState('done')
      if (!d.serial_number && !d.mfg_date) {
        setOcrMessage('Nothing readable was found on the label. Enter the details manually or retake the photo.')
      }
    } catch {
      setOcrState('unavailable')
      setOcrMessage('Could not read the photo. Enter the details manually or retake.')
    }
  }

  const retake = () => {
    setPhoto(null)
    setOcrState('idle')
    setOcrMessage(null)
    setOcrRead({ serial: null, ref: null, mfg: null, raw: null })
    setSerial(''); setRefNo(''); setMfgDate(''); setOverrideReason('')
  }

  // Live mismatch preview against the stored record (server re-checks on submit)
  const norm = (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const serialMismatch =
    isRegistered && serial && norm(serial) !== norm(consoleData.serial_number)
  const mfgMismatch =
    isRegistered && mfgDate && consoleData.mfg_date &&
    norm(mfgDate) !== norm(consoleData.mfg_date)
  const anyMismatch = serialMismatch || mfgMismatch

  // Every field is mandatory except notes — this is the audit record, so a
  // partial visit isn't acceptable. Single source of truth for both the
  // submit-button gate and the "still needed" hint below.
  const missing = []
  if (!photo) missing.push('console photo')
  else {
    if (!serial.trim()) missing.push('serial number')
    if (!refNo.trim()) missing.push('REF number')
    if (!mfgDate.trim()) missing.push('manufacturing date')
    if (!department.trim()) missing.push('department')
    if (!floor.trim()) missing.push('floor')
    if (!roomName.trim()) missing.push('room')
    if (!userName.trim()) missing.push('engineer name')
    if (!userMobile.trim()) missing.push('mobile number')
    if (anyMismatch && !overrideReason.trim()) missing.push('mismatch explanation')
  }

  const canSubmit = missing.length === 0 && !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await submitScan({
        console_id: tag,
        scanned_lat: gps.lat,
        scanned_lng: gps.lng,
        scanned_by: userName.trim() || null,
        device_info: navigator.userAgent,
        image_base64: photo,
        ocr_serial: ocrRead.serial,
        ocr_ref: ocrRead.ref,
        ocr_mfg_date: ocrRead.mfg,
        ocr_raw_text: ocrRead.raw,
        given_serial: serial.trim() || null,
        given_ref: refNo.trim() || null,
        given_mfg_date: mfgDate.trim() || null,
        override_reason: overrideReason.trim() || null,
        department: department.trim() || null,
        floor: floor.trim() || null,
        room_name: roomName.trim() || null,
        engineer_mobile: userMobile.trim() || null,
        notes: notes.trim() || null,
      })
      setResult(res.data)
    } catch (e) {
      setError(
        e?.response?.data?.detail
          ? `Scan failed: ${e.response.data.detail}`
          : 'Scan failed — check your connection and try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ---- render states -----------------------------------------------------
  if (tag === null || consoleLoading) return <LoadingSpinner message="Loading console..." />

  if (tag === '') {
    return (
      <div className="scan-wrap">
        <div className="scan-card center">
          <h2>No console tag detected</h2>
          <p>Tap an NFC tag on a console to begin.</p>
          <p className="hint">Testing? Add <code>?tag=IVL-001</code> to the URL.</p>
        </div>
      </div>
    )
  }

  if (consoleError) {
    return (
      <div className="scan-wrap">
        <div className="scan-card center danger">
          <h2>Console not found</h2>
          <p>{consoleError}</p>
          <p className="hint">Tag ID: {tag}</p>
        </div>
      </div>
    )
  }

  if (result) return <ScanResult result={result} />

  return (
    <div className="scan-wrap">
      {/* Console identity */}
      <div className="scan-card">
        <div className="scan-eyebrow">
          {consoleData.id}
          <span className={`chip ${isRegistered ? 'chip-ok' : 'chip-new'}`}>
            {isRegistered ? 'Registered' : 'First registration'}
          </span>
        </div>
        <h1>{consoleData.hospital}</h1>
        <p className="scan-sub">
          {consoleData.city}{consoleData.pincode ? ` — ${consoleData.pincode}` : ''}
        </p>
        {isRegistered && (
          <div className="known-identity">
            <div><span>Serial on record</span><b>{consoleData.serial_number}</b></div>
            {consoleData.mfg_date && <div><span>Mfg date</span><b>{consoleData.mfg_date}</b></div>}
            {consoleData.current_room && (
              <div><span>Last known room</span><b>{consoleData.current_room}</b></div>
            )}
          </div>
        )}
      </div>

      {/* Step 1 — location, captured automatically */}
      <div className="step">
        <div className="step-head">
          <span className="step-num">1</span>
          <span className="step-title">Location</span>
          {gpsState === 'ok' && <span className="chip chip-ok">Captured</span>}
          {gpsState === 'denied' && <span className="chip chip-warn">Unavailable</span>}
        </div>
        {gpsState === 'pending' && <p className="step-body muted">Capturing your location...</p>}
        {gpsState === 'ok' && (
          <p className="step-body mono-sm">
            {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
            {gps.accuracy ? ` · ±${Math.round(gps.accuracy)} m` : ''}
          </p>
        )}
        {gpsState === 'denied' && (
          <div className="scan-alert warn">
            Location access denied. The visit will be recorded but cannot be geo-verified.
          </div>
        )}
      </div>

      {/* Step 2 — photograph the label */}
      <div className="step">
        <div className="step-head">
          <span className="step-num">2</span>
          <span className="step-title">Console photo</span>
          {photo && <span className="chip chip-ok">Captured</span>}
        </div>
        <div className="step-body">
          {!photo && <CameraCapture onCapture={handleCapture} />}
          {photo && (
            <>
              <img src={photo} alt="Captured console label" className="shot" />
              <button className="btn btn-ghost" onClick={retake} type="button">Retake photo</button>
            </>
          )}
        </div>
      </div>

      {/* Step 3 — confirm the extracted identity */}
      {photo && (
        <div className="step">
          <div className="step-head">
            <span className="step-num">3</span>
            <span className="step-title">{isRegistered ? 'Verify identity' : 'Register identity'}</span>
            {ocrState === 'done' && <span className="chip chip-ok">Read automatically</span>}
            {ocrState === 'unavailable' && <span className="chip chip-warn">Manual entry</span>}
          </div>

          <div className="step-body">
            {ocrState === 'running' && <LoadingSpinner message="Reading the label..." />}

            {ocrState !== 'running' && (
              <>
                {ocrMessage && (
                  <div className="scan-alert warn">
                    {ocrMessage}
                    {ocrRead.raw && (
                      <details className="ocr-raw">
                        <summary>Show what was detected on the photo</summary>
                        <pre>{ocrRead.raw}</pre>
                      </details>
                    )}
                  </div>
                )}

                <label className="field">
                  <span>Serial number <em className="req">*</em></span>
                  <input value={serial} onChange={(e) => setSerial(e.target.value)}
                         placeholder="e.g. 53941" autoCapitalize="characters" />
                  {serialMismatch && (
                    <em className="field-err">
                      Does not match the record ({consoleData.serial_number})
                    </em>
                  )}
                </label>

                <label className="field">
                  <span>REF / catalogue number <em className="req">*</em></span>
                  <input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="e.g. 825D" />
                </label>

                <label className="field">
                  <span>Manufacturing date <em className="req">*</em></span>
                  <input value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} placeholder="YYYY-MM" />
                  {mfgMismatch && (
                    <em className="field-err">
                      Does not match the record ({consoleData.mfg_date})
                    </em>
                  )}
                </label>

                {anyMismatch && (
                  <div className="scan-alert danger">
                    <b>Identity does not match this tag.</b>
                    <p>
                      This can be a poor photo or OCR misread — or this tag may be on a
                      different console. Explain below; the record is not overwritten and
                      the visit is flagged for review.
                    </p>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Label worn, serial re-read by hand; console is physically the same unit"
                      rows={3}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 4 — site detail for this visit */}
      {photo && (
        <div className="step">
          <div className="step-head">
            <span className="step-num">4</span>
            <span className="step-title">Site detail</span>
          </div>
          <div className="step-body">
            <label className="field">
              <span>Department <em className="req">*</em></span>
              <input value={department} onChange={(e) => setDepartment(e.target.value)}
                     placeholder="e.g. Cath Lab, Cardiology, ICU" />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Floor <em className="req">*</em></span>
                <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g. 2nd Floor" />
              </label>
              <label className="field">
                <span>Room <em className="req">*</em></span>
                <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Cath Lab 2" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Step 5 — who is recording it */}
      {photo && (
        <div className="step">
          <div className="step-head">
            <span className="step-num">5</span>
            <span className="step-title">Service engineer</span>
          </div>
          <div className="step-body">
            <label className="field">
              <span>Your name <em className="req">*</em></span>
              <input value={userName} onChange={(e) => setUserName(e.target.value)}
                     placeholder="e.g. A. Pandey" />
            </label>
            <label className="field">
              <span>Mobile number <em className="req">*</em></span>
              <input value={userMobile} onChange={(e) => setUserMobile(e.target.value)}
                     type="tel" placeholder="e.g. 98xxxxxxxx" />
            </label>
            <label className="field">
              <span>Notes <i>(optional)</i></span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Anything worth flagging about this visit" rows={2} />
            </label>
          </div>
        </div>
      )}

      {error && <div className="scan-alert danger">{error}</div>}

      <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={!canSubmit}>
        {submitting
          ? 'Recording...'
          : isRegistered ? 'Record Verification' : 'Register Console'}
      </button>

      {missing.length > 0 && (
        <p className="hint center">Still needed: {missing.join(', ')}.</p>
      )}
    </div>
  )
}
