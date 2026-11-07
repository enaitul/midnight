import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Settings, User as UserIcon, PenLine, House, MessageCircle, Search, CircleHelp, Bell, Moon, Type } from 'lucide-react'
import { io } from 'socket.io-client'
import { communityService } from '../services/community'
import { resolveAssetUrl } from '../services/api'

const navItems = [
  { to: '/', label: 'Feed', Icon: House, end: true },
  { to: '/write', label: 'New post', Icon: PenLine },
  { to: '/messages', label: 'Messages', Icon: MessageCircle },
  { to: '/notifications', label: 'Notifications', Icon: Bell },
  { to: '/search', label: 'Search', Icon: Search },
]

export default function Navbar() {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('midnight_theme') || 'light' } catch { return 'light' }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [displaySize, setDisplaySize] = useState(() => {
    try { return localStorage.getItem('midnight_display_size') || 'standard' } catch { return 'standard' }
  })
  const [fontStyle, setFontStyle] = useState(() => {
    try { return localStorage.getItem('midnight_font') || 'classic' } catch { return 'classic' }
  })
  const settingsRef = useRef(null)
  const settingsButtonRef = useRef(null)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const isAuthPage = ['/login', '/register'].includes(location.pathname)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('midnight_theme', theme) } catch { /* Theme still applies for this session. */ }
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.displaySize = displaySize
    try { localStorage.setItem('midnight_display_size', displaySize) } catch { /* Preference still applies for this session. */ }
  }, [displaySize])

  useEffect(() => {
    document.documentElement.dataset.font = fontStyle
    try { localStorage.setItem('midnight_font', fontStyle) } catch { /* Preference still applies for this session. */ }
  }, [fontStyle])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setSettingsOpen(false) }
    const closeOnOutsideClick = event => {
      if (!settingsRef.current?.contains(event.target) && !settingsButtonRef.current?.contains(event.target)) setSettingsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [settingsOpen])

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
        <Link to="/about" className="topbar-about" aria-label="About midnight" title="About midnight"><CircleHelp size={19} /></Link>
        {isAuthenticated && <Link to="/notifications" className="topbar-notifications" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`} title="Notifications"><Bell size={18} />{unreadNotifications > 0 && <b>{unreadNotifications > 99 ? '99+' : unreadNotifications}</b>}</Link>}
        <button ref={settingsButtonRef} className="theme-toggle settings-toggle" type="button" onClick={() => setSettingsOpen(open => !open)} aria-label="Settings" aria-expanded={settingsOpen} aria-controls="settings-panel" title="Settings">
          <Settings size={18} />
        </button>
      </div>
      {settingsOpen && <section className="settings-panel" id="settings-panel" ref={settingsRef} role="dialog" aria-label="Display settings">
        <header className="settings-panel-heading"><span><Settings size={17} /> Settings</span><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header>
        <div className="settings-group">
          <h2>Display size</h2>
          <div className="settings-choice-row" role="group" aria-label="Display size">
            {[['small', 'Small'], ['standard', 'Standard'], ['large', 'Large']].map(([value, label]) => <button type="button" key={value} aria-pressed={displaySize === value} className={displaySize === value ? 'selected' : ''} onClick={() => setDisplaySize(value)}>{label}</button>)}
          </div>
        </div>
        <div className="settings-group settings-theme-row">
          <span><Moon size={16} /> Night mode</span>
          <button type="button" role="switch" aria-label="Night mode" aria-checked={theme === 'dark'} className={`settings-switch${theme === 'dark' ? ' on' : ''}`} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}><span /></button>
        </div>
        <div className="settings-group">
          <h2><Type size={15} /> Font style</h2>
          <div className="settings-choice-row settings-font-choices" role="group" aria-label="Font style">
            <button type="button" aria-pressed={fontStyle === 'classic'} className={fontStyle === 'classic' ? 'selected' : ''} onClick={() => setFontStyle('classic')}><span className="font-choice-serif">Aa</span><small>Classic</small></button>
            <button type="button" aria-pressed={fontStyle === 'inter'} className={fontStyle === 'inter' ? 'selected' : ''} onClick={() => setFontStyle('inter')}><span className="font-choice-inter">Aa</span><small>Inter + Arial</small></button>
          </div>
          <p className="settings-hint">Inter for reading, Arial headings, and Georgia italics.</p>
        </div>
        <div className="settings-group settings-feedback-row">
          <span>Help shape midnight</span>
          <button type="button" onClick={() => { setSettingsOpen(false); window.dispatchEvent(new Event('midnight:open-feedback')); navigate('/about?feedback=1') }}>Send feedback <MessageCircle size={15} /></button>
        </div>
      </section>}
    </header>
    {!isAuthPage && <aside className="sidebar" aria-label="Main navigation">
      <nav>{navItems.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} aria-label={label} title={label} className={({ isActive }) => `side-link${isActive ? ' active' : ''}${to === '/notifications' ? ' notifications-nav-link' : ''}`}>
        <Icon size={18} strokeWidth={1.7} /><span>{label}</span>{to === '/messages' && unreadMessages > 0 && <b className="nav-unread" aria-label={`${unreadMessages} unread messages`}>{unreadMessages > 99 ? '99+' : unreadMessages}</b>}{to === '/notifications' && unreadNotifications > 0 && <b className="nav-unread notification-nav-unread" aria-label={`${unreadNotifications} unread notifications`}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</b>}
      </NavLink>)}<Link to={accountUrl} className={`side-link side-profile-link${location.pathname.startsWith('/profile/') || location.pathname === '/account' ? ' active' : ''}`} aria-label="Profile" title="Profile">
        {user?.avatar_url ? <img className="side-profile-avatar" src={resolveAssetUrl(user.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="side-profile-avatar side-profile-avatar-fallback"><UserIcon size={17} /></span>}
        <span>Profile</span>
      </Link></nav>
    </aside>}
  </>
}
