import React, { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

/**
 * Renders a QR code to a canvas, client-side, with no network call — this
 * must keep working for printing tag sheets even with no internet, and must
 * never leak console URLs to a third-party QR-image service.
 */
export default function QRCodeImage({ value, size = 160 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !value) return
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#0A1628', light: '#FFFFFF' },
    }).catch(() => {})
  }, [value, size])

  return <canvas ref={canvasRef} width={size} height={size} className="qr-canvas" />
}
