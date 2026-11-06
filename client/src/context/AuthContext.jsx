import { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '../services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On initial mount, verify if an existing token in localStorage is valid
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('midnight_token')
      if (token) {
        try {
          const currentUser = await authService.getCurrentUser()
          setUser(currentUser)
        } catch (err) {
          console.error('Session expired or invalid token:', err)
          localStorage.removeItem('midnight_token')
          setUser(null)
        }
      }
      setLoading(false)
    }

    initAuth()
  }, [])

  const handleAuthSuccess = (data) => {
    localStorage.setItem('midnight_token', data.token)
    setUser(data.user)
  }

  const loginWithCredentials = async (email_or_username, password) => {
    const data = await authService.login(email_or_username, password)
    handleAuthSuccess(data)
    return data
  }

  const registerWithCredentials = async (username, email, password) => {
    const data = await authService.register(username, email, password)
    handleAuthSuccess(data)
    return data
  }

  const loginWithGoogle = async (credential) => {
    const data = await authService.googleLogin(credential)
    handleAuthSuccess(data)
    return data
  }

  const logout = () => {
    localStorage.removeItem('midnight_token')
    setUser(null)
  }

  const refreshUser = async () => {
    const currentUser = await authService.getCurrentUser()
    setUser(currentUser)
    return currentUser
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        loginWithCredentials,
        registerWithCredentials,
        loginWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

