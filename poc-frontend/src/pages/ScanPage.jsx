import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConsole, submitScan } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import ScanResult from '../components/ScanResult'

export default function ScanPage() {
  const [tag, setTag] = useState(null)
  const [consoleData, setConsoleData] = useState(null)
  const [gpsLat, setGpsLat] = useState(null)
  const [gpsLng, setGpsLng] = useState(null)
  const [gpsError, setGpsError] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [userName, setUserName] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [error, setError] = useState(null)
  const [consoleLoading, setConsoleLoading] = useState(false)
  const [consoleError, setConsoleError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tagParam = params.get('tag')
    setTag(tagParam || '')

    if (!tagParam) return

    setConsoleLoading(true)
    getConsole(tagParam)
      .then((res) => {
        setConsoleData(res.data)
        setConsoleLoading(false)
        // Start GPS capture after console loads
        setGpsLoading(true)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setGpsLat(pos.coords.latitude)
            setGpsLng(pos.coords.longitude)
            setGpsLoading(false)
          },
          () => {
            setGpsError(true)
            setGpsLoading(false)
          },
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })
      .catch((err) => {
        setConsoleLoading(false)
        if (err.response && err.response.status === 404) {
          setConsoleError('Console not found. The tag ID is not registered in the system.')
        } else {
          setConsoleError('Failed to load console details. Please try again.')
        }
      })
  }, [])

  const handleSubmit = async () => {
    setSubmitLoading(true)
    setError(null)
    try {
      const res = await submitScan({
        console_id: tag,
        scanned_lat: gpsLat,
        scanned_lng: gpsLng,
        scanned_by: userName.trim() || null,
      })
      setScanResult(res.data)
    } catch (e) {
      setError('Scan submission failed. Please try again.')
    } finally {
      setSubmitLoading(false)
    }
  }

  const pageWrapperStyle = {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '24px 16px',
    minHeight: 'calc(100vh - 52px)',
  }

  const ConsoleInfoCard = consoleData ? (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '20px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
    }}>
      <p style={{ color: '#00BFA5', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px 0' }}>
        {consoleData.id}
      </p>
      <h1 style={{ color: '#0A1628', fontSize: '22px', fontWeight: 700, lineHeight: 1.25, margin: '0' }}>
        {consoleData.hospital}
      </h1>
      <p style={{ color: '#6B7280', fontSize: '16px', margin: '6px 0 0 0' }}>
        {consoleData.city}{consoleData.pincode ? ` — ${consoleData.pincode}` : ''}
      </p>
    </div>
  ) : null

  // State 0 — no tag
  if (tag === '') {
    return (
      <div style={{ ...pageWrapperStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '100%', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: 700, margin: '0 0 12px 0' }}>No Console Tag Detected</h2>
          <p style={{ color: '#6B7280', fontSize: '16px', margin: '0 0 16px 0' }}>Tap an NFC tag or scan a QR code to begin.</p>
          <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '0' }}>Testing? Add ?tag=IVL-001 to the URL</p>
        </div>
      </div>
    )
  }

  // State 1 — consoleLoading (or initial null before effect runs)
  if (tag === null || consoleLoading) {
    return <LoadingSpinner message="Loading console details..." />
  }

  // State 2 — consoleError
  if (consoleError) {
    return (
      <div style={{ ...pageWrapperStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '100%', border: '1px solid #ef4444', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#991B1B', fontSize: '22px', fontWeight: 700, margin: '0 0 12px 0' }}>Console Not Found</h2>
          <p style={{ color: '#374151', fontSize: '16px', margin: '0 0 16px 0' }}>{consoleError}</p>
          <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '0' }}>Tag ID: {tag}</p>
        </div>
      </div>
    )
  }

  // State 5 — scanResult set
  if (scanResult) {
    return <ScanResult result={scanResult} />
  }

  // State 3 — console loaded, gpsLoading
  if (gpsLoading) {
    return (
      <div style={pageWrapperStyle}>
        {ConsoleInfoCard}
        <LoadingSpinner message="Capturing your location..." />
      </div>
    )
  }

  // State 4 — console loaded, GPS done, scanResult=null
  return (
    <div style={pageWrapperStyle}>
      {ConsoleInfoCard}
      {gpsError && (
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #F59E0B',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '16px',
          color: '#92400E',
        }}>
          ⚠️ Location access denied. Scan will be recorded without GPS verification.
        </div>
      )}
      {!gpsError && gpsLat && (
        <p style={{ color: '#16A34A', fontSize: '14px', margin: '0 0 16px 0' }}>📍 Location captured</p>
      )}
      {error && (
        <p style={{ color: '#DC2626', fontSize: '15px', margin: '0 0 16px 0' }}>{error}</p>
      )}
      <div style={{ marginTop: '20px' }}>
        <label style={{ display: 'block', fontSize: '16px', marginBottom: '8px', color: '#374151', fontWeight: 500 }}>
          Your name (optional)
        </label>
        <input
          value={userName}
          onChange={e => setUserName(e.target.value)}
          placeholder="e.g. Harshit"
          style={{
            width: '100%',
            height: '48px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            padding: '0 12px',
            fontSize: '16px',
            boxSizing: 'border-box',
            outline: 'none',
            color: '#111827',
          }}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitLoading}
        style={{
          width: '100%',
          height: '52px',
          marginTop: '16px',
          background: '#0A1628',
          color: '#00BFA5',
          fontSize: '16px',
          fontWeight: 700,
          border: 'none',
          borderRadius: '8px',
          cursor: submitLoading ? 'not-allowed' : 'pointer',
          opacity: submitLoading ? 0.6 : 1,
          letterSpacing: '0.02em',
        }}
      >
        {submitLoading ? 'Recording...' : 'Record Scan ✓'}
      </button>
    </div>
  )
}
