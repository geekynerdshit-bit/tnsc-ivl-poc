import React, { useState, useEffect } from 'react'
import { getScans } from '../api/client'
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

export default function ScanTable({ refreshTick }) {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
  }, [refreshTick])

  return (
    <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginTop: '24px' }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0A1628', marginBottom: '16px' }}>Recent Scans</div>

      {loading && <LoadingSpinner />}
      {error && <p style={{ color: '#ef4444', padding: '16px' }}>{error}</p>}
      {!loading && !error && scans.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px' }}>No scans recorded yet.</div>
      )}

      {!loading && !error && scans.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0A1628', color: '#fff', position: 'sticky', top: 0 }}>
                <th style={thStyle}>Console</th>
                <th style={{ ...thStyle, display: hiddenOnMobile }}>Hospital</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>Time</th>
                <th style={{ ...thStyle, display: hiddenOnMobile }}>Distance</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan, i) => (
                <tr key={scan.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700 }}>
                      {scan.console_id}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, display: hiddenOnMobile, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scan.hospital || '—'}
                  </td>
                  <td style={tdStyle}>{scan.city || '—'}</td>
                  <td style={tdStyle}>{formatTime(scan.scanned_at)}</td>
                  <td style={{ ...tdStyle, display: hiddenOnMobile }}>{formatDistance(scan.distance_m)}</td>
                  <td style={tdStyle}><StatusBadge status={scan.geo_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
