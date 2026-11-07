import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { ArrowLeft, Check, Edit2, Loader, MessageCircle, Plus, Search, Send, Smile, Paperclip, Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { communityService } from '../services/community'
import { findUserSearchResult, getUserSearchResults } from '../services/searchResults'
import api, { resolveAssetUrl } from '../services/api'

const EMOJI_CATEGORIES = [
  { name: 'Smileys', icon: '☺', items: [['😀','grinning'],['😃','smile'],['😄','happy'],['😁','beaming'],['😆','laugh'],['🥹','holding back tears'],['😊','blush'],['🙂','slight smile'],['🙃','upside down'],['😉','wink'],['😍','heart eyes'],['🥰','hearts'],['😘','kiss'],['😋','tasty'],['😎','cool'],['🤔','thinking'],['🤗','hug'],['🥳','party'],['😭','cry'],['😂','tears joy'],['😅','sweat'],['😴','sleep'],['😌','relieved'],['😇','angel'],['🤍','white heart'],['❤️','red heart'],['🫶','heart hands'],['💔','broken heart'],['🙏','thanks please'],['👏','clap']] },
  { name: 'Nature', icon: '♧', items: [['🐶','dog'],['🐱','cat'],['🐻','bear'],['🦊','fox'],['🐼','panda'],['🐸','frog'],['🦋','butterfly'],['🐝','bee'],['🐢','turtle'],['🦉','owl'],['🐬','dolphin'],['🌿','herb'],['🍀','clover'],['🌸','cherry blossom'],['🌻','sunflower'],['🌙','moon'],['⭐','star'],['🌈','rainbow'],['☀️','sun'],['🌧️','rain']] },
  { name: 'Food', icon: '◉', items: [['🍎','apple'],['🍓','strawberry'],['🍒','cherry'],['🍑','peach'],['🥑','avocado'],['🍕','pizza'],['🍔','burger'],['🍟','fries'],['🍜','noodles'],['🍣','sushi'],['🍰','cake'],['🍪','cookie'],['🍫','chocolate'],['☕','coffee'],['🫖','tea'],['🍵','green tea'],['🥛','milk'],['🍷','wine'],['🧋','bubble tea'],['🍯','honey']] },
  { name: 'Activities', icon: '⚽', items: [['⚽','soccer'],['🏀','basketball'],['🏈','football'],['🎾','tennis'],['🎮','game'],['🎲','dice'],['🎨','art'],['🎭','theater'],['🎤','microphone'],['🎧','headphones'],['🎸','guitar'],['🎹','piano'],['🎬','movie'],['📚','books'],['✍️','writing'],['🧘','meditation'],['🏆','trophy'],['🎉','confetti'],['🎁','gift'],['🧩','puzzle']] },
  { name: 'Travel', icon: '⌂', items: [['🚗','car'],['🚲','bicycle'],['✈️','airplane'],['🚀','rocket'],['🚂','train'],['⛵','sailboat'],['🏠','house'],['🏕️','camping'],['🏖️','beach'],['⛰️','mountain'],['🌋','volcano'],['🌆','city dusk'],['🌃','night city'],['🗼','tower'],['🗽','statue'],['🗺️','map'],['🧭','compass'],['🌍','earth'],['🌌','milky way'],['🏝️','island']] },
  { name: 'Objects', icon: '▣', items: [['📱','phone'],['💻','laptop'],['⌚','watch'],['📷','camera'],['💡','light bulb'],['🔦','flashlight'],['🕯️','candle'],['🔑','key'],['🔒','lock'],['🪞','mirror'],['🧸','teddy'],['🎈','balloon'],['🛍️','shopping'],['✉️','envelope'],['📎','paperclip'],['📝','memo'],['📖','open book'],['🖋️','pen'],['🔋','battery'],['🧵','thread']] },
  { name: 'Symbols', icon: '♡', items: [['❤️','red heart'],['💛','yellow heart'],['💚','green heart'],['💙','blue heart'],['💜','purple heart'],['🖤','black heart'],['🤎','brown heart'],['💯','hundred'],['✅','check'],['❌','cross'],['⚠️','warning'],['❓','question'],['❗','exclamation'],['✨','sparkles'],['🔥','fire'],['💫','dizzy'],['♻️','recycle'],['♾️','infinity'],['➕','plus'],['➰','loop']] },
  { name: 'Flags', icon: '⚑', items: [['🏳️','white flag'],['🏴','black flag'],['🏁','checkered'],['🚩','triangular'],['🇺🇸','United States'],['🇬🇧','United Kingdom'],['🇨🇦','Canada'],['🇦🇺','Australia'],['🇮🇳','India'],['🇧🇩','Bangladesh'],['🇯🇵','Japan'],['🇰🇷','South Korea'],['🇫🇷','France'],['🇩🇪','Germany'],['🇮🇹','Italy'],['🇧🇷','Brazil'],['🇲🇽','Mexico'],['🇳🇬','Nigeria'],['🇿🇦','South Africa'],['🇵🇸','Palestine']] },
]
const MESSAGE_MEDIA_LIMITS = { image: 10, video: 100, audio: 25 }
const MESSAGE_MEDIA_TYPES = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'video/mp4': 'video', 'video/webm': 'video', 'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/ogg': 'audio', 'audio/mp4': 'audio', 'audio/x-m4a': 'audio' }

