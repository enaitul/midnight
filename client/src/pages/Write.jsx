import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { postService } from '../services/posts'
import { useAuth } from '../context/AuthContext'
import { Loader, AlertCircle, ArrowLeft, Send, Bookmark, Paperclip, X, ChevronUp, ChevronDown } from 'lucide-react'

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
  const [uploadProgress, setUploadProgress] = useState(null)
  const [hasChanges, setHasChanges] = useState(!isEditMode)
  const [error, setError] = useState(null)
  const [mediaItems, setMediaItems] = useState([])
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const previewUrls = useRef(new Map())
  const initialMediaIds = useRef(new Set())
  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const audioInputRef = useRef(null)

  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url))
    previewUrls.current.clear()
  }, [])

  useEffect(() => {
    if (!hasChanges || saving) return undefined
    const warnBeforeLeaving = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [hasChanges, saving])

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
          setHasChanges(false)
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
    if (additions.length) { setMediaItems(current => [...current, ...additions]); setHasChanges(true) }
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
      for (const [index, item] of pending.entries()) {
        const [media] = await postService.addMedia(postId, [item.file], percent => setUploadProgress(Math.round(((index + percent / 100) / pending.length) * 100)))
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
      setUploadProgress(null)
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
    <main className="writing-studio writing-studio-minimal">
      <div className="writing-studio-header">
        <button onClick={() => navigate(-1)} className="writing-back"><ArrowLeft size={16} /><span>Back</span></button>
        <div className="writing-actions">
          <span className="writing-save-state">{saving ? 'Saving…' : hasChanges ? 'Unsaved changes' : 'All changes saved'}</span>
          <button onClick={() => handleSave('published')} disabled={saving} className="writing-publish-button">
            {saving ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
            {isEditMode && status === 'published' ? 'Update post' : 'Publish'}
          </button>
        </div>
      </div>

      <h1 className="writing-night-prompt">What's on your mind tonight?</h1>

      {error && <div className="writing-error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>}

      <section className="writing-composer-box" aria-label="Write a post">
        <input
          type="text"
          aria-label="Post title"
          value={title}
          onChange={event => { setTitle(event.target.value); setHasChanges(true) }}
          placeholder="Post title"
          className="writing-title"
          autoFocus={!isEditMode}
        />
        <div className="writing-title-divider" />
        <textarea
          aria-label="Write your post here"
          value={content}
          onChange={event => { setContent(event.target.value); setHasChanges(true) }}
          placeholder="Write your post here..."
          rows={15}
          className="writing-editor"
        />

        {mediaItems.length > 0 && <div className="writing-attachment-previews">
          {mediaItems.map((item, index) => {
            const mediaType = item.kind === 'saved' ? item.media.media_type : item.mediaType
            const url = item.kind === 'saved' ? (status === 'draft' ? item.previewUrl : item.media.url) : item.previewUrl
            return <figure className="media-preview-card" key={item.key}>
              {url && mediaType === 'image' && <img src={url} alt="Attached photo preview" />}
              {url && mediaType === 'video' && <video controls playsInline src={url} />}
              {url && mediaType === 'audio' && <audio controls src={url} />}
              {!url && <span className="media-preview-loading">Loading preview…</span>}
              <figcaption>{item.kind === 'pending' ? item.file.name : item.media.original_name}</figcaption>
              <div className="media-preview-actions">
                <button type="button" aria-label="Move attachment up" disabled={index === 0} onClick={() => { moveMediaItem(index, -1); setHasChanges(true) }}><ChevronUp size={15} /></button>
                <button type="button" aria-label="Move attachment down" disabled={index === mediaItems.length - 1} onClick={() => { moveMediaItem(index, 1); setHasChanges(true) }}><ChevronDown size={15} /></button>
                <button type="button" aria-label="Remove attachment" onClick={() => { removeMediaItem(item); setHasChanges(true) }}><X size={15} /></button>
              </div>
            </figure>
          })}
        </div>}

        {uploadProgress !== null && <div className="writing-upload-progress" role="status"><span>Uploading</span><progress value={uploadProgress} max="100" /><small>{uploadProgress}%</small></div>}

        <div className="writing-composer-footer">
          <div className="writing-attachment-control">
            <button type="button" className="writing-clip-button" aria-label="Attach media" aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen(open => !open)}><Paperclip size={19} /></button>
            {attachmentMenuOpen && <div className="writing-attachment-menu" role="menu" aria-label="Choose attachment type">
              <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); imageInputRef.current?.click() }}>Image</button>
              <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); videoInputRef.current?.click() }}>Video</button>
              <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); audioInputRef.current?.click() }}>Audio</button>
            </div>}
            <input ref={imageInputRef} className="writing-hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} aria-label="Choose images" />
            <input ref={videoInputRef} className="writing-hidden-file-input" type="file" accept="video/mp4,video/webm" multiple onChange={addFiles} aria-label="Choose videos" />
            <input ref={audioInputRef} className="writing-hidden-file-input" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a" multiple onChange={addFiles} aria-label="Choose audio" />
          </div>
          <div className="writing-footer-actions">
            <button type="button" onClick={() => handleSave('draft')} disabled={saving} className="writing-draft-save">
              {saving ? <Loader size={14} className="animate-spin" /> : <Bookmark size={14} />}
              Save draft
            </button>
            <button type="button" onClick={() => handleSave('published')} disabled={saving} className="writing-publish-icon" aria-label={isEditMode && status === 'published' ? 'Update post' : 'Publish post'} title={isEditMode && status === 'published' ? 'Update post' : 'Publish post'}>
              {saving ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

