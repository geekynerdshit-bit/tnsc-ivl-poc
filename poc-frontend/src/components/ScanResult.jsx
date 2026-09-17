import React from 'react'

function formatDistance(m) {
  if (m == null) return null
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

const GEO = {
  VERIFIED:     { tone: 'ok',   mark: '✓', title: 'Location Verified',
                  note: (r) => `${formatDistance(r.distance_m)} from the approved site` },
  OUTSIDE_ZONE: { tone: 'bad',  mark: '!', title: 'Outside Approved Zone',
                  note: (r) => `${formatDistance(r.distance_m)} from the approved site` },
  NO_GPS:       { tone: 'warn', mark: '?', title: 'Recorded Without GPS',
                  note: () => 'Location was unavailable, so this visit is not geo-verified' },
}

const IDENTITY = {
  REGISTERED: { tone: 'ok',   title: 'Console registered',
                note: 'This serial is now bound to the tag. Future visits are checked against it.' },
  MATCH:      { tone: 'ok',   title: 'Identity on file',
                note: 'Serial/REF/mfg date for this visit are the ones on record for this console.' },
  MISMATCH:   { tone: 'bad',  title: 'Identity does not match',
                note: 'Flagged for review. The record was NOT overwritten.' },
  NO_PHOTO:   { tone: 'warn', title: 'Identity not on file',
                note: 'No serial/REF/mfg date is registered for this console yet.' },
}

function Row({ label, children }) {
  if (children == null || children === '') return null
  return (
    <div className="res-row">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  )
}

export default function ScanResult({ result }) {
  const geo = GEO[result.geo_status] || GEO.NO_GPS
  const ident = result.identity_status ? IDENTITY[result.identity_status] : null
  const mismatched = result.mismatched_fields || []

  const site = [result.room_name, result.floor, result.department].filter(Boolean).join(' · ')

  return (
    <div className="scan-wrap">
      <div className={`res-hero ${geo.tone}`}>
        <div className="res-mark">{geo.mark}</div>
        <h2>{geo.title}</h2>
        <p>{geo.note(result)}</p>
      </div>

      {ident && (
        <div className={`scan-alert ${ident.tone === 'ok' ? 'ok' : ident.tone}`}>
          <b>{ident.title}</b>
          <p>{ident.note}</p>

          {result.identity_status === 'MISMATCH' && (
            <div className="res-diff">
              {mismatched.includes('serial_number') && (
                <div>
                  <span>Serial</span>
                  <div><i>on record</i> {result.known_serial || '—'}</div>
                  <div><i>photographed</i> {result.given_serial || '—'}</div>
                </div>
              )}
              {mismatched.includes('mfg_date') && (
                <div>
                  <span>Mfg date</span>
                  <div><i>on record</i> {result.known_mfg_date || '—'}</div>
                  <div><i>photographed</i> {result.given_mfg_date || '—'}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="scan-card">
        <Row label="Console">{result.console_id} · {result.console_name}</Row>
        <Row label="Site">{result.hospital}, {result.city}</Row>
        {site && <Row label="Room / Floor">{site}</Row>}
        {result.given_serial && <Row label="Serial">{result.given_serial}</Row>}
        {result.given_mfg_date && <Row label="Mfg date">{result.given_mfg_date}</Row>}
        {result.scanned_lat != null && (
          <Row label="GPS">{result.scanned_lat.toFixed(5)}, {result.scanned_lng.toFixed(5)}</Row>
        )}
        <Row label="Recorded">{formatTime(result.scanned_at)}</Row>
        <Row label="Engineer">{result.scanned_by || 'Unattributed'}</Row>
        <Row label="Mobile">{result.engineer_mobile}</Row>
        {result.scan_type && <Row label="Visit type">{result.scan_type}</Row>}
        {result.manual_override && <Row label="Manual correction">Yes — logged in audit trail</Row>}
        {result.notes && <Row label="Notes">{result.notes}</Row>}
      </div>

      {result.image_url && (
        <div className="scan-card">
          <div className="res-row"><span>Captured photo</span></div>
          <img src={result.image_url} alt="Captured console label" className="shot" />
        </div>
      )}

      <a href="/dashboard" className="btn btn-ghost btn-lg">View Dashboard</a>
    </div>
  )
}
