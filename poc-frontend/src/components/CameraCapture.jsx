import React, { useState, useEffect, useRef, useCallback } from 'react'

const MAX_EDGE = 1600   // downscale before upload — phone photos are 3-5 MB raw
const QUALITY = 0.82

/**
 * Live camera capture. There is deliberately no file-picker path: the engineer
 * must photograph the console in front of them, not attach an existing image.
 *
 * getUserMedia is the primary route. The `capture` input is offered only when
 * the live stream is unavailable (older browser, or camera permission handled
 * at the OS level) — it still opens the camera rather than the gallery.
 */
export default function CameraCapture({ onCapture, disabled }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setStreaming(false)
  }, [])

  useEffect(() => stop, [stop])

  const start = async () => {
    setError(null)
    setStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      setStreaming(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
    } catch (err) {
      const name = err?.name || ''
      if (name === 'NotAllowedError') {
        setError('Camera permission denied. Allow camera access to photograph the console label.')
      } else if (name === 'NotFoundError') {
        setError('No camera found on this device.')
      } else {
        setError('Could not open the camera on this device.')
      }
    } finally {
      setStarting(false)
    }
  }

  const shoot = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
    stop()
    onCapture(dataUrl)
  }

  // Fallback path — still camera-first, never the gallery
  const onFallbackFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        onCapture(canvas.toDataURL('image/jpeg', QUALITY))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  if (streaming) {
    return (
      <div className="cam">
        <div className="cam-frame">
          <video ref={videoRef} playsInline muted className="cam-video" />
          <div className="cam-guide"><span>Align the console label inside the frame</span></div>
        </div>
        <div className="cam-actions">
          <button className="btn btn-ghost" onClick={stop} type="button">Cancel</button>
          <button className="btn btn-shutter" onClick={shoot} type="button">Capture Photo</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cam">
      {error && (
        <div className="scan-alert warn" style={{ marginBottom: 12 }}>
          {error}
          <label className="linklike">
            Use device camera instead
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFallbackFile}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}
      <button
        className="btn btn-primary"
        onClick={start}
        disabled={disabled || starting}
        type="button"
      >
        {starting ? 'Opening camera...' : 'Open Camera'}
      </button>
      <p className="cam-hint">
        Photograph the console label showing its serial number and manufacturing date.
      </p>
    </div>
  )
}
