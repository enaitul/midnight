import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { postService } from '../services/posts'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle, ArrowLeft, Send, Bookmark, ImagePlus, X, ChevronUp, ChevronDown } from 'lucide-react'

const MEDIA_LIMITS = { image: 10, video: 100, audio: 25 }
const MEDIA_MIMES = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'video/mp4': 'video', 'video/webm': 'video',
  'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/wav': 'audio', 'audio/x-wav': 'audio',
  'audio/wave': 'audio', 'audio/ogg': 'audio', 'application/ogg': 'audio', 'audio/vorbis': 'audio',
  'audio/mp4': 'audio', 'audio/x-m4a': 'audio', 'audio/m4a': 'audio',
}

export default function Write() {
  const { id } = useParams() // Post ID if in edit mode
  const isEditMode = Boolean(id)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('draft')
  const [loading, setLoading] = useState(isEditMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [mediaItems, setMediaItems] = useState([])
  const previewUrls = useRef(new Map())
  const initialMediaIds = useRef(new Set())

  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url))
    previewUrls.current.clear()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    if (!isAuthenticated) {
      navigate('/login')
      return () => controller.abort()
    }

    if (isEditMode) {
      const fetchPost = async () => {
        try {
          const post = await postService.getPostById(id)
          if (controller.signal.aborted) return
          setTitle(post.title)
          setContent(post.content)
          setStatus(post.status)
          const savedMedia = post.media || []
          initialMediaIds.current = new Set(savedMedia.map(media => media.id))
          setMediaItems(savedMedia.map(media => ({ key: `saved-${media.id}`, kind: 'saved', media })))
          if (post.status === 'draft') savedMedia.forEach(media => {
            const key = `saved-${media.id}`
            postService.getMediaPreview(media.url).then(url => {
              if (controller.signal.aborted) { URL.revokeObjectURL(url); return }
              previewUrls.current.set(key, url)
              setMediaItems(current => current.map(item => item.key === key ? { ...item, previewUrl: url } : item))
            }).catch(() => setError('A saved media preview could not be loaded.'))
          })
        } catch (err) {
          if (!controller.signal.aborted) setError(err.response?.data?.error || 'Failed to load post for editing.')
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      }
      fetchPost()
    }
    return () => controller.abort()
  }, [id, isEditMode, isAuthenticated, navigate])

  const addFiles = event => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    const accepted = []
    let issue = ''
    for (const file of selected) {
      const type = MEDIA_MIMES[file.type]
      if (!type) { issue = 'Choose JPEG, PNG, WebP, MP4, WebM, MP3, WAV, OGG, or M4A files.'; continue }
      if (file.size > MEDIA_LIMITS[type] * 1024 * 1024) { issue = `Each ${type} file must be ${MEDIA_LIMITS[type]} MB or smaller.`; continue }
      accepted.push({ key: `pending-${crypto.randomUUID()}`, kind: 'pending', file, mediaType: type })
    }
    const available = Math.max(0, 10 - mediaItems.length)
    const additions = accepted.slice(0, available).map(item => ({ ...item, previewUrl: URL.createObjectURL(item.file) }))
    if (accepted.length > available) issue = 'A post can contain up to 10 media attachments.'
    additions.forEach(item => previewUrls.current.set(item.key, item.previewUrl))
    if (additions.length) setMediaItems(current => [...current, ...additions])
    setError(issue)
  }

  const removeMediaItem = item => {
    const preview = previewUrls.current.get(item.key)
    if (preview) { URL.revokeObjectURL(preview); previewUrls.current.delete(item.key) }
    setMediaItems(current => current.filter(candidate => candidate.key !== item.key))
  }

  const moveMediaItem = (index, direction) => setMediaItems(current => {
    const target = index + direction
    if (target < 0 || target >= current.length) return current
    const reordered = [...current]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    return reordered
  })

  const handleSave = async (targetStatus) => {
    if (!content.trim() && mediaItems.length === 0) {
      setError('Write something or attach a picture, audio recording, or video.')
      return
    }

    setError(null)
    setSaving(true)

    let postId = isEditMode ? id : null
    let createdNewPost = false
    let postUpdated = false
    const uploaded = []
    try {
      const pending = mediaItems.filter(item => item.kind === 'pending')
      if (!isEditMode) {
        const created = await postService.createPost(title.trim(), content.trim(), pending.length ? 'draft' : targetStatus, pending.length > 0)
        postId = created.id
        createdNewPost = true
      } else if (targetStatus === 'draft' && status === 'published') {
        // Hide a published post before attaching media that should remain private.
        await postService.updatePost(postId, { title: title.trim(), content: content.trim(), status: 'draft' })
        postUpdated = true
      }

      const uploadedByKey = new Map()
      for (const item of pending) {
        const [media] = await postService.addMedia(postId, [item.file])
        uploaded.push(media.id)
        uploadedByKey.set(item.key, media.id)
      }

      if (isEditMode || pending.length) {
        await postService.updatePost(postId, { title: title.trim(), content: content.trim(), status: targetStatus })
        postUpdated = true
      }

      if (isEditMode) {
        const keptIds = new Set(mediaItems.filter(item => item.kind === 'saved').map(item => item.media.id))
        const removedIds = [...initialMediaIds.current].filter(mediaId => !keptIds.has(mediaId))
        for (const mediaId of removedIds) await postService.removeMedia(postId, mediaId)
        const order = mediaItems.map(item => item.kind === 'saved' ? item.media.id : uploadedByKey.get(item.key))
        if (order.length !== mediaItems.length || order.some(mediaId => !mediaId)) throw new Error('An attachment could not be ordered.')
        await postService.reorderMedia(postId, order)
      }

      navigate(targetStatus === 'published' ? `/post/${postId}` : '/my-writings')
    } catch (err) {
      if (!postUpdated) {
        for (const mediaId of uploaded) {
          try { await postService.removeMedia(postId, mediaId) } catch { /* Keep the draft if cleanup is unavailable. */ }
        }
        if (createdNewPost && postId) {
          try { await postService.deletePost(postId) } catch { /* A recoverable draft may remain. */ }
        }
      } else if (isEditMode) {
        try {
          const latest = await postService.getPostById(postId)
          const savedMedia = latest.media || []
          initialMediaIds.current = new Set(savedMedia.map(media => media.id))
          const refreshedItems = savedMedia.map(media => ({ key: `saved-${media.id}`, kind: 'saved', media }))
          if (latest.status === 'draft') {
            for (const item of refreshedItems) {
              try {
                const url = await postService.getMediaPreview(item.media.url)
                item.previewUrl = url
                previewUrls.current.set(item.key, url)
              } catch { /* The editor remains usable if a preview is unavailable. */ }
            }
          }
          setMediaItems(refreshedItems)
          setTitle(latest.title || '')
          setContent(latest.content || '')
          setStatus(latest.status)
        } catch { /* Preserve the original error if the refresh also fails. */ }
      }
      setError(err.response?.data?.error || 'Failed to save post.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Top Bar Controls */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-primary bg-surface hover:bg-[#202028] border border-[#2c2c3b] px-3.5 py-2 rounded-lg transition disabled:opacity-50"
          >
            <Bookmark className="w-3.5 h-3.5 text-accent" />
            <span>Save Draft</span>
          </button>

          <button
            onClick={() => handleSave('published')}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs text-primary bg-accent/25 hover:bg-accent/35 border border-accent/50 px-4 py-2 rounded-lg transition font-medium disabled:opacity-50"
          >
            {saving ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{isEditMode && status === 'published' ? 'Update Post' : 'Publish'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Title Input */}
      <input
        type="text"
        aria-label="Writing title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-transparent font-heading text-3xl md:text-5xl font-bold tracking-tight text-primary placeholder-muted/60 focus:outline-none mb-6 border-b border-transparent focus:border-[#2a2a38] pb-3 transition"
        autoFocus
      />

      {/* Long-form Content Editor */}
      <textarea
        aria-label="Writing content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Pour your thoughts into the dark. Tell a story, draft an essay, or whisper a poem..."
        rows={16}
        className="w-full bg-transparent font-writing text-lg md:text-xl text-primary placeholder-muted/50 focus:outline-none resize-none leading-relaxed"
      />
      <div className="media-picker">
        <label className="outline-action media-pick"><ImagePlus size={16} /> Add photos, audio, or video
          <input type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,video/mp4,video/webm" multiple onChange={addFiles} />
        </label>
        <small>Up to 10 attachments: images up to 10 MB, audio up to 25 MB, and video up to 100 MB each. JPEG, PNG, WebP, MP3, WAV, OGG, M4A, MP4, WebM.</small>
        <div className="media-preview-grid">
          {mediaItems.map((item, index) => {
            const mediaType = item.kind === 'saved' ? item.media.media_type : item.mediaType
            const url = item.kind === 'saved'
              ? (status === 'draft' ? item.previewUrl : item.media.url)
              : item.previewUrl
            return <figure className="media-preview-card" key={item.key}>
              {url && mediaType === 'image' && <img src={url} alt="Attached photo preview" />}
              {url && mediaType === 'video' && <video controls playsInline src={url} />}
              {url && mediaType === 'audio' && <audio controls src={url} />}
              {!url && <span className="media-preview-loading">Loading preview…</span>}
              <figcaption>{mediaType === 'image' ? 'Photo' : mediaType === 'video' ? 'Video' : 'Audio'}</figcaption>
              <div className="media-preview-actions">
                <button type="button" aria-label="Move attachment up" disabled={index === 0} onClick={() => moveMediaItem(index, -1)}><ChevronUp size={15} /></button>
                <button type="button" aria-label="Move attachment down" disabled={index === mediaItems.length - 1} onClick={() => moveMediaItem(index, 1)}><ChevronDown size={15} /></button>
                <button type="button" aria-label="Remove attachment" onClick={() => removeMediaItem(item)}><X size={15} /></button>
              </div>
            </figure>
          })}
        </div>
      </div>
    </div>
  )
}

