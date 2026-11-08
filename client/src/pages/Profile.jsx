import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { BookOpen, Camera, Heart, Loader, LogOut, MessageCircle, Pencil, User as UserIcon, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { communityService } from '../services/community'
import FollowButton from '../components/FollowButton'
import { resolveAssetUrl } from '../services/api'
import InstagramIcon from '../components/InstagramIcon'

export default function Profile() {
  const { username } = useParams()
  const { user, loading: authLoading, isAuthenticated, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const ownPage = isAuthenticated && user?.username === username
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [savedTab, setSavedTab] = useState(false)
  const [saved, setSaved] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [connectionType, setConnectionType] = useState('')
  const [connections, setConnections] = useState([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [connectionsError, setConnectionsError] = useState('')

  useEffect(() => {
    if (authLoading) return
    let active = true
    setLoading(true)
    setError('')
    const request = ownPage
      ? Promise.all([communityService.getMyProfile(), communityService.getProfile(username)]).then(([privateProfile, publicProfile]) => ({
        ...publicProfile,
        ...privateProfile,
        follower_count: publicProfile.follower_count,
        following_count: publicProfile.following_count,
        posts: publicProfile.posts,
      }))
      : communityService.getProfile(username)
    request.then(data => { if (active) setProfile(data) })
      .catch(err => { if (active) setError(err.response?.data?.error || 'This profile could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [username, ownPage, authLoading])

  useEffect(() => {
    if (ownPage && savedTab) communityService.getSaved().then(setSaved).catch(err => setError(err.response?.data?.error || 'Saved writings could not be loaded.'))
  }, [ownPage, savedTab])

  useEffect(() => {
    if (!connectionType) return undefined
    let active = true
    setConnections([])
    setConnectionsError('')
    setConnectionsLoading(true)
    const load = connectionType === 'followers' ? communityService.getFollowers(username) : communityService.getFollowing(username)
    load.then(people => { if (active) setConnections(people) })
      .catch(err => { if (active) setConnectionsError(err.response?.data?.error || 'This list could not be loaded.') })
      .finally(() => { if (active) setConnectionsLoading(false) })
    return () => { active = false }
  }, [connectionType, username])

  const update = (key, value) => setProfile(current => ({ ...current, [key]: value }))
  const saveProfile = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await communityService.updateProfile({ display_name: profile.display_name, biography: profile.biography || '', instagram_url: profile.instagram_url || '', age: profile.age === '' ? null : Number(profile.age), age_public: profile.age_public })
      setProfile(current => ({ ...current, ...updated }))
      await refreshUser()
      setEditing(false)
    } catch (err) { setError(err.response?.data?.error || 'Profile could not be saved.') }
    finally { setSaving(false) }
  }

  const uploadAvatar = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    setSaving(true)
    setError('')
    try {
      const result = await communityService.uploadAvatar(file)
      setProfile(current => ({ ...current, avatar_url: result.avatar_url }))
      await refreshUser()
    } catch (err) { setError(err.response?.data?.error || 'Picture could not be uploaded.') }
    finally { setSaving(false); event.target.value = '' }
  }

  if (loading || authLoading) return <div className="loading-state"><Loader size={22} className="animate-spin" /></div>
  if (error && !profile) return <section className="community-page"><p className="inline-error">{error}</p><Link to="/">Return to the feed</Link></section>
  if (!profile) return null

  const posts = savedTab && ownPage ? saved : profile.posts || []
  return <section className="community-page profile-page">
    <header className="profile-top">
      <div className="profile-avatar-column"><div className="profile-avatar-wrap">
        {profile.avatar_url ? <img className="profile-avatar" src={resolveAssetUrl(profile.avatar_url)} alt={`${profile.display_name}'s profile`} referrerPolicy="no-referrer" /> : <span className="profile-avatar profile-avatar-empty"><UserIcon size={58} />
        </span>}
        {ownPage && editing && <label className="avatar-upload" title="Change profile picture"><Camera size={16} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} /></label>}
      </div></div>
      <div className="profile-details">
        <div className="profile-identity-row">
          <h1>{profile.username}</h1>
          {!ownPage && <div className="profile-actions"><FollowButton profile={profile} isAuthenticated={isAuthenticated} onChange={result => setProfile(current => ({ ...current, is_following: result.is_following, follower_count: result.follower_count }))} onError={setError} />{isAuthenticated && <button className="outline-action" onClick={() => navigate(`/messages?user=${encodeURIComponent(profile.username)}`)}><MessageCircle size={16} /> Message</button>}</div>}
          {ownPage && <div className="profile-actions"><button type="button" className="profile-icon-action" onClick={() => setEditing(!editing)} disabled={saving} aria-label={editing ? 'Cancel profile editing' : 'Edit profile'} title={editing ? 'Cancel editing' : 'Edit profile'}>{editing ? <X size={17} /> : <Pencil size={16} />}</button><button type="button" className="profile-icon-action" onClick={() => { logout(); navigate('/') }} aria-label="Log out" title="Log out"><LogOut size={16} /></button></div>}
        </div>
        <div className="profile-counts" aria-label="Profile statistics"><span><strong>{profile.contributions || 0}</strong> writings</span><button type="button" onClick={() => setConnectionType('followers')} aria-label={`${profile.follower_count || 0} followers`}><strong>{profile.follower_count || 0}</strong> followers</button><button type="button" onClick={() => setConnectionType('following')} aria-label={`${profile.following_count || 0} following`}><strong>{profile.following_count || 0}</strong> following</button></div>
        {!editing && <div className="profile-bio">
          <strong className="profile-display-name">{profile.display_name || profile.username}</strong>
          {profile.biography ? <p>{profile.biography}</p> : ownPage ? <p className="profile-empty-bio">Your biography is still unwritten.</p> : null}
          {profile.age !== undefined && profile.age !== null && Number(profile.age) > 0 && (!ownPage || profile.age_public) && <p className="profile-age">Age {profile.age}</p>}
          {profile.instagram_url && <a className="profile-social-link" href={profile.instagram_url} target="_blank" rel="noreferrer noopener" aria-label={`${profile.display_name || profile.username} on Instagram`}><InstagramIcon size={17} /> Instagram</a>}
          {profile.created_at && <p className="profile-created">Member since {new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p>}
        </div>}
      </div>
    </header>
    {error && <p className="inline-error">{error}</p>}
    {editing && <form className="profile-form" onSubmit={saveProfile}>
      <label>Display name<input value={profile.display_name || ''} onChange={event => update('display_name', event.target.value)} maxLength={100} required /></label>
      <label>Biography<textarea value={profile.biography || ''} onChange={event => update('biography', event.target.value)} maxLength={500} rows={4} placeholder="A few words about you" /></label>
      <label>Instagram link <span className="field-note">Optional</span><input type="url" value={profile.instagram_url || ''} onChange={event => update('instagram_url', event.target.value)} maxLength={2048} placeholder="https://www.instagram.com/username/" /></label>
      <label>Age <span className="field-note">Optional</span><input type="number" min="0" max="130" value={profile.age ?? ''} onChange={event => update('age', event.target.value)} /></label>
      <label className="privacy-check"><input type="checkbox" checked={Boolean(profile.age_public)} onChange={event => update('age_public', event.target.checked)} /> Show my age on my public profile</label>
      <button className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
    </form>}
    <div className="profile-tabs" role="tablist" aria-label="Profile writings"><button role="tab" aria-selected={!savedTab} className={!savedTab ? 'active' : ''} onClick={() => setSavedTab(false)}><BookOpen size={14} /> Writings</button>{ownPage && <button role="tab" aria-selected={savedTab} className={savedTab ? 'active' : ''} onClick={() => setSavedTab(true)}><BookOpen size={14} /> Saved</button>}</div>
    <WritingGrid posts={posts} emptyMessage={savedTab ? 'Writings you save will be kept here.' : 'No published writings yet.'} />
    {connectionType && <div className="dialog-backdrop profile-connections-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConnectionType('') }}><section className="profile-connections-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-connections-title"><header><h2 id="profile-connections-title">{connectionType === 'followers' ? 'Followers' : 'Following'}</h2><button type="button" className="icon-action" onClick={() => setConnectionType('')} aria-label="Close list"><X size={18} /></button></header>{connectionsLoading ? <div className="profile-connections-state"><Loader size={20} className="animate-spin" /></div> : connectionsError ? <p className="inline-error">{connectionsError}</p> : connections.length ? <div className="profile-connections-list">{connections.map(person => <Link to={`/profile/${encodeURIComponent(person.username)}`} key={person.id} onClick={() => setConnectionType('')}><span className="profile-connection-avatar">{person.avatar_url ? <img src={resolveAssetUrl(person.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <UserIcon size={18} />}</span><span><strong>{person.display_name}</strong><small>@{person.username}</small></span></Link>)}</div> : <p className="profile-connections-state">No {connectionType} yet.</p>}</section></div>}
  </section>
}

function WritingGrid({ posts, emptyMessage }) {
  if (!posts.length) return <p className="feed-empty profile-grid-empty">{emptyMessage}</p>
  return <div className="profile-writing-grid">{posts.map(post => {
    const image = post.media?.find(item => item.media_type === 'image')
    return <Link to={`/post/${post.id}`} key={post.id} className="profile-writing-tile" aria-label={`Read ${post.title || post.excerpt || 'untitled writing'}`}>
      {image ? <img src={resolveAssetUrl(image.url)} alt="" loading="lazy" /> : <span className="profile-writing-text">{post.excerpt || post.title || 'A midnight thought'}</span>}
      <span className="profile-writing-overlay"><span className="profile-writing-stats"><span><Heart size={15} fill="currentColor" /> {post.like_count || 0}</span><span><MessageCircle size={15} /> {post.comment_count || 0}</span></span></span>
    </Link>
  })}</div>
}
