import React, { useState, useEffect, useRef } from 'react'
import StatsCards from '../components/StatsCards'
import ConsoleMap from '../components/ConsoleMap'
import ScanTable from '../components/ScanTable'

export default function DashboardPage() {
  const [refreshTick, setRefreshTick] = useState(0)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const secondsRef = useRef(0)

  useEffect(() => {
    const dataInterval = setInterval(() => {
      setRefreshTick(t => t + 1)
      secondsRef.current = 0
      setSecondsAgo(0)
    }, 30000)

    const clockInterval = setInterval(() => {
      secondsRef.current += 1
      setSecondsAgo(secondsRef.current)
    }, 1000)

    return () => {
      clearInterval(dataInterval)
      clearInterval(clockInterval)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0A1628', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#FFFFFF', fontSize: '20px', fontWeight: 700 }}>IVL Console Dashboard</span>
        <span style={{ color: '#94a3b8', fontSize: '13px' }}>Last updated: {secondsAgo}s ago</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <StatsCards refreshTick={refreshTick} />
        <ConsoleMap />
        <ScanTable refreshTick={refreshTick} />
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
        Translumina Therapeutics — POC Demo
      </div>
    </div>
  )
}
