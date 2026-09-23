import React, { useState, useEffect } from 'react'
import { getConsoles } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

/**
 * Fallback entry point when no NFC tag was tapped — either the phone has no
 * NFC, or the tag didn't respond. Reached by sharing the bare /scan URL
 * (no ?tag=) through any channel: WhatsApp, SMS, a printed sheet. Picking a
 * console here just sets ?tag= and continues into the exact same flow as a
 * real tap; nothing about the scan itself is different or less rigorous.
 *
 * Matched by serial number rather than hospital name or console ID — that's
 * what's physically printed on the unit's own label, so it's the one thing
 * the person standing in front of it can always check without ambiguity.
 */
export default function ConsolePicker() {
  const [consoles, setConsoles] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getConsoles()
      .then((res) => setConsoles(res.data))
      .catch(() => setError('Could not load the console list. Check your connection and reload.'))
  }, [])

  const choose = (id) => {
    const params = new URLSearchParams(window.location.search)
    params.set('tag', id)
    window.location.href = `${window.location.pathname}?${params.toString()}`
  }

  return (
    <div className="scan-wrap">
      <div className="scan-card center">
        <h2>No NFC tag detected</h2>
        <p>No NFC on this phone, or the tag didn't respond. Pick your console below instead — match it by the serial number printed on the back of the unit.</p>
      </div>

      {error && <div className="scan-alert danger">{error}</div>}
      {!consoles && !error && <LoadingSpinner message="Loading consoles..." />}

      {consoles && consoles.length === 0 && (
        <div className="scan-card center">
          <p className="hint">No consoles are on file yet.</p>
        </div>
      )}

      {consoles && consoles.length > 0 && (
        <div className="picker-list">
          {consoles.map((c) => (
            <button key={c.id} className="picker-item" onClick={() => choose(c.id)} type="button">
              <span className="picker-serial">{c.serial_number ? `SN ${c.serial_number}` : c.id}</span>
              <span className="picker-sub">{c.hospital || 'Not yet registered'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
