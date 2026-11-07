import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Send } from 'lucide-react'
import { postService } from '../services/posts'
import { resolveAssetUrl } from '../services/api'

export default function PostEngagement({ post, isAuthenticated }) {
  const [liked, setLiked] = useState(Boolean(post.liked_by_me))
  const [likeCount, setLikeCount] = useState(post.like_count || 0)
  const [commentCount, setCommentCount] = useState(post.comment_count || 0)
  const [comments, setComments] = useState([])
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyCommentLikes, setBusyCommentLikes] = useState(() => new Set())
  const busyCommentLikesRef = useRef(new Set())
  const [error, setError] = useState('')

  const toggleLike = async () => {
    if (!isAuthenticated || busy) return
    setBusy(true); setError('')
    try {
      const result = await postService.toggleLike(post.id)
      setLiked(result.liked); setLikeCount(result.like_count)
    } catch (err) { setError(err.response?.data?.error || 'Like could not be saved.') }
    finally { setBusy(false) }
  }

  const toggleComments = async () => {
    const next = !open
    setOpen(next); setError('')
    if (next && comments.length === 0) {
      try { setComments(await postService.getComments(post.id)) }
      catch (err) { setError(err.response?.data?.error || 'Comments could not be loaded.') }
    }
  }

  const submitComment = async event => {
    event.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true); setError('')
    try {
      const result = await postService.addComment(post.id, body.trim())
      setComments(current => [...current, result.comment]); setCommentCount(result.comment_count); setBody('')
    } catch (err) { setError(err.response?.data?.error || 'Comment could not be saved.') }
    finally { setBusy(false) }
  }

  const toggleCommentLike = async comment => {
    if (!isAuthenticated || busyCommentLikesRef.current.has(comment.id)) return
    busyCommentLikesRef.current.add(comment.id)
    const previousLiked = Boolean(comment.liked_by_me)
    const previousCount = comment.like_count || 0
    setBusyCommentLikes(current => new Set(current).add(comment.id))
    setComments(current => current.map(item => item.id === comment.id ? {
      ...item, liked_by_me: !previousLiked, like_count: Math.max(0, previousCount + (previousLiked ? -1 : 1)),
    } : item))
    try {
      const result = await postService.toggleCommentLike(comment.id)
      setComments(current => current.map(item => item.id === comment.id ? { ...item, liked_by_me: result.liked, like_count: result.like_count } : item))
    } catch (err) {
      setComments(current => current.map(item => item.id === comment.id ? { ...item, liked_by_me: previousLiked, like_count: previousCount } : item))
      setError(err.response?.data?.error || 'Comment like could not be saved.')
    } finally {
      busyCommentLikesRef.current.delete(comment.id)
      setBusyCommentLikes(current => { const next = new Set(current); next.delete(comment.id); return next })
    }
  }

  return <section className="post-engagement" aria-label="Post reactions and comments">
    <div className="engagement-actions">
      {isAuthenticated ? <button className={`engagement-button${liked ? ' is-liked' : ''}`} onClick={toggleLike} disabled={busy} aria-pressed={liked}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /> <span>{likeCount}</span><span className="sr-only">likes</span></button> : <Link className="engagement-button" to="/login"><Heart size={17} /> <span>{likeCount}</span><span className="sr-only">likes; sign in to like</span></Link>}
      <button className="engagement-button" onClick={toggleComments} aria-expanded={open}><MessageCircle size={17} /><span>{commentCount}</span><span>Comments</span></button>
    </div>
    {open && <div className="comment-panel">
      {comments.map(comment => <article className="post-comment" key={comment.id}>
        {comment.author.avatar_url
          ? <img className="comment-avatar" src={resolveAssetUrl(comment.author.avatar_url)} alt="" loading="lazy" referrerPolicy="no-referrer" />
          : <span className="comment-avatar comment-avatar-fallback" aria-hidden="true">{(comment.author.display_name || comment.author.username || '?').slice(0, 1).toUpperCase()}</span>}
        <div className="comment-main">
          <div className="comment-byline"><strong>{comment.author.display_name}</strong>{comment.author.id === post.author_id && <b className="author-badge">Author</b>}<time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time></div>
          <p>{comment.body}</p>
        </div>
        <button className={`comment-like${comment.liked_by_me ? ' is-liked' : ''}`} type="button" onClick={() => toggleCommentLike(comment)} disabled={!isAuthenticated || busyCommentLikes.has(comment.id)} aria-pressed={Boolean(comment.liked_by_me)} aria-label={`${comment.liked_by_me ? 'Unlike' : 'Like'} comment, ${comment.like_count || 0} likes`} title={isAuthenticated ? 'Like comment' : 'Sign in to like comments'}>
          <Heart size={16} fill={comment.liked_by_me ? 'currentColor' : 'none'} /><span>{comment.like_count || 0}</span>
        </button>
      </article>)}
      {comments.length === 0 && <p className="comments-empty">No comments yet. You can begin.</p>}
      {isAuthenticated ? <form className="comment-form" onSubmit={submitComment}><textarea value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={2000} placeholder="Write a comment..." aria-label="Write a comment" /><button type="submit" disabled={!body.trim() || busy} aria-label="Post comment"><Send size={16} /></button></form> : <p className="comments-empty"><Link to="/login">Sign in</Link> to leave a comment.</p>}
      {error && <p className="inline-error">{error}</p>}
    </div>}
  </section>
}
