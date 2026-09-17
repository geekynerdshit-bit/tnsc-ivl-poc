import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import ScanPage from './pages/ScanPage'
import DashboardPage from './pages/DashboardPage'
import TagsPage from './pages/TagsPage'

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        {/* Gated by middleware.js alongside /dashboard — printable QR
            fallback for the NFC tags, not something a field engineer needs. */}
        <Route path="/tags" element={<TagsPage />} />
      </Routes>
    </>
  )
}
