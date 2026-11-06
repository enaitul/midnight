import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Send } from 'lucide-react'
import { postService } from '../services/posts'

export default function PostEngagement({ post, isAuthenticated }) {
  const [liked, setLiked] = useState(Boolean(post.liked_by_me))
  const [likeCount, setLikeCount] = useState(post.like_count || 0)
  const [commentCount, setCommentCount] = useState(post.comment_count || 0)
  const [comments, setComments] = useState([])
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
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

  return <section className="post-engagement" aria-label="Post reactions and comments">
    <div className="engagement-actions">
      {isAuthenticated ? <button className={`engagement-button${liked ? ' is-liked' : ''}`} onClick={toggleLike} disabled={busy} aria-pressed={liked}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /> <span>{likeCount}</span><span className="sr-only">likes</span></button> : <Link className="engagement-button" to="/login"><Heart size={17} /> <span>{likeCount}</span><span className="sr-only">likes; sign in to like</span></Link>}
      <button className="engagement-button" onClick={toggleComments} aria-expanded={open}><MessageCircle size={17} /><span>{commentCount}</span><span>Comments</span></button>
    </div>
    {open && <div className="comment-panel">
      {comments.map(comment => <article className="post-comment" key={comment.id}>
        <div><strong>{comment.author.display_name}</strong><span>@{comment.author.username}</span>{comment.author.id === post.author_id && <b className="author-badge">Author</b>}</div>
        <p>{comment.body}</p>
      </article>)}
      {comments.length === 0 && <p className="comments-empty">No comments yet. You can begin.</p>}
      {isAuthenticated ? <form className="comment-form" onSubmit={submitComment}><textarea value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={2000} placeholder="Write a comment..." aria-label="Write a comment" /><button type="submit" disabled={!body.trim() || busy} aria-label="Post comment"><Send size={16} /></button></form> : <p className="comments-empty"><Link to="/login">Sign in</Link> to leave a comment.</p>}
      {error && <p className="inline-error">{error}</p>}
    </div>}
  </section>
}
