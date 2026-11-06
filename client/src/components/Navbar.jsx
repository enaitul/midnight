import { Link, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Moon, Sun, User as UserIcon, PenLine, House, MessageCircle, Search, CircleHelp, Bell } from 'lucide-react'
import { io } from 'socket.io-client'
import { communityService } from '../services/community'
import { resolveAssetUrl } from '../services/api'

const navItems = [
  { to: '/', label: 'Feed', Icon: House, end: true },
  { to: '/write', label: 'New post', Icon: PenLine },
  { to: '/messages', label: 'Messages', Icon: MessageCircle },
  { to: '/notifications', label: 'Notifications', Icon: Bell },
  { to: '/search', label: 'Search', Icon: Search },
  { to: '/about', label: 'About', Icon: CircleHelp },
]

export default function Navbar() {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('midnight_theme') || 'light' } catch { return 'light' }
  })
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const isAuthPage = ['/login', '/register'].includes(location.pathname)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('midnight_theme', theme) } catch { /* Theme still applies for this session. */ }
  }, [theme])

  useEffect(() => {
    if (!isAuthenticated) { setUnreadMessages(0); setUnreadNotifications(0); return undefined }
    const token = localStorage.getItem('midnight_token')
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5000' : window.location.origin)
    const socket = io(socketUrl, { auth: { token } })
    const joined = new Set()
    const refreshConversations = async () => {
      try {
        const conversations = await communityService.conversations()
        setUnreadMessages(conversations.reduce((total, item) => total + (item.unread_count || 0), 0))
        if (socket.connected) conversations.forEach(item => {
          if (!joined.has(item.id)) { joined.add(item.id); socket.emit('join_conversation', { conversation_id: item.id }) }
        })
      } catch { /* The Messages page will show any conversation loading error. */ }
      communityService.unreadNotifications().then(setUnreadNotifications).catch(() => {})
    }
    socket.on('connect', refreshConversations)
    socket.on('disconnect', () => joined.clear())
    socket.on('new_message', message => {
      if (message.sender.id !== user?.id) setUnreadMessages(count => count + 1)
    })
    socket.on('new_notification', notification => {
      setUnreadNotifications(count => count + 1)
      window.dispatchEvent(new CustomEvent('midnight:new-notification', { detail: notification }))
    })
    const clearNotifications = () => setUnreadNotifications(0)
    window.addEventListener('midnight:conversation-read', refreshConversations)
    window.addEventListener('midnight:conversations-changed', refreshConversations)
    window.addEventListener('midnight:notifications-read', clearNotifications)
    refreshConversations()
    return () => {
      socket.disconnect()
      window.removeEventListener('midnight:conversation-read', refreshConversations)
      window.removeEventListener('midnight:conversations-changed', refreshConversations)
      window.removeEventListener('midnight:notifications-read', clearNotifications)
    }
  }, [isAuthenticated, user?.id])

  const accountUrl = isAuthenticated ? `/profile/${encodeURIComponent(user.username)}` : '/login'
  const displayName = user?.display_name || user?.username || 'Account'

  return <>
    <header className="topbar">
      <Link to="/" className="wordmark">midnight.</Link>
      <div className="topbar-actions">
        {isAuthenticated ? <Link to={accountUrl} className="topbar-account" aria-label={`Account: ${displayName}`}>
          {user?.avatar_url ? <img src={resolveAssetUrl(user.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="topbar-avatar"><UserIcon size={16} /></span>}
          <span>{displayName}</span>
        </Link> : <><Link to="/login" className="top-link">Sign in</Link><Link to="/register" className="top-link">Join</Link></>}
        {isAuthenticated && <Link to="/notifications" className="topbar-notifications" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`} title="Notifications"><Bell size={18} />{unreadNotifications > 0 && <b>{unreadNotifications > 99 ? '99+' : unreadNotifications}</b>}</Link>}
        <button className="theme-toggle" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </div>
    </header>
    {!isAuthPage && <aside className="sidebar" aria-label="Main navigation">
      <nav>{navItems.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} aria-label={label} title={label} className={({ isActive }) => `side-link${isActive ? ' active' : ''}${to === '/notifications' ? ' notifications-nav-link' : ''}`}>
        <Icon size={18} strokeWidth={1.7} /><span>{label}</span>{to === '/messages' && unreadMessages > 0 && <b className="nav-unread" aria-label={`${unreadMessages} unread messages`}>{unreadMessages > 99 ? '99+' : unreadMessages}</b>}{to === '/notifications' && unreadNotifications > 0 && <b className="nav-unread notification-nav-unread" aria-label={`${unreadNotifications} unread notifications`}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</b>}
      </NavLink>)}</nav>
      <Link to={accountUrl} className={`sidebar-account${location.pathname.startsWith('/profile/') || location.pathname === '/account' ? ' active' : ''}`}>
        {user?.avatar_url ? <img src={resolveAssetUrl(user.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="sidebar-avatar"><UserIcon size={17} /></span>}
        <span className="sidebar-account-copy"><small>Account</small><strong>{displayName}</strong></span>
      </Link>
    </aside>}
  </>
}
