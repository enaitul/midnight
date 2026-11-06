import { useEffect, useState } from 'react'
import { postService } from '../services/posts'
import { resolveAssetUrl } from '../services/api'

export default function PostMediaDisplay({ media = [], privateMedia = false }) {
  const [privateUrls, setPrivateUrls] = useState({})
  useEffect(() => {
    if (!privateMedia) return undefined
    let active = true
    const urls = []
    Promise.all(media.map(async item => {
      try {
        const url = await postService.getMediaPreview(item.url)
        if (!active) { URL.revokeObjectURL(url); return [item.id, ''] }
        urls.push(url)
        return [item.id, url]
      } catch { return [item.id, ''] }
    })).then(entries => { if (active) setPrivateUrls(Object.fromEntries(entries)) })
    return () => { active = false; urls.forEach(URL.revokeObjectURL) }
  }, [media, privateMedia])
  if (!media.length) return null
  return <div className="post-attachments">{media.map(item => {
    const url = privateMedia ? privateUrls[item.id] : resolveAssetUrl(item.url)
    if (!url) return null
    return <figure key={item.id}>
      {item.media_type === 'image' && <img src={url} alt="Photo attached to post" loading="lazy" />}
      {item.media_type === 'audio' && <audio controls preload="metadata" src={url}>Your browser does not support audio playback.</audio>}
      {item.media_type === 'video' && <video controls preload="metadata" playsInline src={url}>Your browser does not support video playback.</video>}
    </figure>
  })}</div>
}
