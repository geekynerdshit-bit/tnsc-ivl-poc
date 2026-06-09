import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

export const getConsoles = () => api.get('/api/consoles')
export const getConsole = (id) => api.get(`/api/consoles/${id}`)
export const submitScan = (body) => api.post('/api/scan', body)
export const getScans = (params = {}) => api.get('/api/scans', { params })
export const getStats = () => api.get('/api/stats')

export default api
