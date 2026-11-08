import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Write from './pages/Write'
import PostDetail from './pages/PostDetail'
import MyWritings from './pages/MyWritings'
import Search from './pages/Search'
import Messages from './pages/Messages'
import Profile from './pages/Profile'
import About from './pages/About'
import Creator from './pages/Creator'
import Notifications from './pages/Notifications'
import AiAssistant from './pages/AiAssistant'
import { useAuth } from './context/AuthContext'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function AccountRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to={`/profile/${encodeURIComponent(user.username)}`} replace /> : <Navigate to="/login" replace />
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <div className="app-shell min-h-screen bg-background text-primary flex flex-col font-body selection:bg-accent/30 selection:text-white">
            <Navbar />
            <main className="shell-content flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/write" element={<Write />} />
                <Route path="/write/:id" element={<Write />} />
                <Route path="/post/:id" element={<PostDetail />} />
                <Route path="/my-writings" element={<MyWritings />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/assistant" element={<AiAssistant />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/search" element={<Search />} />
                <Route path="/account" element={<AccountRedirect />} />
                <Route path="/profile/:username" element={<Profile />} />
                <Route path="/about" element={<About />} />
                <Route path="/creator" element={<Creator />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}

export default App
