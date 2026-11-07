import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { postService } from '../services/posts'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle, ChevronLeft, ChevronRight, User as UserIcon, MoreVertical, Edit3, Trash2 } from 'lucide-react'
import BookmarkButton from '../components/BookmarkButton'
import PostEngagement from '../components/PostEngagement'
import PostMediaDisplay from '../components/PostMediaDisplay'
import { resolveAssetUrl } from '../services/api'

function PostOwnerMenu({ post, onDelete, deleting }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => { if (!menuRef.current?.contains(event.target)) setOpen(false) }
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className="entry-owner-actions" ref={menuRef}>
    <button className="entry-owner-menu-trigger" type="button" aria-label="Post options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <MoreVertical size={18} />
    </button>
    {open && <div className="entry-owner-menu" role="menu">
      <Link role="menuitem" to={`/write/${post.id}`} onClick={() => setOpen(false)}><Edit3 size={15} /> Edit</Link>
      <button type="button" role="menuitem" disabled={deleting} onClick={() => { setOpen(false); onDelete(post) }}><Trash2 size={15} /> Delete</button>
    </div>}
  </div>
}

export default function Home() {
  const [posts, setPosts] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingPostId, setDeletingPostId] = useState(null)
  const { user, isAuthenticated } = useAuth()

  const loadFeed = async (page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const data = await postService.getFeed(page, 8)
      setPosts(data.posts || [])
      setPagination({ page: data.page, pages: data.pages, total: data.total })
    } catch (err) {
      setError(err.response?.data?.error || 'The writings could not be loaded.')
    } finally { setLoading(false) }
  }
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    loadFeed(1)
  }, [])

  const deletePost = async post => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setDeletingPostId(post.id)
    setError(null)
    try {
      await postService.deletePost(post.id)
      const nextPage = Math.min(pagination.page, Math.max(1, Math.ceil((pagination.total - 1) / 8)))
      await loadFeed(nextPage)
    } catch (err) {
      setError(err.response?.data?.error || 'The post could not be deleted.')
    } finally { setDeletingPostId(null) }
  }

  return <div className="feed-page">
    <header className="feed-intro">
      <p className="welcome-line">{isAuthenticated ? `Welcome back, ${user?.display_name || user?.username}.` : 'Welcome to midnight.'}{' '}
        <Link to={isAuthenticated ? '/write' : '/register'}>Begin a new page?</Link>
      </p>
      <h1>Recent writings</h1>
    </header>
    {error && <div className="message-error"><AlertCircle size={17} />{error}</div>}
    {loading ? <div className="loading-state"><Loader size={22} className="animate-spin" /></div> : posts.length === 0 ? <p className="feed-empty">No writings here yet.</p> : <div className="feed-list">
      {posts.map(post => <article key={post.id} className="feed-entry">
        <div className="entry-meta">
          {post.author?.avatar_url ? <img src={resolveAssetUrl(post.author.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="avatar-fallback"><UserIcon size={14} /></span>}
          <Link to={`/profile/${encodeURIComponent(post.author?.username || '')}`} className="entry-author">{post.author?.display_name || post.author?.username || 'Unknown'}</Link>
          <span aria-hidden="true">·</span>
          <time dateTime={post.published_at || undefined}>{post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recently'}</time>
          {isAuthenticated && post.author?.id === user?.id && <PostOwnerMenu post={post} onDelete={deletePost} deleting={deletingPostId === post.id} />}
        </div>
        {post.title && <Link to={`/post/${post.id}`} className="entry-title-link"><h2>{post.title}</h2></Link>}
        <div className="entry-content">{post.content || ''}</div>
        <PostMediaDisplay media={post.media} />
        <div className="feed-entry-actions">
          <PostEngagement post={post} isAuthenticated={isAuthenticated} />
          <BookmarkButton postId={post.id} isAuthenticated={isAuthenticated} />
        </div>
      </article>)}
      {pagination.pages > 1 && <div className="pagination"><button onClick={() => loadFeed(pagination.page - 1)} disabled={pagination.page <= 1}><ChevronLeft size={16} /> Previous</button><span>{pagination.page} / {pagination.pages}</span><button onClick={() => loadFeed(pagination.page + 1)} disabled={pagination.page >= pagination.pages}>Next <ChevronRight size={16} /></button></div>}
    </div>}
  </div>
}
