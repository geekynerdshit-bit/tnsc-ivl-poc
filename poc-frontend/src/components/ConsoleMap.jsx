import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { getConsoles, getScans } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

// Vite breaks Leaflet's built-in icon URL resolver — replace with bundled assets
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

function MapLegend() {
  const map = useMap()
  useEffect(() => {
    const legend = L.control({ position: 'bottomright' })
    legend.onAdd = () => {
      const div = L.DomUtil.create('div')
      div.style.cssText = 'background:white;padding:10px 14px;border-radius:6px;font-size:12px;line-height:1.8;box-shadow:0 1px 5px rgba(0,0,0,0.2)'
      div.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px;color:#0A1628">Legend</div>
        <div>🔵 Console location</div>
        <div>🟢 Verified scan</div>
        <div>🔴 Outside zone</div>
      `
      return div
    }
    legend.addTo(map)
    return () => legend.remove()
  }, [map])
  return null
}

export default function ConsoleMap() {
  const [consoles, setConsoles] = useState([])
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [consolesRes, scansRes] = await Promise.all([
          getConsoles(),
          getScans({ limit: 100 })
        ])
        setConsoles(consolesRes.data)
        setScans(scansRes.data)
      } catch {
        setError('Map data unavailable.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const formatTime = (iso) => new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  })

  if (loading) return <LoadingSpinner message="Loading map..." />

  if (error) return (
    <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: 8, color: '#64748b' }}>
      Map unavailable
    </div>
  )

  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '380px', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />
        <MapLegend />

        {/* Console markers — blue default marker */}
        {consoles.map(c => (
          <Marker key={c.id} position={[c.approved_lat, c.approved_lng]}>
            <Popup>
              <b>{c.name}</b><br />
              🏥 {c.hospital}<br />
              📍 {c.city}{c.pincode ? ` — ${c.pincode}` : ''}<br />
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#00BFA5' }}>{c.id}</span>
            </Popup>
          </Marker>
        ))}

        {/* Scan markers — only if coordinates exist */}
        {scans
          .filter(s => s.scanned_lat != null && s.scanned_lng != null)
          .map(s => {
            const isVerified = s.geo_status === 'VERIFIED'
            return (
              <CircleMarker
                key={s.id}
                center={[s.scanned_lat, s.scanned_lng]}
                radius={8}
                fillColor={isVerified ? '#22c55e' : '#ef4444'}
                color={isVerified ? '#166534' : '#991B1B'}
                fillOpacity={0.8}
                weight={2}
              >
                <Popup>
                  📱 Scanned: {formatTime(s.scanned_at)}<br />
                  👤 {s.scanned_by || 'Unknown'}<br />
                  📏 {s.distance_m != null ? (s.distance_m < 1000 ? `${Math.round(s.distance_m)} m` : `${(s.distance_m / 1000).toFixed(1)} km`) : 'No GPS'}<br />
                  <span style={{
                    display: 'inline-block', padding: '1px 8px', borderRadius: '10px',
                    background: isVerified ? '#F0FDF4' : '#FFF1F1',
                    color: isVerified ? '#166534' : '#991B1B',
                    border: `1px solid ${isVerified ? '#22c55e' : '#ef4444'}`,
                    fontSize: '11px', fontWeight: 600
                  }}>
                    {s.geo_status}
                  </span>
                </Popup>
              </CircleMarker>
            )
          })
        }
      </MapContainer>
    </div>
  )
}
