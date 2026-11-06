import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserRoundPlus, UserCheck } from 'lucide-react'
import { communityService } from '../services/community'

export default function FollowButton({ profile, isAuthenticated, onChange, onError }) {
  const [busy, setBusy] = useState(false)
  if (!isAuthenticated) return <Link className="outline-action" to="/login"><UserRoundPlus size={16} /> Follow</Link>
  const follow = async () => {
    setBusy(true)
    try {
      const result = profile.is_following
        ? await communityService.unfollow(profile.username)
        : await communityService.follow(profile.username)
      onChange(result)
    } catch (error) { onError?.(error.response?.data?.error || 'The follow request could not be saved.') }
    finally { setBusy(false) }
  }
  return <button className="outline-action" onClick={follow} disabled={busy} aria-pressed={Boolean(profile.is_following)}>
    {profile.is_following ? <UserCheck size={16} /> : <UserRoundPlus size={16} />}
    {busy ? 'Saving…' : profile.is_following ? 'Following' : 'Follow'}
  </button>
}
