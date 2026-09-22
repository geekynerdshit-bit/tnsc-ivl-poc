import React, { useState, useEffect } from 'react'
import { getScans, updateConsoleSite } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

function formatTime(isoString) {
  return new Date(isoString).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDistance(distance_m) {
  if (distance_m == null) return '—'
  if (distance_m < 1000) return `${Math.round(distance_m)} m`
  return `${(distance_m / 1000).toFixed(1)} km`
}

function StatusBadge({ status }) {
  const styles = {
    VERIFIED:     { bg: '#F0FDF4', text: '#166534', border: '#22c55e' },
    OUTSIDE_ZONE: { bg: '#FFF1F1', text: '#991B1B', border: '#ef4444' },
    NO_GPS:       { bg: '#FFFBEB', text: '#92400E', border: '#f59e0b' },
  }
  const s = styles[status] || styles.NO_GPS
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '20px',
      border: `1px solid ${s.border}`,
      background: s.bg,
      color: s.text,
      fontSize: '11px',
      fontWeight: 600,
    }}>
      {status === 'OUTSIDE_ZONE' ? 'OUTSIDE ZONE' : status}
    </span>
  )
}

const thStyle = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.5px',
}

const tdStyle = {
  padding: '12px 14px',
  borderBottom: '1px solid #f1f5f9',
}

const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box',
}

// Inline admin action: confirm a console's hospital genuinely changed, and
// re-register its approved site. This is the only place a hospital/GPS can
// be overwritten after it's first set (see PATCH /api/consoles/{id}/site) —
// everywhere else deliberately only flags a mismatch and never touches the
// record, so this is where a human actually resolves one.
function RelocatePanel({ scan, onDone, onCancel }) {
  const [hospital, setHospital] = useState(scan.given_hospital || '')
  const [city, setCity] = useState(scan.city || '')
  const [pincode, setPincode] = useState('')
  const [passcode, setPasscode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const useThisScansGps = scan.scanned_lat != null && scan.scanned_lng != null

  const handleConfirm = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await updateConsoleSite(scan.console_id, {
        passcode,
        hospital: hospital.trim(),
        city: city.trim(),
        pincode: pincode.trim() || null,
        approved_lat: useThisScansGps ? scan.scanned_lat : null,
        approved_lng: useThisScansGps ? scan.scanned_lng : null,
      })
      onDone()
    } catch (e) {
      setError(
        e?.response?.status === 403 ? 'Incorrect passcode.' :
        e?.response?.data?.detail || 'Update failed — check your connection and try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <tr>
      <td colSpan={7} style={{ padding: '16px 20px', background: '#FFFBEB', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400E', marginBottom: '10px' }}>
          Update master location for {scan.console_id}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Hospital name</label>
            <input style={inputStyle} value={hospital} onChange={(e) => setHospital(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>City</label>
            <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Pincode (optional)</label>
            <input style={inputStyle} value={pincode} onChange={(e) => setPincode(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Admin passcode</label>
            <input style={inputStyle} type="password" inputMode="numeric" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#78716c', marginBottom: '10px' }}>
          {useThisScansGps
            ? `Approved GPS point will be set to this scan's location (${scan.scanned_lat.toFixed(5)}, ${scan.scanned_lng.toFixed(5)}).`
            : 'This scan had no GPS — the approved point will be left as-is.'}
        </p>
        {error && <p style={{ color: '#991B1B', fontSize: '12px', marginBottom: '10px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleConfirm}
            disabled={submitting || !hospital.trim() || !city.trim() || !passcode}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              background: '#0A1628', color: '#00BFA5', fontWeight: 700, fontSize: '13px',
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Updating...' : 'Confirm relocation'}
          </button>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1',
              background: '#fff', color: '#334155', fontSize: '13px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function ScanTable() {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [relocatingId, setRelocatingId] = useState(null)
  const [justUpdated, setJustUpdated] = useState(false)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const hiddenOnMobile = isMobile ? 'none' : 'table-cell'

  const fetchScans = async () => {
    setLoading(true)
    try {
      const res = await getScans({ limit: 20 })
      setScans(res.data)
      setError(null)
    } catch {
      setError('Failed to load scans.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchScans()
  }, [])

  return (
    <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginTop: '24px' }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0A1628', marginBottom: '16px' }}>Recent Scans</div>

      {loading && <LoadingSpinner />}
      {error && <p style={{ color: '#ef4444', padding: '16px' }}>{error}</p>}
      {!loading && !error && scans.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px' }}>No scans recorded yet.</div>
      )}
      {justUpdated && (
        <p style={{ color: '#166534', fontSize: '13px', marginBottom: '12px' }}>
          Site updated. Reload the page to see it reflected everywhere.
        </p>
      )}

      {!loading && !error && scans.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0A1628', color: '#fff', position: 'sticky', top: 0 }}>
                <th style={thStyle}>Console</th>
                <th style={{ ...thStyle, display: hiddenOnMobile }}>Hospital</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Time</th>
                <th style={{ ...thStyle, display: hiddenOnMobile }}>Distance</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan, i) => (
                <React.Fragment key={scan.id}>
                  <tr style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700 }}>
                        {scan.console_id}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, display: hiddenOnMobile, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {scan.hospital || '—'}
                      {scan.hospital_mismatch && (
                        <>
                          <span
                            title={`Entered as: ${scan.given_hospital || '—'}`}
                            style={{
                              marginLeft: 6, display: 'inline-block', padding: '1px 6px', borderRadius: '10px',
                              background: '#FFF1F1', color: '#991B1B', border: '1px solid #ef4444',
                              fontSize: '10px', fontWeight: 700, cursor: 'help',
                            }}
                          >
                            MISMATCH
                          </span>
                          {' '}
                          <button
                            onClick={() => { setRelocatingId(relocatingId === scan.id ? null : scan.id); setJustUpdated(false) }}
                            style={{
                              background: 'none', border: 'none', color: '#00A58F', fontSize: '11px',
                              fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0,
                            }}
                          >
                            {relocatingId === scan.id ? 'close' : 'review'}
                          </button>
                        </>
                      )}
                    </td>
                    <td style={tdStyle}>{scan.city || '—'}</td>
                    <td style={tdStyle}>
                      {[scan.department, scan.floor].filter(Boolean).join(' · ') || '—'}
                      {scan.location_changed && (
                        <span
                          title={`Moved from: ${[scan.prev_department, scan.prev_floor].filter(Boolean).join(' · ') || '—'}`}
                          style={{
                            marginLeft: 6, display: 'inline-block', padding: '1px 6px', borderRadius: '10px',
                            background: '#FFFBEB', color: '#92400E', border: '1px solid #f59e0b',
                            fontSize: '10px', fontWeight: 700, cursor: 'help',
                          }}
                        >
                          MOVED
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>{formatTime(scan.scanned_at)}</td>
                    <td style={{ ...tdStyle, display: hiddenOnMobile }}>{formatDistance(scan.distance_m)}</td>
                    <td style={tdStyle}><StatusBadge status={scan.geo_status} /></td>
                  </tr>
                  {relocatingId === scan.id && (
                    <RelocatePanel
                      scan={scan}
                      onCancel={() => setRelocatingId(null)}
                      onDone={() => { setRelocatingId(null); setJustUpdated(true) }}
                    />
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
