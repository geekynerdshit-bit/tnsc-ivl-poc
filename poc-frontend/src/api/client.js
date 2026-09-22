import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

export const getConsoles = () => api.get('/api/consoles')
export const getConsole = (id) => api.get(`/api/consoles/${id}`)
export const submitScan = (body) => api.post('/api/scan', body)
export const getScans = (params = {}) => api.get('/api/scans', { params })
export const getStats = () => api.get('/api/stats')
// Admin-only, passcode-gated server-side — see routes/consoles.py. Re-registers
// a console's approved site (hospital/city/GPS) after a flagged mismatch.
export const updateConsoleSite = (id, body) => api.patch(`/api/consoles/${id}/site`, body)

export default api
