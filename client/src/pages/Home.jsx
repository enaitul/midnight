import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { postService } from '../services/posts'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle, ChevronLeft, ChevronRight, User as UserIcon } from 'lucide-react'
import BookmarkButton from '../components/BookmarkButton'
import PostEngagement from '../components/PostEngagement'
import PostMediaDisplay from '../components/PostMediaDisplay'
import { resolveAssetUrl } from '../services/api'

export default function Home() {
  const [posts, setPosts] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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
  useEffect(() => { loadFeed(1) }, [])

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
          <BookmarkButton postId={post.id} isAuthenticated={isAuthenticated} />
        </div>
        {post.title && <Link to={`/post/${post.id}`} className="entry-title-link"><h2>{post.title}</h2></Link>}
        <div className="entry-content">{post.content || ''}</div>
        <PostMediaDisplay media={post.media} />
        <PostEngagement post={post} isAuthenticated={isAuthenticated} />
      </article>)}
      {pagination.pages > 1 && <div className="pagination"><button onClick={() => loadFeed(pagination.page - 1)} disabled={pagination.page <= 1}><ChevronLeft size={16} /> Previous</button><span>{pagination.page} / {pagination.pages}</span><button onClick={() => loadFeed(pagination.page + 1)} disabled={pagination.page >= pagination.pages}>Next <ChevronRight size={16} /></button></div>}
    </div>}
  </div>
}
