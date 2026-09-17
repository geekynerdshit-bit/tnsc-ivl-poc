import React, { useState, useEffect } from 'react'
import { getConsoles } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import QRCodeImage from '../components/QRCodeImage'

/**
 * Printable QR fallback for consoles without a working NFC tap — an older or
 * budget phone with no NFC chip, NFC turned off in settings, or (see the
 * NFC-vs-Shortcuts note in the ops guide) a tag written as a personal iOS
 * Shortcuts automation that only opens on the phone that created it.
 *
 * Same URL as the NFC tag, rendered as a QR code, generated client-side —
 * no network call, so this keeps working for printing even offline, and
 * console identifiers never pass through a third-party QR-image service.
 */
export default function TagsPage() {
  const [consoles, setConsoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getConsoles()
      .then((res) => setConsoles(res.data))
      .catch(() => setError('Could not load consoles.'))
      .finally(() => setLoading(false))
  }, [])

  const base = window.location.origin

  if (loading) return <LoadingSpinner message="Loading consoles..." />

  return (
    <div className="page">
      <div className="shell tags-shell">
        <div className="tags-head no-print">
          <h1>Console Tags</h1>
          <p>
            Print this page and attach one QR code next to each console's NFC sticker.
            Same link either way — this is only the fallback for a phone that can't tap.
          </p>
          <button className="btn btn-ghost" onClick={() => window.print()} type="button">
            Print this page
          </button>
        </div>

        {error && <div className="err">{error}</div>}

        <div className="tags-grid">
          {consoles.map((c) => {
            const url = `${base}/scan?tag=${c.id}`
            return (
              <div className="tag-card" key={c.id}>
                <QRCodeImage value={url} size={150} />
                <div className="tag-id">{c.id}</div>
                <div className="tag-hospital">{c.hospital}</div>
                <div className="tag-url">{url}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
