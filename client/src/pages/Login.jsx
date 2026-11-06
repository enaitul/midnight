import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle } from 'lucide-react'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const { loginWithCredentials, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await loginWithCredentials(identifier, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sign in. Please check credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setError(null)
    setLoading(true)
    try {
      if (!credentialResponse.credential) {
        throw new Error('No credential token received from Google')
      }
      await loginWithGoogle(credentialResponse.credential)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-surface border border-[#262633] rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight mb-2">Welcome Back</h1>
          <p className="font-writing text-muted text-sm italic">
            Enter the quiet corners of your thoughts.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center gap-3 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Continue with Google */}
        <div className="mb-6 flex flex-col items-center">
          <div className="w-full flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google Sign-In was cancelled or failed.')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="continue_with"
              width="100%"
            />
          </div>
        </div>

        <div className="relative flex items-center justify-center mb-6">
          <div className="border-t border-[#2a2a38] w-full" />
          <span className="bg-surface px-3 text-xs uppercase tracking-widest text-muted absolute">
            or continue with email
          </span>
        </div>

        {/* Traditional Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted mb-1.5 font-medium">
              Username or Email
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-[#121217] border border-[#2c2c3b] rounded-lg px-3.5 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-accent transition"
              placeholder="e.g. nightwriter or writer@midnight.local"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-muted mb-1.5 font-medium">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#121217] border border-[#2c2c3b] rounded-lg px-3.5 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-accent transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent/20 hover:bg-accent/30 border border-accent/40 text-primary font-medium py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            <span>Sign In</span>
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-muted">
          Don't have an account yet?{' '}
          <Link to="/register" className="text-accent hover:underline font-medium">
            Register here
          </Link>
        </p>
      </div>
    </div>
  )
}

