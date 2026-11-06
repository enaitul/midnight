import api from './api'

export const authService = {
  // Register with email & password
  register: async (username, email, password) => {
    const res = await api.post('/auth/register', { username, email, password })
    return res.data
  },

  // Login with email/username & password
  login: async (email_or_username, password) => {
    const res = await api.post('/auth/login', { email_or_username, password })
    return res.data
  },

  // Exchange Google ID Token for midnight JWT
  googleLogin: async (credential) => {
    const res = await api.post('/auth/google', { credential })
    return res.data
  },

  // Fetch current user details using stored JWT
  getCurrentUser: async () => {
    const res = await api.get('/auth/me')
    return res.data.user
  },
}

