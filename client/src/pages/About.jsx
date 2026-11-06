import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, MessageCircle, X } from 'lucide-react'
import creatorImage from '../assets/images/creator.png'

const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeusQp9fpn3YE4tCglvNQ5atcgvHWcqUlqwMNsbQWmApQGpqA/formResponse'
const FEEDBACK_FORM_FIELDS = {
  name: 'entry.295161176',
  email: 'entry.598135056',
  rating: 'entry.200334126',
  message: 'entry.1677722890',
}

export default function About() {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedback, setFeedback] = useState({ name: '', email: '', rating: '', message: '' })
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  useEffect(() => {
    if (!feedbackOpen) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setFeedbackOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [feedbackOpen])

  const updateFeedback = (field, value) => {
    setFeedback(current => ({ ...current, [field]: value }))
  }

  const handleFeedbackSubmit = () => {
    setFeedbackSubmitting(true)
  }

  const handleFeedbackFrameLoad = () => {
    if (feedbackSubmitting) {
      setFeedbackSubmitting(false)
      setFeedbackSubmitted(true)
    }
  }

  const closeFeedback = () => {
    setFeedbackOpen(false)
    setFeedbackSubmitted(false)
    setFeedbackSubmitting(false)
    setFeedback({ name: '', email: '', rating: '', message: '' })
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
          if (event.target === event.currentTarget) closeFeedback()
        }}>
          <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
            <iframe
              className="feedback-submit-frame"
              name="midnight-feedback-submit"
              title="Feedback submission status"
              tabIndex={-1}
              onLoad={handleFeedbackFrameLoad}
            />
            <header className="feedback-dialog-header">
              <div>
                <p className="eyebrow">A note for midnight.</p>
                <h2 id="feedback-title">Share your feedback</h2>
              </div>
              <button className="icon-action" type="button" onClick={closeFeedback} aria-label="Close feedback form">
                <X size={18} />
              </button>
            </header>
            {feedbackSubmitted ? (
              <div className="feedback-success" role="status">
                <span className="feedback-success-icon"><Check size={18} /></span>
                <h3>Thank you for sharing.</h3>
                <p>Your note has been received. It means a lot to this little corner of the internet.</p>
                <button className="primary-action" type="button" onClick={closeFeedback}>Done</button>
              </div>
            ) : (
              <>
                <p className="feedback-intro">A few honest words help make this space better. We use Google Forms to collect feedback.</p>
                <form className="feedback-form" action={FEEDBACK_FORM_URL} method="POST" target="midnight-feedback-submit" onSubmit={handleFeedbackSubmit}>
                  <div className="feedback-fields-row">
                    <label>Name<input autoComplete="name" maxLength={120} required name={FEEDBACK_FORM_FIELDS.name} value={feedback.name} onChange={event => updateFeedback('name', event.target.value)} /></label>
                    <label>Email <span className="feedback-optional">Optional</span><input type="email" autoComplete="email" maxLength={254} name={FEEDBACK_FORM_FIELDS.email} value={feedback.email} onChange={event => updateFeedback('email', event.target.value)} /></label>
                  </div>
                  <fieldset className="feedback-rating">
                    <legend>How would you rate midnight? <span>Required</span></legend>
                    <div className="feedback-rating-options">
                      {[1, 2, 3, 4, 5].map(rating => (
                        <label className={feedback.rating === String(rating) ? 'selected' : ''} key={rating}>
                          <input type="radio" name={FEEDBACK_FORM_FIELDS.rating} value={rating} required checked={feedback.rating === String(rating)} onChange={event => updateFeedback('rating', event.target.value)} />
                          <span>{rating}</span>
                        </label>
                      ))}
                    </div>
                    <div className="feedback-rating-scale"><span>Not for me</span><span>Love it</span></div>
                  </fieldset>
                  <label className="feedback-message-field">Anything you’d like us to know? <span className="feedback-optional">Optional</span><textarea rows={4} maxLength={2000} name={FEEDBACK_FORM_FIELDS.message} value={feedback.message} onChange={event => updateFeedback('message', event.target.value)} /></label>
                  <p className="feedback-privacy-note">Your response is collected through Google Forms.</p>
                  <div className="feedback-form-actions">
                    <button className="primary-action" type="submit" disabled={feedbackSubmitting}>{feedbackSubmitting ? 'Sending…' : 'Send feedback'} <MessageCircle size={15} /></button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </article>
  )
}
