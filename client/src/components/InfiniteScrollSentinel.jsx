import { useEffect, useRef } from 'react'

export default function InfiniteScrollSentinel({ enabled, onVisible }) {
  const sentinelRef = useRef(null)
  const onVisibleRef = useRef(onVisible)

  useEffect(() => { onVisibleRef.current = onVisible }, [onVisible])

  useEffect(() => {
    const element = sentinelRef.current
    if (!enabled || !element || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onVisibleRef.current()
    }, { rootMargin: '700px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])

  return <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
}