const dayKey = value => {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
const dayLabel = value => {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(date) === dayKey(today)) return 'Today'
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
const messageLinks = text => text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//i.test(part)
  ? <a key={index} href={part} target="_blank" rel="noreferrer noopener">{part}</a>
  : part)

function SharedMessageMedia({ item }) {
  const containerRef = useRef(null)
  const cancelledRef = useRef(false)
  const requestedRef = useRef(false)
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    cancelledRef.current = false
    requestedRef.current = false
    let objectUrl = ''
    let observer
    const load = () => {
      if (requestedRef.current) return
      requestedRef.current = true
      api.get(item.url, { responseType: 'blob' }).then(response => {
        objectUrl = URL.createObjectURL(response.data)
        if (cancelledRef.current) { URL.revokeObjectURL(objectUrl); return }
        setUrl(objectUrl)
      }).catch(() => { if (!cancelledRef.current) setFailed(true) })
    }
    if (!window.IntersectionObserver) load()
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load() }
      }, { rootMargin: '180px' })
      if (containerRef.current) observer.observe(containerRef.current)
    }
    return () => { cancelledRef.current = true; observer?.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [item.url])

  return <div className="message-media-item" ref={containerRef}>
    {!url ? <span className="message-media-loading">{failed ? 'This attachment could not be loaded.' : `Loading ${item.media_type}…`}</span> : item.media_type === 'image'
      ? <img src={url} alt={item.original_name || 'Shared image'} />
      : item.media_type === 'video' ? <video src={url} controls playsInline preload="metadata" />
        : <audio src={url} controls preload="metadata" />}
    {item.media_type !== 'image' && <small>{item.original_name}</small>}
  </div>
}

