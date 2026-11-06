import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ChevronLeft, ChevronRight, Loader, Search as SearchIcon, User as UserIcon } from 'lucide-react'
import { communityService } from '../services/community'
import PostMediaDisplay from '../components/PostMediaDisplay'
import { resolveAssetUrl } from '../services/api'

export default function Search() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('writings')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0, has_next: false, has_prev: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // When changing tabs, reset page to 1
  const handleTabChange = (newTab) => {
    if (newTab !== tab) {
      setTab(newTab)
      setPage(1)
    }
  }

  // When query changes, reset page to 1
  const handleQueryChange = (val) => {
    setQuery(val)
    setPage(1)
  }

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      setPagination({ page: 1, pages: 0, total: 0, has_next: false, has_prev: false })
      setLoading(false)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')

    const timeout = window.setTimeout(async () => {
      try {
        const data = await communityService.search(term, tab, page, controller.signal)
        setResults(data.results || [])
        setPagination({
          page: data.page,
          pages: data.pages,
          total: data.total,
          has_next: data.has_next,
          has_prev: data.has_prev,
        })
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setError(err.response?.data?.error || 'Search could not be completed.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 350)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query, tab, page])

  return (
    <section className="community-page search-page">
      <p className="eyebrow">Find a voice or a page</p>
      <h1>Search</h1>

      <label className="search-box">
        <SearchIcon size={18} />
        <span className="sr-only">Search writings and people</span>
        <input
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="A name, a title, a word…"
          autoFocus
        />
      </label>

      <div className="search-tabs" role="tablist" aria-label="Search categories">
        {['writings', 'users'].map((item) => (
          <button
            type="button"
            key={item}
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? 'active' : ''}
            onClick={() => handleTabChange(item)}
          >
            {item === 'users' ? 'Users' : 'Writings'}
          </button>
        ))}
      </div>

      {error && (
        <p className="inline-error">
          <AlertCircle size={16} />
          {error}
        </p>
      )}

      {loading ? (
        <div className="loading-state">
          <Loader size={21} className="animate-spin" />
        </div>
      ) : query.trim() && !error && results.length === 0 ? (
        <p className="feed-empty">No {tab} found for “{query.trim()}”.</p>
      ) : (
        <div className="search-results">
          {tab === 'writings'
            ? results.map((post) => (
                <article key={post.id} className="search-writing">
                  <Link to={`/post/${post.id}`}>
                    <span className="search-result-meta">
                      {post.author?.display_name || post.author?.username} ·{' '}
                      {post.published_at ? new Date(post.published_at).toLocaleDateString() : 'Published'}
                    </span>
                    <h2>{post.title || 'Untitled piece'}</h2>
                    <p>{post.excerpt}</p>
                  </Link>
                  <PostMediaDisplay media={post.media || []} />
                </article>
              ))
            : results.map((person) => (
                <Link to={`/profile/${encodeURIComponent(person.username)}`} className="search-person" key={person.id}>
                  {person.avatar_url ? (
                    <img src={resolveAssetUrl(person.avatar_url)} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="avatar-fallback">
                      <UserIcon size={17} />
                    </span>
                  )}
                  <div className="search-person-copy">
                    <strong>{person.display_name}</strong>
                    <span>@{person.username} · {person.contributions || 0} {person.contributions === 1 ? 'writing' : 'writings'}</span>
                    {person.biography && <p>{person.biography}</p>}
                  </div>
                </Link>
              ))}

          {/* Pagination Controls */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between pt-6 mt-4 border-t border-[#1f1f28]">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.has_prev}
                className="flex items-center gap-1 text-xs text-muted hover:text-primary disabled:opacity-30 disabled:hover:text-muted transition"
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <span className="text-xs text-muted">
                Page {pagination.page} of {pagination.pages} ({pagination.total} results)
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.has_next}
                className="flex items-center gap-1 text-xs text-muted hover:text-primary disabled:opacity-30 disabled:hover:text-muted transition"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
