import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Heart, MessageCircle, UserRoundPlus, Loader } from 'lucide-react'
import { communityService } from '../services/community'
import { resolveAssetUrl } from '../services/api'

const iconFor = kind => kind === 'like' ? Heart : kind === 'comment' ? MessageCircle : UserRoundPlus

function description(kind) {
  if (kind === 'like') return 'liked your writing.'
  if (kind === 'comment') return 'commented on your writing.'
  return 'started following you.'
}

export default function Notifications() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    communityService.notifications().then(async data => {
      if (!alive) return
      setItems(data.notifications)
      await communityService.markAllNotificationsRead()
      if (alive) {
        setItems(current => current.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
        window.dispatchEvent(new Event('midnight:notifications-read'))
      }
    }).catch(err => { if (alive) setError(err.response?.data?.error || 'Notifications could not be loaded.') })
      .finally(() => { if (alive) setLoading(false) })
    const receive = event => setItems(current => [event.detail, ...current.filter(item => item.id !== event.detail.id)])
    window.addEventListener('midnight:new-notification', receive)
    return () => { alive = false; window.removeEventListener('midnight:new-notification', receive) }
  }, [])

  return <section className="community-page notifications-page">
    <p className="eyebrow">A little sign of connection</p><h1><Bell size={25} strokeWidth={1.5} /> Notifications</h1>
    {error && <p className="inline-error">{error}</p>}
    {loading ? <div className="loading-state"><Loader size={22} className="animate-spin" /></div> : items.length === 0 ? <p className="feed-empty">Nothing new just yet.</p> : <div className="notification-list">{items.map(item => {
      const Icon = iconFor(item.kind)
      return <article key={item.id} className={`notification-item${item.read_at ? '' : ' unread'}`}>
        {item.actor.avatar_url ? <img src={resolveAssetUrl(item.actor.avatar_url)} alt="" /> : <span className="notification-avatar"><Icon size={16} /> </span>}
        <div><p><Link to={`/profile/${encodeURIComponent(item.actor.username)}`}>{item.actor.display_name || item.actor.username}</Link> {description(item.kind)}{item.post_id && <> <Link to={`/post/${item.post_id}`}>{item.post_title || 'Untitled piece'}</Link></>}</p><time>{new Date(item.created_at).toLocaleString()}</time></div>
      </article>
    })}</div>}
  </section>
}