export default function Messages() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [messageBody, setMessageBody] = useState('')
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState('')
  const [personQuery, setPersonQuery] = useState('')
  const [people, setPeople] = useState([])
  const [selectedPeople, setSelectedPeople] = useState([])
  const [groupName, setGroupName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [renameInput, setRenameInput] = useState('')
  const [sending, setSending] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [newMessageSender, setNewMessageSender] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState(0)
  const [emojiSearch, setEmojiSearch] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [floatingDate, setFloatingDate] = useState('')
  const [showFloatingDate, setShowFloatingDate] = useState(false)
  const socketRef = useRef(null)
  const conversationsRef = useRef([])
  const activeIdRef = useRef(null)
  const joinedRoomsRef = useRef(new Set())
  const bottomRef = useRef(null)
  const historyRef = useRef(null)
  const inputRef = useRef(null)
  const scrollBottomRef = useRef(true)
  const floatDateTimerRef = useRef(null)
  const attachmentsRef = useRef([])
  const token = localStorage.getItem('midnight_token')

  const clearComposer = useCallback(() => {
    scrollBottomRef.current = true
    attachmentsRef.current.forEach(item => URL.revokeObjectURL(item.preview))
    attachmentsRef.current = []
    setAttachments([])
    setMessageBody('')
    setEmojiOpen(false)
  }, [])

  const loadConversations = useCallback(async () => {
    setError('')
    try {
      const items = await communityService.conversations()
      setConversations(items)
      window.dispatchEvent(new Event('midnight:conversations-changed'))
    }
    catch (err) { setError(err.response?.data?.error || 'Conversations could not be loaded.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { conversationsRef.current = conversations }, [conversations])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) { setLoading(false); setError('Sign in to use messages.'); return }
    loadConversations()
  }, [authLoading, isAuthenticated, loadConversations])

  useEffect(() => {
    const username = searchParams.get('user')
    if (!username || !isAuthenticated) return
    let cancelled = false
    communityService.search(username, 'users').then(async data => {
      const person = findUserSearchResult(data, username)
      if (!person || cancelled) return
      const conversation = await communityService.startDirect(person.id)
      if (cancelled) return
      await loadConversations()
      clearComposer()
      setActiveId(conversation.id)
      setSearchParams({}, { replace: true })
    }).catch(err => setError(err.response?.data?.error || 'Could not start the conversation.'))
    return () => { cancelled = true }
  }, [searchParams, isAuthenticated, loadConversations, setSearchParams, clearComposer])

  const receiveMessage = useCallback(message => {
    if (message.conversation_id === activeIdRef.current) {
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
    }
    const incoming = message.sender.id !== user?.id
    if (incoming && message.conversation_id === activeIdRef.current) {
      setNewMessageCount(count => count + 1)
      setNewMessageSender(message.sender.display_name)
      communityService.markRead(message.conversation_id).then(() => window.dispatchEvent(new CustomEvent('midnight:conversation-read', { detail: { id: message.conversation_id } }))).catch(() => {})
    }
    setConversations(current => {
      const next = current.map(item => item.id === message.conversation_id ? {
        ...item,
        last_message: message,
        unread_count: incoming && message.conversation_id !== activeIdRef.current ? (item.unread_count || 0) + 1 : item.unread_count || 0,
      } : item)
      return next.sort((a, b) => (b.last_message?.created_at || b.created_at).localeCompare(a.last_message?.created_at || a.created_at))
    })
  }, [user?.id])

  const openConversation = item => {
    clearComposer()
    setNewMessageCount(item.unread_count || 0)
    setNewMessageSender(item.title || item.name || 'your conversation')
    setConversations(current => current.map(conversation => conversation.id === item.id ? { ...conversation, unread_count: 0 } : conversation))
    setActiveId(item.id)
  }

  useEffect(() => {
    if (!activeId || !isAuthenticated) return
    const alive = { current: true }
    setMessages([]); setActiveConversation(null); setError('')
    Promise.all([communityService.conversation(activeId), communityService.messages(activeId), communityService.markRead(activeId)])
      .then(([conversation, history]) => { if (alive.current) {
        setActiveConversation(conversation); setMessages(history.messages); setHistoryHasMore(history.has_more)
        setConversations(current => current.map(item => item.id === activeId ? { ...item, unread_count: 0 } : item))
        window.dispatchEvent(new CustomEvent('midnight:conversation-read', { detail: { id: activeId } }))
      } })
      .catch(err => { if (alive.current) setError(err.response?.data?.error || 'This conversation could not be opened.') })
    return () => { alive.current = false }
  }, [activeId, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return undefined
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5000' : window.location.origin)
    const socket = io(socketUrl, { auth: { token } })
    socketRef.current = socket
    const joinKnownConversations = () => conversationsRef.current.forEach(item => {
      if (!joinedRoomsRef.current.has(item.id)) {
        joinedRoomsRef.current.add(item.id)
        socket.emit('join_conversation', { conversation_id: item.id })
      }
    })
    socket.on('connect', () => {
      setSocketConnected(true)
      joinedRoomsRef.current.clear()
      joinKnownConversations()
      const conversationId = activeIdRef.current
      if (conversationId) {
        communityService.messages(conversationId)
          .then(history => { setHistoryHasMore(history.has_more); setMessages(current => {
            const merged = new Map(current.map(message => [message.id, message]))
            history.messages.forEach(message => merged.set(message.id, message))
            return [...merged.values()].sort((a, b) => a.id - b.id)
          }) })
          .catch(err => setError(err.response?.data?.error || 'Conversation history could not be restored.'))
        communityService.markRead(conversationId)
          .then(() => {
            setConversations(current => current.map(item => item.id === conversationId ? { ...item, unread_count: 0 } : item))
            window.dispatchEvent(new CustomEvent('midnight:conversation-read', { detail: { id: conversationId } }))
          })
          .catch(() => setError('Unread messages could not be marked as read.'))
      }
    })
    socket.on('disconnect', () => { setSocketConnected(false); joinedRoomsRef.current.clear() })
    socket.on('connect_error', () => setSocketConnected(false))
    socket.on('new_message', receiveMessage)
    socket.on('conversation_updated', conversation => {
      loadConversations()
      if (activeIdRef.current === conversation.id) setActiveConversation(conversation)
    })
    socket.on('conversation_removed', ({ conversation_id: conversationId }) => {
      setConversations(current => current.filter(item => item.id !== conversationId))
      if (activeIdRef.current === conversationId) { clearComposer(); setActiveId(null); setActiveConversation(null); setMessages([]) }
    })
    return () => { socket.disconnect(); socketRef.current = null; joinedRoomsRef.current.clear(); setSocketConnected(false) }
  }, [isAuthenticated, token, receiveMessage, loadConversations, clearComposer])

  useEffect(() => {
    if (socketRef.current?.connected) conversations.forEach(item => {
      if (!joinedRoomsRef.current.has(item.id)) {
        joinedRoomsRef.current.add(item.id)
        socketRef.current.emit('join_conversation', { conversation_id: item.id })
      }
    })
  }, [conversations])

  useEffect(() => { if (scrollBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => () => {
    attachmentsRef.current.forEach(item => URL.revokeObjectURL(item.preview))
    window.clearTimeout(floatDateTimerRef.current)
  }, [])

  useEffect(() => {
    const term = personQuery.trim()
    if (!term || !dialog) { setPeople([]); return undefined }
    const timer = window.setTimeout(() => communityService.search(term, 'users').then(data => setPeople(getUserSearchResults(data))).catch(() => setPeople([])), 250)
    return () => window.clearTimeout(timer)
  }, [personQuery, dialog])

  const openDirect = async person => {
    try {
      const conversation = await communityService.startDirect(person.id)
      clearComposer(); setDialog(''); setPersonQuery(''); setActiveId(conversation.id); await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Could not start the conversation.') }
  }

  const send = async event => {
    event.preventDefault()
    const body = messageBody.trim()
    if ((!body && !attachments.length) || !activeId || sending) return
    setSending(true); setError(''); setUploadProgress(0)
    try {
      if (attachments.length) {
        const result = await communityService.sendMessageWithMedia(activeId, body, attachments.map(item => item.file), setUploadProgress)
        receiveMessage(result.message)
        attachments.forEach(item => URL.revokeObjectURL(item.preview))
        attachmentsRef.current = []
        setAttachments([]); setMessageBody(''); setEmojiOpen(false); setUploadProgress(0); setSending(false)
        return
      }
      const socket = socketRef.current
      if (socket?.connected) {
        socket.timeout(10000).emit('send_message', { conversation_id: activeId, body }, (timeoutError, result) => {
          if (timeoutError) {
            setError('Delivery could not be confirmed. Checking the saved conversation history…')
            communityService.messages(activeId)
              .then(history => setMessages(history.messages))
              .catch(() => setError('Connection interrupted. Reopen the conversation to check delivery.'))
          } else if (!result?.ok) setError(result?.error || 'Message was not sent.')
          else { receiveMessage(result.message); setMessageBody('') }
          setSending(false)
        })
      } else {
        const { message } = await communityService.sendMessage(activeId, body)
        receiveMessage(message); setMessageBody(''); setSending(false)
      }
    } catch (err) { setError(err.response?.data?.error || 'Message was not sent.'); setSending(false) }
  }

  const addAttachments = event => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    let issue = ''
    const accepted = []
    let totalBytes = attachments.reduce((total, item) => total + item.file.size, 0)
    let available = 4 - attachments.length
    for (const file of files) {
      const mediaType = MESSAGE_MEDIA_TYPES[file.type]
      if (!mediaType) { issue = 'Choose JPEG, PNG, WebP, MP4, WebM, MP3, WAV, OGG, or M4A files.'; continue }
      if (file.size > MESSAGE_MEDIA_LIMITS[mediaType] * 1024 * 1024) { issue = `Each ${mediaType} file must be ${MESSAGE_MEDIA_LIMITS[mediaType]} MB or smaller.`; continue }
      if (available <= 0) { issue = 'A message can contain up to 4 attachments.'; continue }
      if (totalBytes + file.size > 100 * 1024 * 1024) { issue = 'Attachments in one message must total 100 MB or less.'; continue }
      accepted.push({ file, mediaType, preview: URL.createObjectURL(file), key: crypto.randomUUID() })
      totalBytes += file.size
      available -= 1
    }
    const next = [...attachments, ...accepted]
    attachmentsRef.current = next
    setAttachments(next)
    setError(issue)
  }

  const removeAttachment = key => {
    const item = attachments.find(candidate => candidate.key === key)
    if (item) URL.revokeObjectURL(item.preview)
    const next = attachments.filter(candidate => candidate.key !== key)
    attachmentsRef.current = next
    setAttachments(next)
  }

  const insertEmoji = emoji => {
    const input = inputRef.current
    const start = input?.selectionStart ?? messageBody.length
    const end = input?.selectionEnd ?? messageBody.length
    const next = `${messageBody.slice(0, start)}${emoji}${messageBody.slice(end)}`
    setMessageBody(next)
    setEmojiOpen(false)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const loadOlderMessages = async () => {
    if (!historyHasMore || loadingOlder || !messages.length || !historyRef.current) return
    const history = historyRef.current
    const previousHeight = history.scrollHeight
    setLoadingOlder(true)
    try {
      const result = await communityService.messages(activeId, { before: messages[0].id })
      setHistoryHasMore(result.has_more)
      if (result.messages.length) {
        scrollBottomRef.current = false
        setMessages(current => [...result.messages, ...current])
        requestAnimationFrame(() => { history.scrollTop += history.scrollHeight - previousHeight })
      }
    } catch (err) { setError(err.response?.data?.error || 'Older messages could not be loaded.') }
    finally { setLoadingOlder(false) }
  }

  const handleHistoryScroll = event => {
    const history = event.currentTarget
    scrollBottomRef.current = history.scrollHeight - history.scrollTop - history.clientHeight < 100
    const visible = [...history.querySelectorAll('[data-message-date]')].find(element => element.offsetTop >= history.scrollTop + 40)
    if (visible) {
      setFloatingDate(visible.dataset.dateLabel)
      setShowFloatingDate(true)
    }
    window.clearTimeout(floatDateTimerRef.current)
    floatDateTimerRef.current = window.setTimeout(() => setShowFloatingDate(false), 1800)
    if (history.scrollTop < 70 && historyHasMore) loadOlderMessages()
  }

  const createGroup = async event => {
    event.preventDefault()
    try {
      const conversation = await communityService.startGroup(groupName, selectedPeople.map(person => person.id))
      clearComposer(); setDialog(''); setSelectedPeople([]); setPersonQuery(''); setGroupName(''); setActiveId(conversation.id); await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Group could not be created.') }
  }

  const togglePerson = person => setSelectedPeople(current => current.some(item => item.id === person.id) ? current.filter(item => item.id !== person.id) : [...current, person])
  const manageMember = async person => {
    try { const updated = await communityService.addMembers(activeId, [person.id]); setActiveConversation(updated); setPeople([]); setPersonQuery(''); await loadConversations() }
    catch (err) { setError(err.response?.data?.error || 'Member could not be added.') }
  }
  const removeMember = async person => {
    try { await communityService.removeMember(activeId, person.id); setActiveConversation(await communityService.conversation(activeId)); await loadConversations() }
    catch (err) { setError(err.response?.data?.error || 'Member could not be removed.') }
  }
  const leaveGroup = async () => {
    try { await communityService.leaveGroup(activeId); clearComposer(); setActiveId(null); setActiveConversation(null); await loadConversations() }
    catch (err) { setError(err.response?.data?.error || 'Could not leave this group.') }
  }

  const saveGroupName = async (event) => {
    event.preventDefault()
    if (!renameInput.trim()) return
    try {
      const updated = await communityService.renameGroup(activeId, renameInput.trim())
      setActiveConversation(updated)
      setEditingName(false)
      await loadConversations()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not rename group.')
    }
  }

  const activeRole = activeConversation?.participants?.find(person => person.id === user?.id)?.role
  const directPerson = activeConversation?.kind === 'direct' ? activeConversation.participants?.find(person => person.id !== user?.id) : null
  if (loading) return <div className="loading-state"><Loader size={22} className="animate-spin" /></div>
  return <section className={`messages-page${activeId ? ' conversation-open' : ''}`}>
    <aside className="conversation-list">
      <div className="messages-heading"><div><p className="eyebrow">A note between people</p><h1>Messages</h1></div><button className="icon-action" onClick={() => { setDialog('direct'); setError('') }} aria-label="Start a conversation" title="Start a conversation"><Plus size={18} /></button></div>
      <div className="message-list-actions"><button className="text-action" onClick={() => { setDialog('group'); setError('') }}><Users size={15} /> New group</button></div>
      {error && <p className="inline-error messages-error">{error}</p>}
      {conversations.length === 0 ? <p className="feed-empty small">Your conversations will appear here.</p> : conversations.map(item => <button type="button" key={item.id} onClick={() => openConversation(item)} className={`conversation-preview${activeId === item.id ? ' active' : ''}`}>
        <span className="conversation-mark">{item.kind === 'group' ? <Users size={17} /> : <MessageCircle size={17} />}</span><span className="conversation-copy"><strong>{item.title || item.name || 'Conversation'}</strong><small>{item.last_message?.body || 'No messages yet'}</small></span>{item.unread_count > 0 && <span className="unread-badge" aria-label={`${item.unread_count} unread messages`}>{item.unread_count}</span>}
      </button>)}
    </aside>
    <main className="message-thread">
      {!activeId ? <div className="thread-empty"><MessageCircle size={28} /><p>Choose a conversation, or begin a new one.</p></div> : <>
        <header className="thread-header">
          <button className="mobile-back" onClick={() => { clearComposer(); setActiveId(null) }} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
          {directPerson && <Link className="thread-profile-avatar" to={`/profile/${encodeURIComponent(directPerson.username)}`} aria-label={`View ${directPerson.display_name}'s profile`}>
            {directPerson.avatar_url ? <img className="thread-avatar" src={resolveAssetUrl(directPerson.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="thread-avatar thread-avatar-fallback">{(directPerson.display_name || '?').slice(0, 1).toUpperCase()}</span>}
          </Link>}
          <div>
            {editingName ? (
              <form onSubmit={saveGroupName} className="flex items-center gap-1.5">
                <input
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  maxLength={100}
                  className="bg-[#19191f] text-primary text-sm px-2 py-0.5 rounded border border-[#2a2a38] outline-none"
                  autoFocus
                />
                <button type="submit" className="text-xs text-accent hover:underline">Save</button>
                <button type="button" onClick={() => setEditingName(false)} className="text-xs text-muted hover:underline">Cancel</button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h2>{directPerson
                  ? <Link className="thread-profile-name" to={`/profile/${encodeURIComponent(directPerson.username)}`}>{directPerson.display_name}</Link>
                  : activeConversation?.title || 'Conversation'}</h2>
                {activeConversation?.kind === 'group' && activeRole === 'admin' && (
                  <button
                    type="button"
                    onClick={() => { setRenameInput(activeConversation.name || ''); setEditingName(true) }}
                    className="text-muted hover:text-primary transition"
                    title="Rename group"
                  >
                    <Edit2 size={13} />
                  </button>
                )}
              </div>
            )}
            <small>{socketConnected ? 'Connected' : 'Messages stay saved while you reconnect'}</small>
          </div>
          {newMessageCount > 0 && <span className="thread-new-badge">{newMessageCount} new{newMessageSender ? ` · ${newMessageSender}` : ''}</span>}
          {activeConversation?.kind === 'group' && <span className="participants-count"><Users size={15} /> {activeConversation.participants.length}</span>}
        </header>
        {activeConversation?.kind === 'group' && <div className="group-members">{activeConversation.participants.map(person => <span key={person.id}><Link to={`/profile/${encodeURIComponent(person.username)}`}>{person.display_name}</Link>{activeRole === 'admin' && person.id !== user?.id && <button onClick={() => removeMember(person)} aria-label={`Remove ${person.display_name}`}><X size={12} /></button>}</span>)}{activeRole === 'admin' && <div className="member-add"><input value={personQuery} onChange={e => setPersonQuery(e.target.value)} placeholder="Add a member" />{people.filter(p => !activeConversation.participants.some(m => m.id === p.id)).map(person => <button key={person.id} onClick={() => manageMember(person)}>{person.display_name} <Plus size={13} /></button>)}</div>}<button className="text-action" onClick={leaveGroup}>Leave group</button></div>}
        <div className="message-history" ref={historyRef} onScroll={handleHistoryScroll}>
          {showFloatingDate && floatingDate && <div className="floating-message-date" aria-live="polite">{floatingDate}</div>}
          {historyHasMore && <button className="load-older-messages" type="button" onClick={loadOlderMessages} disabled={loadingOlder}>{loadingOlder ? 'Loading…' : 'Load older messages'}</button>}
          {messages.length === 0 ? <div className="thread-empty"><p>No messages yet. Begin when you're ready.</p></div> : messages.map((message, index) => {
            const mine = message.sender.id === user?.id
            const previous = messages[index - 1]
            const next = messages[index + 1]
            const startsGroup = !previous || previous.sender.id !== message.sender.id
            const endsGroup = !next || next.sender.id !== message.sender.id
            const startsDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at)
            const media = message.media || []
            const avatar = endsGroup ? <Link className="message-avatar-link" to={`/profile/${encodeURIComponent(message.sender.username)}`} aria-label={`View ${message.sender.display_name}'s profile`}>
              {message.sender.avatar_url
                ? <img className="message-avatar" src={resolveAssetUrl(message.sender.avatar_url)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                : <span className="message-avatar message-avatar-fallback" aria-hidden="true">{(message.sender.display_name || '?').slice(0, 1).toUpperCase()}</span>}
            </Link> : <span className="message-avatar-spacer" />
            return <div className="message-day-group" key={message.id}>
              {startsDay && <div className="chat-date-separator"><span>{dayLabel(message.created_at)}</span></div>}
              <article className={`chat-message${mine ? ' mine' : ''}${startsGroup ? ' group-start' : ''}${endsGroup ? ' group-end' : ''}`} data-message-date={dayKey(message.created_at)} data-date-label={dayLabel(message.created_at)}>
                {!mine && avatar}
                <div className="chat-message-stack">
                  {activeConversation?.kind === 'group' && startsGroup && <Link className="chat-sender-name" to={`/profile/${encodeURIComponent(message.sender.username)}`}>{mine ? 'You' : message.sender.display_name}</Link>}
                  <div className="chat-bubble">
                    {message.body && <p>{messageLinks(message.body)}</p>}
                    {!!media.length && <div className="message-media-list">{media.map(item => <SharedMessageMedia item={item} key={item.id} />)}</div>}
                    <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                  </div>
                </div>
                {mine && avatar}
              </article>
            </div>
          })}
          <div ref={bottomRef} />
        </div>
        {error && <p className="inline-error messages-thread-error">{error}</p>}
        <div className="message-composer-wrap">
          {emojiOpen && <div className="emoji-picker" role="dialog" aria-label="Choose an emoji">
            <label className="emoji-search"><Search size={15} /><input value={emojiSearch} onChange={event => setEmojiSearch(event.target.value)} placeholder="Search emoji" aria-label="Search emoji" /></label>
            {!emojiSearch && <nav className="emoji-categories" aria-label="Emoji categories">{EMOJI_CATEGORIES.map((category, index) => <button type="button" key={category.name} className={emojiCategory === index ? 'active' : ''} onClick={() => setEmojiCategory(index)} title={category.name} aria-label={category.name}>{category.icon}</button>)}</nav>}
            <div className="emoji-grid">{(emojiSearch ? EMOJI_CATEGORIES.flatMap(category => category.items.filter(([, label]) => label.includes(emojiSearch.toLowerCase()))) : EMOJI_CATEGORIES[emojiCategory].items).map(([emoji, label], index) => <button type="button" key={`${emoji}-${label}-${index}`} onClick={() => insertEmoji(emoji)} title={label} aria-label={label}>{emoji}</button>)}</div>
            {emojiSearch && !EMOJI_CATEGORIES.some(category => category.items.some(([, label]) => label.includes(emojiSearch.toLowerCase()))) && <p className="emoji-empty">No matching emoji</p>}
          </div>}
          {!!attachments.length && <div className="message-attachment-previews">{attachments.map(item => <figure key={item.key} className="message-attachment-preview">
            {item.mediaType === 'image' ? <img src={item.preview} alt={`Preview of ${item.file.name}`} /> : item.mediaType === 'video' ? <video src={item.preview} /> : <span className="attachment-audio-icon">♫</span>}
            <figcaption>{item.file.name}</figcaption><button type="button" onClick={() => removeAttachment(item.key)} disabled={sending} aria-label={`Remove ${item.file.name}`}><X size={14} /></button>
          </figure>)}</div>}
          {sending && attachments.length > 0 && <div className="message-upload-progress" role="status"><span>Uploading attachments</span><progress value={uploadProgress} max="100" /><small>{uploadProgress}%</small></div>}
          <form className="message-composer" onSubmit={send}>
            <button className={`composer-emoji-button${emojiOpen ? ' active' : ''}`} type="button" onClick={() => setEmojiOpen(open => !open)} aria-label="Choose emoji" aria-expanded={emojiOpen}><Smile size={20} /></button>
            <label className="composer-attach-button" title="Attach photos, videos, or audio"><Paperclip size={19} /><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a" multiple disabled={sending || attachments.length >= 4} onChange={addAttachments} aria-label="Attach media" /></label>
            <textarea ref={inputRef} value={messageBody} onChange={event => setMessageBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={5000} placeholder="Write a message…" aria-label="Write a message" rows={1} />
            <button className="composer-send-button" type="submit" disabled={sending || (!messageBody.trim() && !attachments.length)} aria-label="Send message">{sending ? <Loader size={17} className="animate-spin" /> : <Send size={17} />}</button>
          </form>
        </div>
      </>}
    </main>
    {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDialog('') }}><section className="community-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><h2 id="dialog-title">{dialog === 'group' ? 'Create a group' : 'New conversation'}</h2><button className="icon-action" onClick={() => setDialog('')} aria-label="Close"><X size={18} /></button></header>{dialog === 'group' && <label>Group name<input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={100} /></label>}<label>{dialog === 'group' ? 'Add people' : 'Find a person'}<input value={personQuery} onChange={event => setPersonQuery(event.target.value)} placeholder="Search by name or username" /></label><div className="people-picker">{people.filter(person => person.id !== user?.id).map(person => { const chosen = selectedPeople.some(item => item.id === person.id); return <button key={person.id} onClick={() => dialog === 'group' ? togglePerson(person) : openDirect(person)}><span>{person.display_name} <small>@{person.username}</small></span>{chosen ? <Check size={16} /> : <Plus size={16} />}</button>})}</div>{dialog === 'group' && <><p className="selected-count">{selectedPeople.length} people selected</p><button className="primary-action" disabled={!groupName.trim() || selectedPeople.length === 0} onClick={createGroup}>Create group</button></>}</section></div>}
  </section>
}
