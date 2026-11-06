import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, MessageCircle, X } from 'lucide-react'
import creatorImage from '../assets/images/creator.png'

const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeusQp9fpn3YE4tCglvNQ5atcgvHWcqUlqwMNsbQWmApQGpqA/viewform'
const FEEDBACK_FORM_FIELDS = {
  name: 'entry.295161176',
  email: 'entry.598135056',
  rating: 'entry.200334126',
  message: 'entry.1677722890',
}

export default function About() {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedback, setFeedback] = useState({ name: '', email: '', rating: '', message: '' })
  const [prefilledFormUrl, setPrefilledFormUrl] = useState('')

  useEffect(() => {
    if (!feedbackOpen) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setFeedbackOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [feedbackOpen])

  const continueToGoogleForm = event => {
    event.preventDefault()
    const url = new URL(FEEDBACK_FORM_URL)
    url.searchParams.set('usp', 'pp_url')
    Object.entries(FEEDBACK_FORM_FIELDS).forEach(([field, entry]) => {
      const value = feedback[field].trim()
      if (value) url.searchParams.set(entry, value)
    })
    const prefilledUrl = url.toString()
    setPrefilledFormUrl(prefilledUrl)
    const formWindow = window.open(prefilledUrl, '_blank')
    if (formWindow) formWindow.opener = null
  }

  const updateFeedback = (field, value) => {
    setFeedback(current => ({ ...current, [field]: value }))
  }

  return (
    <article className="community-page about-page">
      <div className="about-topline">
        <p className="eyebrow">Philosophy of midnight.</p>
        <button className="outline-action about-feedback-trigger" type="button" onClick={() => setFeedbackOpen(true)}>
          <MessageCircle size={15} /> Feedback
        </button>
      </div>
      <h1>A quiet space for words that stay up late.</h1>

      <div className="about-copy">
        <p>
          The internet was once a collection of quiet rooms where people wrote because they had
          something to say, not because an algorithm was tallying their applause.
        </p>
        <p>
          Somewhere along the way, writing became performance. Paragraphs turned into hooks,
          reflections into strategies, and vulnerability into engagement metrics.
          The silence between thoughts disappeared.
        </p>
        <p>
          <strong>midnight.</strong> is an attempt to recover that silence.
        </p>
        <p>
          It is a public writing community created for the poems scribbled in notebook margins,
          the essays worked over at two in the morning, the honest stories of grief and hope,
          and the fragile observations that feel too quiet for the modern feed.
        </p>
        <p>
          Here, there are no follower leaderboards, no viral gamification, and no pressure to optimize.
          Only typography that gives words room to breathe, a dark atmosphere for contemplation,
          and fellow readers who value sincere expression over endless noise.
        </p>
      </div>

      <section className="creator-card">
        <img src={creatorImage} alt="Md Enaitul Hoque, creator of midnight." />
        <div>
          <p className="eyebrow">About the creator</p>
          <h2>Md Enaitul Hoque</h2>
          <p>
            Built midnight. as an antidote to the hyper-optimized web—a sanctuary for heartfelt writing and meaningful human connection.
          </p>
          <div className="creator-links">
            <Link to="/creator">Read the creator's note →</Link>
            <a href="https://www.linkedin.com/in/mdenaitulhoque/" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="https://enait-portfolio2.vercel.app/" target="_blank" rel="noreferrer">Portfolio</a>
          </div>
        </div>
      </section>

      {feedbackOpen && (
        <div className="feedback-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setFeedbackOpen(false)
        }}>
          <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
            <header className="feedback-dialog-header">
              <div>
                <p className="eyebrow">A note for midnight.</p>
                <h2 id="feedback-title">Share your feedback</h2>
              </div>
              <button className="icon-action" type="button" onClick={() => setFeedbackOpen(false)} aria-label="Close feedback form">
                <X size={18} />
              </button>
            </header>
            <p className="feedback-intro">A few honest words help make this space better. Your answers will open in Google Forms for you to review and submit.</p>
            <form className="feedback-form" onSubmit={continueToGoogleForm}>
              <div className="feedback-fields-row">
                <label>Name<input autoComplete="name" maxLength={120} required value={feedback.name} onChange={event => updateFeedback('name', event.target.value)} /></label>
                <label>Email <span className="feedback-optional">Optional</span><input type="email" autoComplete="email" maxLength={254} value={feedback.email} onChange={event => updateFeedback('email', event.target.value)} /></label>
              </div>
              <fieldset className="feedback-rating">
                <legend>How would you rate midnight? <span>Required</span></legend>
                <div className="feedback-rating-options">
                  {[1, 2, 3, 4, 5].map(rating => (
                    <label className={feedback.rating === String(rating) ? 'selected' : ''} key={rating}>
                      <input type="radio" name="feedback-rating" value={rating} required checked={feedback.rating === String(rating)} onChange={event => updateFeedback('rating', event.target.value)} />
                      <span>{rating}</span>
                    </label>
                  ))}
                </div>
                <div className="feedback-rating-scale"><span>Not for me</span><span>Love it</span></div>
              </fieldset>
              <label className="feedback-message-field">Anything you’d like us to know? <span className="feedback-optional">Optional</span><textarea rows={4} maxLength={2000} value={feedback.message} onChange={event => updateFeedback('message', event.target.value)} /></label>
              <div className="feedback-form-actions">
                <button className="primary-action" type="submit">Continue to submit <ExternalLink size={15} /></button>
                {prefilledFormUrl && <a href={prefilledFormUrl} target="_blank" rel="noreferrer">Open prefilled form <ExternalLink size={13} /></a>}
              </div>
            </form>
          </section>
        </div>
      )}
    </article>
  )
}
