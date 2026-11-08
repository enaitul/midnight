import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { postService } from '../services/posts'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle, User as UserIcon, MoreVertical, Edit3, Trash2 } from 'lucide-react'
import BookmarkButton from '../components/BookmarkButton'
import PostEngagement from '../components/PostEngagement'
import PostMediaDisplay from '../components/PostMediaDisplay'
import { resolveAssetUrl } from '../services/api'
import { formatTimestamp } from '../utils/formatTimestamp'
import InfiniteScrollSentinel from '../components/InfiniteScrollSentinel'

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
  const [nextPage, setNextPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [deletingPostId, setDeletingPostId] = useState(null)
  const loadingMoreRef = useRef(false)
  const { user, isAuthenticated } = useAuth()

  const loadFeed = async (page = 1, append = false) => {
    if (append && loadingMoreRef.current) return
    if (append) { loadingMoreRef.current = true; setLoadingMore(true) }
    else { setLoading(true); setPosts([]); setNextPage(1); setHasMore(true) }
    setError(null)
    try {
      const data = await postService.getFeed(page, 8)
      setPosts(current => append ? [...current, ...(data.posts || [])] : data.posts || [])
      setNextPage((data.page || page) + 1)
      setHasMore(Boolean(data.has_next))
    } catch (err) {
      setError(err.response?.data?.error || 'The writings could not be loaded.')
      if (append) setHasMore(false)
    } finally {
      if (append) { loadingMoreRef.current = false; setLoadingMore(false) }
      else setLoading(false)
    }
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
      setPosts(current => current.filter(item => item.id !== post.id))
    } catch (err) {
      setError(err.response?.data?.error || 'The post could not be deleted.')
    } finally { setDeletingPostId(null) }
  }

  return <div className="feed-page">
    <header className="feed-intro">
      <p className="welcome-line">Welcome to midnight. <Link to={isAuthenticated ? '/write' : '/register'}>Start a post?</Link></p>
      <h1>Recent writings</h1>
    </header>
    {error && <div className="message-error"><AlertCircle size={17} />{error}</div>}
    {loading ? <div className="loading-state"><Loader size={22} className="animate-spin" /></div> : posts.length === 0 ? <p className="feed-empty">No writings here yet.</p> : <div className="feed-list">
      {posts.map(post => <article key={post.id} className="feed-entry">
        <div className="entry-meta">
          {post.author?.avatar_url ? <img src={resolveAssetUrl(post.author.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="avatar-fallback"><UserIcon size={14} /></span>}
          <Link to={`/profile/${encodeURIComponent(post.author?.username || '')}`} className="entry-author">{post.author?.display_name || post.author?.username || 'Unknown'}</Link>
          <span aria-hidden="true">·</span>
          <time dateTime={post.published_at || post.created_at}>{formatTimestamp(post.published_at || post.created_at) || 'Recently'}</time>
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
      <InfiniteScrollSentinel enabled={hasMore && !loading && !loadingMore} onVisible={() => loadFeed(nextPage, true)} />
      {loadingMore && <div className="infinite-scroll-loading" role="status"><Loader size={18} className="animate-spin" /> Loading more writings</div>}
    </div>}
  </div>
}
