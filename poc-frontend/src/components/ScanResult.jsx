import React from 'react'

function formatDistance(distance_m) {
  if (distance_m == null) return null
  if (distance_m < 1000) return `${Math.round(distance_m)} m`
  return `${(distance_m / 1000).toFixed(1)} km`
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const detailRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  fontSize: '15px',
  color: '#374151',
  textAlign: 'left',
}

const badgeBaseStyle = {
  display: 'inline-block',
  marginTop: '20px',
  padding: '4px 14px',
  borderRadius: '20px',
  border: '1px solid',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.5px',
}

function VerifiedVariant({ result }) {
  return (
    <>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: '#F0FDF4',
        border: '2px solid #22c55e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
        fontSize: '28px',
      }}>
        ✅
      </div>
      <h2 style={{ color: '#166534', fontSize: '24px', fontWeight: 700, marginTop: '16px', marginBottom: '0' }}>
        Location Verified
      </h2>
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={detailRowStyle}>
          <span>🏥</span>
          <span>{result.hospital}, {result.city}</span>
        </div>
        <div style={detailRowStyle}>
          <span>📏</span>
          <span>{formatDistance(result.distance_m)} from approved zone</span>
        </div>
        <div style={detailRowStyle}>
          <span>🕐</span>
          <span>{formatTime(result.scanned_at)}</span>
        </div>
        {result.scanned_by && (
          <div style={detailRowStyle}>
            <span>👤</span>
            <span>{result.scanned_by}</span>
          </div>
        )}
      </div>
      <div style={{ ...badgeBaseStyle, background: '#F0FDF4', color: '#166534', borderColor: '#22c55e' }}>
        VERIFIED
      </div>
    </>
  )
}

function OutsideZoneVariant({ result }) {
  return (
    <>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: '#FFF7ED',
        border: '2px solid #f97316',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
        fontSize: '28px',
      }}>
        ⚠️
      </div>
      <h2 style={{ color: '#991B1B', fontSize: '24px', fontWeight: 700, marginTop: '16px', marginBottom: '0' }}>
        Outside Approved Location
      </h2>
      <div style={{
        background: '#FFF1F1',
        borderLeft: '4px solid #ef4444',
        padding: '12px',
        marginTop: '16px',
        textAlign: 'left',
        fontSize: '14px',
        color: '#374151',
        borderRadius: '0 4px 4px 0',
      }}>
        This console is registered to a different location.
      </div>
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={detailRowStyle}>
          <span>🏥</span>
          <span>Assigned to: {result.hospital}, {result.city}</span>
        </div>
        <div style={detailRowStyle}>
          <span>📏</span>
          <span>Distance: {formatDistance(result.distance_m)}</span>
        </div>
        <div style={detailRowStyle}>
          <span>🕐</span>
          <span>{formatTime(result.scanned_at)}</span>
        </div>
        <div style={detailRowStyle}>
          <span>📍</span>
          <span>Scanned at: {result.scanned_lat?.toFixed(4)}, {result.scanned_lng?.toFixed(4)}</span>
        </div>
      </div>
      <div style={{ ...badgeBaseStyle, background: '#FFF1F1', color: '#991B1B', borderColor: '#ef4444' }}>
        OUTSIDE ZONE
      </div>
    </>
  )
}

function NoGpsVariant({ result }) {
  return (
    <>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: '#FFF7ED',
        border: '2px solid #f59e0b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
        fontSize: '28px',
      }}>
        📍
      </div>
      <h2 style={{ color: '#0A1628', fontSize: '24px', fontWeight: 700, marginTop: '16px', marginBottom: '0' }}>
        Scan Recorded
      </h2>
      <p style={{ color: '#6B7280', fontSize: '14px', marginTop: '8px', marginBottom: '0' }}>
        GPS unavailable — scan logged without location verification
      </p>
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={detailRowStyle}>
          <span>🏥</span>
          <span>{result.hospital}, {result.city}</span>
        </div>
        <div style={detailRowStyle}>
          <span>🕐</span>
          <span>{formatTime(result.scanned_at)}</span>
        </div>
        {result.scanned_by && (
          <div style={detailRowStyle}>
            <span>👤</span>
            <span>{result.scanned_by}</span>
          </div>
        )}
      </div>
      <div style={{ ...badgeBaseStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#f59e0b' }}>
        NO GPS
      </div>
    </>
  )
}

export default function ScanResult({ result }) {
  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '32px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
        textAlign: 'center',
      }}>
        {result.geo_status === 'VERIFIED' && <VerifiedVariant result={result} />}
        {result.geo_status === 'OUTSIDE_ZONE' && <OutsideZoneVariant result={result} />}
        {result.geo_status === 'NO_GPS' && <NoGpsVariant result={result} />}
      </div>
      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <a href="/dashboard" style={{ color: '#00BFA5', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }}>
          View Dashboard →
        </a>
      </div>
    </div>
  )
}
