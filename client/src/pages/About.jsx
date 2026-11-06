import { Link } from 'react-router-dom'
import creatorImage from '../../../assets/images/creator.png'

export default function About() {
  return (
    <article className="community-page about-page">
      <p className="eyebrow">Philosophy of midnight.</p>
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
    </article>
  )
}
