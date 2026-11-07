import axios from 'axios'

/**
 * Axios instance pre-configured for our API.
 *
 * Automatically includes the JWT Bearer token in requests
 * if one is found in localStorage.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
})

// Request interceptor: attach Authorization header dynamically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('midnight_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

export function resolveAssetUrl(url) {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) return url
  if (!url.startsWith('/api/')) return url
  const configuredBase = import.meta.env.VITE_API_BASE_URL || '/api'
  try {
    const apiOrigin = new URL(configuredBase, window.location.origin).origin
    return `${apiOrigin}${url}`
  } catch {
    return url
  }
}

export default api
