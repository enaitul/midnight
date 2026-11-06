import { useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { communityService } from '../services/community'

export default function BookmarkButton({ postId, isAuthenticated }) {
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!isAuthenticated) return
    communityService.getSavedIds().then(ids => setSaved(ids.includes(postId))).catch(() => {})
  }, [isAuthenticated, postId])
  if (!isAuthenticated) return null
  const toggle = async () => {
    setBusy(true)
    try {
      if (saved) await communityService.unsave(postId)
      else await communityService.save(postId)
      setSaved(!saved)
    } finally { setBusy(false) }
  }
  return <button type="button" className={`bookmark-control${saved ? ' saved' : ''}`} onClick={toggle} disabled={busy} aria-label={saved ? 'Remove from saved writings' : 'Save writing'} title={saved ? 'Remove from saved writings' : 'Save writing'}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button>
}
