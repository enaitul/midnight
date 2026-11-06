import { Link } from 'react-router-dom'
import creatorImage from '../assets/images/creator.png'

export default function Creator() {
  return (
    <article className="community-page creator-page">
      <p className="eyebrow">About the Creator</p>

      <div className="creator-layout">
        <img
          src={creatorImage}
          alt="Md Enaitul Hoque, developer and creator of midnight."
        />
        <div>
          <h1>Md Enaitul Hoque</h1>
          <p className="creator-role">Creator &amp; Full-Stack Developer</p>
          <div className="creator-copy">
            <p>
              I built <em>midnight.</em> out of a desire for a different kind of internet—one that
              recalls the quiet intimacy of early weblogs and personal spaces, where writing was
              an act of discovery rather than audience capture.
            </p>
            <p>
              As a developer and reader, I wanted an environment where words are treated with care:
              generous margins, thoughtful typography, and zero clutter designed to distract the eye.
            </p>
          </div>
          <div className="creator-links">
            <a
              href="https://www.linkedin.com/in/mdenaitulhoque/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              href="https://enait-portfolio2.vercel.app/"
              target="_blank"
              rel="noreferrer"
            >
              Personal Portfolio
            </a>
            <Link to="/about">
              About the platform →
            </Link>
          </div>
        </div>
      </div>

      <section className="creator-motivation">
        <h2>Why midnight. was created</h2>
        <p>
          Modern platforms are engineered to maximize consumption time through rapid dopamine loops.
          When every interface demands immediate reaction, reflective long-form writing suffers.
          Long thoughts require patience, space, and a stillness that daylight rarely offers.
        </p>
        <p>
          <em>midnight.</em> is designed to be visited when the day has wound down—whether you
          come to draft an essay, read a confession, or leave a poem for whoever happens to be awake.
        </p>
      </section>
    </article>
  )
}
