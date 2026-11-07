import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { postService } from '../services/posts'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle, ArrowLeft, Edit3, Trash2, Calendar, User as UserIcon } from 'lucide-react'
import BookmarkButton from '../components/BookmarkButton'
import PostEngagement from '../components/PostEngagement'
import PostMediaDisplay from '../components/PostMediaDisplay'
import { resolveAssetUrl } from '../services/api'
import { formatTimestamp } from '../utils/formatTimestamp'

export default function PostDetail() {
  const { id } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const data = await postService.getPostById(id)
        setPost(data)
      } catch (err) {
        setError(err.response?.data?.error || 'Post not found or unavailable.')
      } finally {
        setLoading(false)
      }
    }
    fetchPost()
  }, [id])

  const handleDelete = async () => {
    if (!window.confirm('Are you certain you wish to delete this writing? This cannot be undone.')) {
      return
    }

    setDeleting(true)
    try {
      await postService.deletePost(id)
      navigate('/my-writings')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete post.')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <AlertCircle className="w-10 h-10 text-muted mx-auto mb-4" />
        <h2 className="font-heading text-2xl font-bold mb-2">Writing Unavailable</h2>
        <p className="font-writing text-muted mb-6">{error || 'This post could not be retrieved.'}</p>
        <Link
          to="/"
          className="text-xs bg-surface hover:bg-[#22222d] border border-[#2b2b3b] px-4 py-2 rounded-lg text-primary transition"
        >
          Return to Feed
        </Link>
      </div>
    )
  }

  const isOwner = isAuthenticated && user?.id === post.author_id
  const postTimestamp = post.published_at || post.created_at

  return (
    <article className="max-w-2xl mx-auto px-6 py-14">
      {/* Back and Controls Header */}
      <div className="flex items-center justify-between mb-10 pb-4 border-b border-[#22222d]">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {isOwner && (
          <div className="flex items-center gap-2">
            {post.status === 'draft' && (
              <span className="text-[10px] uppercase tracking-wider bg-yellow-950/40 text-yellow-300 border border-yellow-800/60 px-2 py-0.5 rounded">
                Draft
              </span>
            )}
            <Link
              to={`/write/${post.id}`}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-primary bg-surface hover:bg-[#202028] border border-[#2b2b3b] px-3 py-1.5 rounded-md transition"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 text-xs text-muted hover:text-red-400 bg-surface hover:bg-red-950/20 border border-[#2b2b3b] hover:border-red-900/40 px-2.5 py-1.5 rounded-md transition disabled:opacity-50"
              title="Delete post"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Post Heading */}
      <header className="mb-10 text-center">
        {post.title && <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight mb-6 leading-tight">{post.title}</h1>}

        {/* Author & Date metadata */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted">
          {post.author?.avatar_url ? (
            <img
              src={resolveAssetUrl(post.author.avatar_url)}
              alt={post.author.username}
              className="w-6 h-6 rounded-full border border-accent/30"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-surface border border-accent/20 flex items-center justify-center text-accent">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
          )}
          <Link to={`/profile/${encodeURIComponent(post.author?.username || '')}`} className="font-medium text-primary">@{post.author?.username || 'Anonymous'}</Link>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <time dateTime={postTimestamp}>{formatTimestamp(postTimestamp)}</time>
          </span>
          <BookmarkButton postId={post.id} isAuthenticated={isAuthenticated} />
        </div>
      </header>

      {/* Post Long-form Body */}
      <div className="font-writing text-lg md:text-xl text-[#dedacf] leading-relaxed whitespace-pre-wrap selection:bg-accent/30">
        {post.content}
      </div>
      <PostMediaDisplay media={post.media} />
      <PostEngagement post={post} isAuthenticated={isAuthenticated} />

      <div className="mt-16 pt-8 border-t border-[#22222d] text-center">
        <p className="font-heading italic text-muted text-sm">— end of writing —</p>
      </div>
    </article>
  )
}

