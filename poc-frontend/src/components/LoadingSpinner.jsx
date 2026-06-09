import React from 'react'

export default function LoadingSpinner({ message }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      gap: '12px',
    }}>
      <div style={{
        width: '36px',
        height: '36px',
        border: '3px solid #e2eaf0',
        borderTop: '3px solid #00BFA5',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      {message && (
        <p style={{ color: '#64748b', fontSize: '14px' }}>{message}</p>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
