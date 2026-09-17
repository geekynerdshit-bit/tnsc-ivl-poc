import React from 'react'
import StatsCards from '../components/StatsCards'
import ConsoleMap from '../components/ConsoleMap'
import ScanTable from '../components/ScanTable'

export default function DashboardPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0A1628', padding: '16px 24px' }}>
        <span style={{ color: '#FFFFFF', fontSize: '20px', fontWeight: 700 }}>IVL Console Dashboard</span>
      </div>

      {/* Content — loads once on open; reload the page for the latest data */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <StatsCards />
        <ConsoleMap />
        <ScanTable />
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
        Translumina Therapeutics — POC Demo
      </div>
    </div>
  )
}
