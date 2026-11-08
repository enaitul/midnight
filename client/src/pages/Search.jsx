import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Loader, Search as SearchIcon, User as UserIcon } from 'lucide-react'
import { communityService } from '../services/community'
import PostMediaDisplay from '../components/PostMediaDisplay'
import { resolveAssetUrl } from '../services/api'
import { formatTimestamp } from '../utils/formatTimestamp'
import InfiniteScrollSentinel from '../components/InfiniteScrollSentinel'

export default function Search() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('writings')
  const [nextPage, setNextPage] = useState(2)
  const [results, setResults] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const loadingMoreRef = useRef(false)
  const generationRef = useRef(0)

  const handleTabChange = (newTab) => {
    if (newTab !== tab) setTab(newTab)
  }

  const handleQueryChange = val => setQuery(val)

  useEffect(() => {
    const term = query.trim()
    const generation = ++generationRef.current
    loadingMoreRef.current = false
    setLoadingMore(false)
    setResults([])
    setNextPage(2)
    setHasMore(false)
    if (!term) {
      setLoading(false)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')

    const timeout = window.setTimeout(async () => {
      try {
        const data = await communityService.search(term, tab, 1, controller.signal)
        if (generation !== generationRef.current) return
        setResults(data.results || [])
        setNextPage((data.page || 1) + 1)
        setHasMore(Boolean(data.has_next))
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
  }, [query, tab])

  const loadMore = async () => {
    const term = query.trim()
    const generation = generationRef.current
    if (!term || !hasMore || loading || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const data = await communityService.search(term, tab, nextPage)
      if (generation !== generationRef.current) return
      setResults(current => [...current, ...(data.results || [])])
      setNextPage((data.page || nextPage) + 1)
      setHasMore(Boolean(data.has_next))
    } catch (err) {
      if (generation === generationRef.current) {
        setError(err.response?.data?.error || 'More results could not be loaded.')
        setHasMore(false)
      }
    } finally {
      if (generation === generationRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

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
                      {formatTimestamp(post.published_at || post.created_at) || 'Published'}
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

          <InfiniteScrollSentinel enabled={hasMore && !loading && !loadingMore && results.length > 0} onVisible={loadMore} />
          {loadingMore && <div className="infinite-scroll-loading" role="status"><Loader size={17} className="animate-spin" /> Loading more results</div>}
        </div>
      )}
    </section>
  )
}
