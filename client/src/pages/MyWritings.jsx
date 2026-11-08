import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { postService } from '../services/posts'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle, Edit3, Trash2, Plus, FileText, Globe } from 'lucide-react'
import PostMediaDisplay from '../components/PostMediaDisplay'
import { formatTimestamp } from '../utils/formatTimestamp'
import InfiniteScrollSentinel from '../components/InfiniteScrollSentinel'

export default function MyWritings() {
  const [activeTab, setActiveTab] = useState('all') // 'all', 'draft', 'published'
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPage, setNextPage] = useState(2)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const loadingMoreRef = useRef(false)
  const generationRef = useRef(0)

  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const generation = ++generationRef.current
    loadingMoreRef.current = false
    setLoadingMore(false)
    setPosts([])
    setNextPage(2)
    setHasMore(false)
    setLoading(true)
    setError(null)
    if (!isAuthenticated) {
      navigate('/login')
      setLoading(false)
      return
    }
    const filter = activeTab === 'all' ? '' : activeTab
    postService.getMyPosts(filter, 1, 15).then(data => {
      if (generation !== generationRef.current) return
      setPosts(data.posts || [])
      setNextPage((data.page || 1) + 1)
      setHasMore(Boolean(data.has_next))
    }).catch(err => {
      if (generation === generationRef.current) setError(err.response?.data?.error || 'Failed to retrieve your writings.')
    }).finally(() => { if (generation === generationRef.current) setLoading(false) })
    return () => { if (generation === generationRef.current) generationRef.current += 1 }
  }, [activeTab, isAuthenticated, navigate])

  const loadMore = async () => {
    if (!hasMore || loading || loadingMoreRef.current) return
    const generation = generationRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const filter = activeTab === 'all' ? '' : activeTab
      const data = await postService.getMyPosts(filter, nextPage, 15)
      if (generation !== generationRef.current) return
      setPosts(current => [...current, ...(data.posts || [])])
      setNextPage((data.page || nextPage) + 1)
      setHasMore(Boolean(data.has_next))
    } catch (err) {
      if (generation === generationRef.current) {
        setError(err.response?.data?.error || 'More writings could not be loaded.')
        setHasMore(false)
      }
    } finally {
      if (generation === generationRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

  const handleDelete = async (postId, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) {
      return
    }

    try {
      await postService.deletePost(postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete post.')
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Page Title & Action */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#22222d]">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight mb-1">My Writings</h1>
        </div>

        <Link
          to="/write"
          className="flex items-center gap-1.5 bg-accent/20 hover:bg-accent/30 text-primary border border-accent/40 text-xs px-3.5 py-2 rounded-lg transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Writing</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-8">
        <button
          onClick={() => setActiveTab('all')}
          className={`text-xs px-3.5 py-1.5 rounded-lg transition ${
            activeTab === 'all'
              ? 'bg-surface text-primary border border-[#2e2e3d]'
              : 'text-muted hover:text-primary'
          }`}
        >
          All Pieces
        </button>
        <button
          onClick={() => setActiveTab('published')}
          className={`flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg transition ${
            activeTab === 'published'
              ? 'bg-surface text-primary border border-[#2e2e3d]'
              : 'text-muted hover:text-primary'
          }`}
        >
          <Globe className="w-3 h-3 text-accent" />
          <span>Published</span>
        </button>
        <button
          onClick={() => setActiveTab('draft')}
          className={`flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg transition ${
            activeTab === 'draft'
              ? 'bg-surface text-primary border border-[#2e2e3d]'
              : 'text-muted hover:text-primary'
          }`}
        >
          <FileText className="w-3 h-3 text-yellow-500/80" />
          <span>Drafts</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader className="w-6 h-6 text-accent animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 bg-surface/40 border border-[#242430] rounded-2xl p-8">
          <FileText className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="font-heading text-lg font-semibold mb-1">No writings found</h3>
          <p className="font-writing text-muted text-xs mb-6">
            {activeTab === 'draft'
              ? 'You have no unfinished drafts.'
              : activeTab === 'published'
              ? 'You have not published any stories yet.'
              : 'Your pages are currently blank.'}
          </p>
          <Link
            to="/write"
            className="text-xs bg-accent/20 hover:bg-accent/30 border border-accent/40 text-primary px-4 py-2 rounded-lg transition"
          >
            Start your first piece
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-surface/60 hover:bg-surface border border-[#242430] hover:border-[#303040] rounded-xl p-5 transition flex items-start justify-between gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                      post.status === 'published'
                        ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40'
                        : 'bg-yellow-950/30 text-yellow-300 border-yellow-800/40'
                    }`}
                  >
                    {post.status}
                  </span>
                  <span className="text-[11px] text-muted">
                    Last updated{' '}
                    {formatTimestamp(post.updated_at || post.created_at)}
                  </span>
                </div>

                <Link
                  to={post.status === 'published' ? `/post/${post.id}` : `/write/${post.id}`}
                  className="font-heading text-xl font-bold text-primary hover:text-white transition block mb-1"
                >
                  {post.title || 'Untitled piece'}
                </Link>

                <p className="font-writing text-sm text-muted line-clamp-2">{post.excerpt}</p>
                <PostMediaDisplay media={post.media || []} privateMedia={post.status === 'draft'} />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0 pt-1">
                <Link
                  to={`/write/${post.id}`}
                  className="p-2 text-muted hover:text-primary hover:bg-[#252532] rounded-lg transition"
                  title="Edit writing"
                >
                  <Edit3 className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => handleDelete(post.id, post.title || 'Untitled piece')}
                  className="p-2 text-muted hover:text-red-400 hover:bg-red-950/20 rounded-lg transition"
                  title="Delete writing"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <InfiniteScrollSentinel enabled={hasMore && !loading && !loadingMore} onVisible={loadMore} />
          {loadingMore && <div className="infinite-scroll-loading" role="status"><Loader className="w-5 h-5 text-accent animate-spin" /> Loading more writings</div>}
        </div>
      )}
    </div>
  )
}

