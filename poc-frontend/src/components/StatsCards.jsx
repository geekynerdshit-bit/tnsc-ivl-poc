import React, { useState, useEffect } from 'react'
import { getStats } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

export default function StatsCards({ refreshTick }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await getStats()
      setStats(res.data)
      setError(null)
    } catch {
      setError('Failed to load stats.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [refreshTick])

  if (loading) return <LoadingSpinner message="Loading stats..." />
  if (error) return <p style={{ color: '#ef4444', padding: '16px' }}>{error}</p>
  if (!stats) return null

  const cardBase = {
    background: '#fff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    borderLeft: '4px solid #00BFA5',
  }

  const numberStyle = (color) => ({
    fontSize: '32px',
    fontWeight: 700,
    color,
    lineHeight: 1.1,
  })

  const labelStyle = {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '4px',
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      {/* Card 1 — Consoles Registered */}
      <div style={cardBase}>
        <div style={numberStyle('#0A1628')}>{stats.total_consoles}</div>
        <div style={labelStyle}>Consoles Registered</div>
      </div>

      {/* Card 2 — Total Scans */}
      <div style={cardBase}>
        <div style={numberStyle('#00BFA5')}>{stats.total_scans}</div>
        <div style={labelStyle}>Total Scans</div>
      </div>

      {/* Card 3 — Location Verified */}
      <div style={{ ...cardBase, background: '#F0FDF4', borderLeft: '4px solid #22c55e' }}>
        <div style={numberStyle('#166534')}>{stats.verified_scans}</div>
        <div style={labelStyle}>Location Verified</div>
      </div>

      {/* Card 4 — Outside Zone */}
      <div style={{
        ...cardBase,
        background: '#FFF1F1',
        borderLeft: '4px solid #ef4444',
        animation: stats.outside_zone_scans > 0 ? 'pulseRed 2s ease-in-out infinite' : undefined,
      }}>
        {stats.outside_zone_scans > 0 && (
          <style>{`@keyframes pulseRed { 0%,100%{border-left-color:#ef4444} 50%{border-left-color:#fca5a5} }`}</style>
        )}
        <div style={numberStyle('#991B1B')}>{stats.outside_zone_scans}</div>
        <div style={labelStyle}>Outside Zone</div>
      </div>
    </div>
  )
}
