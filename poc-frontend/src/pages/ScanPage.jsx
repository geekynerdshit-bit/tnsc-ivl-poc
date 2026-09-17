import React, { useState, useEffect, useRef } from 'react'
import { getConsole, submitScan } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import ScanResult from '../components/ScanResult'

/**
 * Field workflow, in the order required:
 *
 *   1. GPS is captured IMMEDIATELY on tap, before anything else and before the
 *      engineer can interact with the form. Location must reflect where the tag
 *      was actually tapped, not where the phone ended up minutes later.
 *   2. Register site — ONLY on this console's first scan, when no hospital/
 *      GPS point is on file yet: hospital, city, pincode. This becomes the
 *      console's permanent site record and this scan's GPS becomes its
 *      approved point; neither is asked again on later visits.
 *   3. Site detail — department, floor and room are captured fresh on
 *      EVERY visit (a console can move rooms within the same hospital,
 *      which the GPS geo-fence can't see).
 *   4. Engineer detail, then submit.
 *
 *   Every field is mandatory except notes — this is the audit record for a
 *   real medical asset, so a partial visit is not accepted. GPS is the one
 *   exception: a denied/unavailable location still lets the visit through
 *   as NO_GPS, since blocking submission entirely on a hardware/permission
 *   failure would lose the visit record rather than just its geo-verification.
 *
 *   Console identity (serial/REF/mfg date) is pre-seeded by an admin on the
 *   console record and shown read-only above — it is not captured from the
 *   engineer here. Photo capture + OCR-based identity verification are
 *   shelved for now (see CameraCapture.jsx / tesseractOcr.js, kept but
 *   unused) pending better real-world OCR accuracy; this can come back
 *   later without rebuilding the identity plumbing on the backend.
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

  // Site registration — only collected on this console's first scan
  const [hospital, setHospital] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')

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

  // ---- tag + immediate GPS ------------------------------------------------
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
        // Pre-filled from the last visit — most visits are to the same
        // room, so this saves retyping. Safe to do because the backend now
        // flags a real edit away from this pre-fill as a "location changed"
        // event (see ScanResult's callout and the dashboard) — so a genuine
        // move is still surfaced explicitly, it just isn't forced through
        // empty-field friction on every single visit.
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
  const isSiteRegistered = Boolean(consoleData?.is_site_registered)

  // Every field is mandatory except notes — this is the audit record, so a
  // partial visit isn't acceptable. Single source of truth for both the
  // submit-button gate and the "still needed" hint below.
  const missing = []
  if (!isSiteRegistered) {
    if (!hospital.trim()) missing.push('hospital name')
    if (!city.trim()) missing.push('city')
  }
  if (!department.trim()) missing.push('department')
  if (!floor.trim()) missing.push('floor')
  if (!roomName.trim()) missing.push('room')
  if (!userName.trim()) missing.push('engineer name')
  if (!userMobile.trim()) missing.push('mobile number')

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
        hospital: !isSiteRegistered ? hospital.trim() || null : null,
        city: !isSiteRegistered ? city.trim() || null : null,
        pincode: !isSiteRegistered ? pincode.trim() || null : null,
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
      {/* Console identity — pre-seeded by an admin, shown read-only */}
      <div className="scan-card">
        <div className="scan-eyebrow">
          {consoleData.id}
          <span className={`chip ${isRegistered ? 'chip-ok' : 'chip-new'}`}>
            {isRegistered ? 'Registered' : 'Not yet registered'}
          </span>
        </div>
        {isSiteRegistered ? (
          <>
            <h1>{consoleData.hospital}</h1>
            <p className="scan-sub">
              {consoleData.city}{consoleData.pincode ? ` — ${consoleData.pincode}` : ''}
            </p>
          </>
        ) : (
          <h1>New console</h1>
        )}
        {isRegistered ? (
          <div className="known-identity">
            <div><span>Serial number</span><b>{consoleData.serial_number}</b></div>
            {consoleData.ref_number && <div><span>REF</span><b>{consoleData.ref_number}</b></div>}
            {consoleData.mfg_date && <div><span>Mfg date</span><b>{consoleData.mfg_date}</b></div>}
            {(consoleData.current_department || consoleData.current_floor || consoleData.current_room) && (
              <div>
                <span>Last recorded at</span>
                <b>
                  {[consoleData.current_department, consoleData.current_floor, consoleData.current_room]
                    .filter(Boolean).join(' · ')}
                </b>
              </div>
            )}
          </div>
        ) : (
          <div className="scan-alert warn">
            No serial/REF/mfg date on file for this console yet. Location and
            visit detail will still be recorded — ask an admin to register
            its identity.
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
          <div className="step-body">
            <p>
              Location captured{gps.accuracy ? ` — accurate to within ${Math.round(gps.accuracy)} m` : ''}.
            </p>
            {gps.accuracy > 150 && (
              <p className="gps-warn">
                That's a rough fix. For a tighter reading, stand closer to a window or step outside, then retake the visit.
              </p>
            )}
            <details className="coords-toggle">
              <summary>Show coordinates</summary>
              <p className="mono-sm">{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</p>
            </details>
          </div>
        )}
        {gpsState === 'denied' && (
          <div className="scan-alert warn">
            Location access denied. The visit will be recorded but cannot be geo-verified.
          </div>
        )}
      </div>

      {/* Step 2 — register the site (only if not already on file) */}
      {!isSiteRegistered && (
        <div className="step">
          <div className="step-head">
            <span className="step-num">2</span>
            <span className="step-title">Register site</span>
          </div>
          <div className="step-body">
            <div className="scan-alert warn">
              No hospital is on file for this console yet. This will become
              its permanent site record, and your current location the
              approved point for future visits.
            </div>
            <label className="field">
              <span>Hospital name <em className="req">*</em></span>
              <input value={hospital} onChange={(e) => setHospital(e.target.value)}
                     placeholder="e.g. Apollo Hospital Indraprastha" />
            </label>
            <div className="field-row">
              <label className="field">
                <span>City <em className="req">*</em></span>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. New Delhi" />
              </label>
              <label className="field">
                <span>Pincode <i>(optional)</i></span>
                <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="e.g. 110076" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — site detail for this visit */}
      <div className="step">
        <div className="step-head">
          <span className="step-num">{isSiteRegistered ? 2 : 3}</span>
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

      {/* Step 4 — who is recording it */}
      <div className="step">
        <div className="step-head">
          <span className="step-num">{isSiteRegistered ? 3 : 4}</span>
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

      {error && <div className="scan-alert danger">{error}</div>}

      <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={!canSubmit}>
        {submitting ? 'Recording...' : 'Record Visit'}
      </button>

      {missing.length > 0 && (
        <p className="hint center">Still needed: {missing.join(', ')}.</p>
      )}
    </div>
  )
}
