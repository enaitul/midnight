import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { BookOpen, Camera, Loader, LogOut, MessageCircle, PenLine, User as UserIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { communityService } from '../services/community'
import FollowButton from '../components/FollowButton'
import PostMediaDisplay from '../components/PostMediaDisplay'
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

  useEffect(() => {
    if (authLoading) return
    let active = true
    setLoading(true); setError('')
    const request = ownPage ? communityService.getMyProfile() : communityService.getProfile(username)
    request.then(data => { if (active) setProfile(data) })
      .catch(err => { if (active) setError(err.response?.data?.error || 'This profile could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [username, ownPage, authLoading])

  useEffect(() => {
    if (ownPage && savedTab) communityService.getSaved().then(setSaved).catch(err => setError(err.response?.data?.error || 'Saved writings could not be loaded.'))
  }, [ownPage, savedTab])

  const update = (key, value) => setProfile(current => ({ ...current, [key]: value }))
  const saveProfile = async event => {
    event.preventDefault(); setSaving(true); setError('')
    try { setProfile(await communityService.updateProfile({ display_name: profile.display_name, biography: profile.biography || '', instagram_url: profile.instagram_url || '', age: profile.age === '' ? null : Number(profile.age), age_public: profile.age_public })); await refreshUser(); setEditing(false) }
    catch (err) { setError(err.response?.data?.error || 'Profile could not be saved.') }
    finally { setSaving(false) }
  }
  const uploadAvatar = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    setSaving(true); setError('')
    try { const result = await communityService.uploadAvatar(file); setProfile(current => ({ ...current, avatar_url: result.avatar_url })); await refreshUser() }
    catch (err) { setError(err.response?.data?.error || 'Picture could not be uploaded.') }
    finally { setSaving(false); event.target.value = '' }
  }

  if (loading || authLoading) return <div className="loading-state"><Loader size={22} className="animate-spin" /></div>
  if (error && !profile) return <section className="community-page"><p className="inline-error">{error}</p><Link to="/">Return to the feed</Link></section>
  if (!profile) return null

  return <section className="community-page profile-page">
    <p className="eyebrow">{ownPage ? 'Your account' : 'A reader among us'}</p>
    <div className="profile-top">
      <div className="profile-avatar-wrap">{profile.avatar_url ? <img className="profile-avatar" src={resolveAssetUrl(profile.avatar_url)} alt={`${profile.display_name}'s profile`} referrerPolicy="no-referrer" /> : <span className="profile-avatar profile-avatar-empty"><UserIcon size={42} /></span>}{ownPage && editing && <label className="avatar-upload" title="Change profile picture"><Camera size={16} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} /></label>}</div>
      <div className="profile-heading"><h1>{profile.display_name || profile.username}</h1><p>@{profile.username}</p><span>{profile.contributions || 0} published {profile.contributions === 1 ? 'writing' : 'writings'} · {profile.follower_count || 0} followers · {profile.following_count || 0} following</span></div>
      {!ownPage && <div className="profile-actions"><FollowButton profile={profile} isAuthenticated={isAuthenticated} onChange={result => setProfile(current => ({ ...current, is_following: result.is_following, follower_count: result.follower_count }))} onError={setError} />{isAuthenticated && <button className="outline-action" onClick={() => navigate(`/messages?user=${encodeURIComponent(profile.username)}`)}><MessageCircle size={16} /> Message</button>}</div>}
      {ownPage && <div className="profile-actions"><button className="outline-action" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit profile'}</button><button className="icon-action" onClick={() => { logout(); navigate('/') }} aria-label="Log out" title="Log out"><LogOut size={16} /></button></div>}
    </div>
    {error && <p className="inline-error">{error}</p>}
    {editing ? <form className="profile-form" onSubmit={saveProfile}>
      <label>Display name<input value={profile.display_name || ''} onChange={event => update('display_name', event.target.value)} maxLength={100} required /></label>
      <label>Biography<textarea value={profile.biography || ''} onChange={event => update('biography', event.target.value)} maxLength={500} rows={4} placeholder="A few words about you" /></label>
      <label>Instagram link <span className="field-note">Optional</span><input type="url" value={profile.instagram_url || ''} onChange={event => update('instagram_url', event.target.value)} maxLength={2048} placeholder="https://www.instagram.com/username/" /></label>
      <label>Age <span className="field-note">Optional</span><input type="number" min="0" max="130" value={profile.age ?? ''} onChange={event => update('age', event.target.value)} /></label>
      <label className="privacy-check"><input type="checkbox" checked={Boolean(profile.age_public)} onChange={event => update('age_public', event.target.checked)} /> Show my age on my public profile</label>
      <button className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
    </form> : <div className="profile-bio">
      {profile.biography ? <p>{profile.biography}</p> : ownPage ? <p>Your biography is still unwritten.</p> : null}
      {profile.instagram_url && <a className="profile-social-link" href={profile.instagram_url} target="_blank" rel="noreferrer noopener" aria-label={`${profile.display_name || profile.username} on Instagram`}><InstagramIcon size={17} /> Instagram</a>}
      {profile.age !== undefined && profile.age !== null && <p className="profile-age">Age {profile.age}</p>}
      {profile.created_at && <p className="profile-created">Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>}
      {ownPage && profile.email && <p className="profile-private">Private email · {profile.email}</p>}
    </div>}
    {ownPage && <div className="profile-tabs"><button className={!savedTab ? 'active' : ''} onClick={() => setSavedTab(false)}>My account</button><button className={savedTab ? 'active' : ''} onClick={() => setSavedTab(true)}>Saved writings</button></div>}
    {savedTab && ownPage ? <div className="saved-list">{saved.length ? saved.map(post => <article key={post.id}><div><Link to={`/post/${post.id}`}><h2>{post.title || 'Untitled piece'}</h2></Link><p>{post.excerpt}</p></div><Link to={`/post/${post.id}`} aria-label={`Read ${post.title || 'untitled piece'}`}><BookOpen size={17} /></Link></article>) : <p className="feed-empty">Writings you save will be kept here.</p>}</div> : ownPage ? <div className="profile-shortcuts"><Link to="/my-writings"><BookOpen size={17} /> My writings</Link><Link to="/write"><PenLine size={17} /> Begin a new page</Link></div> : null}
    {!ownPage && <div className="public-writings-section">
      <div className="section-heading"><h2>Published writings</h2></div>
      {profile.posts && profile.posts.length > 0 ? (
        <div className="saved-list">
          {profile.posts.map(post => (
            <article key={post.id}>
              <div>
                <Link to={`/post/${post.id}`}><h2>{post.title || 'Untitled piece'}</h2></Link>
                <p>{post.excerpt}</p>
                <span className="post-date">{post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                <PostMediaDisplay media={post.media || []} />
              </div>
              <Link to={`/post/${post.id}`} aria-label={`Read ${post.title || 'untitled piece'}`}><BookOpen size={17} /></Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="feed-empty">No published writings yet.</p>
      )}
    </div>}
  </section>
}
