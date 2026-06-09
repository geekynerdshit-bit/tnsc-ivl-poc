import React from 'react'
import { Link } from 'react-router-dom'

export default function NavBar() {
  return (
    <nav style={{
      background: '#0A1628',
      borderBottom: '2px solid #00BFA5',
      height: '52px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
    }}>
      <Link to="/dashboard" style={{ color: '#ffffff', fontWeight: 700, fontSize: '16px', letterSpacing: '0.3px' }}>
        IVL Console POC
      </Link>
      <div style={{ display: 'flex', gap: '24px' }}>
        <Link to="/dashboard" style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 500 }}>
          Dashboard
        </Link>
        <Link to="/scan" style={{ color: '#00BFA5', fontSize: '14px', fontWeight: 500 }}>
          Scan
        </Link>
      </div>
    </nav>
  )
}
