import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { ArrowLeft, Check, Loader, MessageCircle, Plus, Search, Send, Smile, Paperclip, Users, X, Mic, Reply, Camera, Pencil, Shield, UserPlus, UserMinus, LogOut, Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { communityService } from '../services/community'
import { findUserSearchResult, getUserSearchResults } from '../services/searchResults'
import api, { resolveAssetUrl } from '../services/api'
import InstagramIcon from '../components/InstagramIcon'

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
const MESSAGE_MEDIA_TYPES = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'video/mp4': 'video', 'video/webm': 'video', 'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/ogg': 'audio', 'audio/mp4': 'audio', 'audio/x-m4a': 'audio', 'audio/webm': 'audio' }

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

function GroupAvatar({ conversation, className = '' }) {
  const [imageUrl, setImageUrl] = useState('')
  const avatarPath = conversation?.avatar_url
  useEffect(() => {
    if (!avatarPath) { setImageUrl(''); return undefined }
    setImageUrl('')
    let active = true
    let objectUrl = ''
    const endpoint = avatarPath.replace(/^\/api(?=\/)/, '')
    api.get(endpoint, { responseType: 'blob' }).then(response => {
      if (!active) return
      objectUrl = URL.createObjectURL(response.data)
      setImageUrl(objectUrl)
    }).catch(() => { if (active) setImageUrl('') })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [avatarPath])
  return <span className={`group-avatar ${className}`} aria-hidden="true">
    {imageUrl ? <img src={imageUrl} alt="" /> : <Users className="group-avatar-fallback" />}
  </span>
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
      api.get(resolveAssetUrl(item.url), { responseType: 'blob' }).then(response => {
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
  const [groupDescription, setGroupDescription] = useState('')
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [editingGroupDetails, setEditingGroupDetails] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('')
  const [addingMembers, setAddingMembers] = useState(false)
  const [groupActionBusy, setGroupActionBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState(0)
  const [emojiSearch, setEmojiSearch] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [replyTo, setReplyTo] = useState(null)
  const [typingName, setTypingName] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [pullingMessageId, setPullingMessageId] = useState(null)
  const [pullOffset, setPullOffset] = useState(0)
  const [selectedMessageForInfo, setSelectedMessageForInfo] = useState(null)
  const [messageInfo, setMessageInfo] = useState(null)
  const [messageInfoLoading, setMessageInfoLoading] = useState(false)
  const [messageInfoError, setMessageInfoError] = useState('')
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
  const groupAvatarInputRef = useRef(null)
  const groupInfoScrollTopRef = useRef(0)
  const scrollBottomRef = useRef(true)
  const floatDateTimerRef = useRef(null)
  const attachmentsRef = useRef([])
  const typingTimerRef = useRef(null)
  const typingExpiryRef = useRef(null)
  const recorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const messagePointerRef = useRef(null)
  const suppressRecordClickRef = useRef(false)
  const recordHoldTimerRef = useRef(null)
  const holdStartedRef = useRef(false)
  const recordingIntervalRef = useRef(null)
  const recordingPendingRef = useRef(false)
  const stopWhenReadyRef = useRef(false)
  const token = localStorage.getItem('midnight_token')

  const clearComposer = useCallback(() => {
    scrollBottomRef.current = true
    attachmentsRef.current.forEach(item => URL.revokeObjectURL(item.preview))
    attachmentsRef.current = []
    setAttachments([])
    setMessageBody('')
    setReplyTo(null)
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
    if (incoming) socketRef.current?.emit('message_delivered', { conversation_id: message.conversation_id, message_id: message.id })
    if (incoming && message.conversation_id === activeIdRef.current) {
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
    setShowGroupInfo(false)
    setAddingMembers(false)
    setSelectedMessageForInfo(null)
    setConversations(current => current.map(conversation => conversation.id === item.id ? { ...conversation, unread_count: 0 } : conversation))
    setActiveId(item.id)
  }

  useEffect(() => {
    if (!activeId || !isAuthenticated) return
    setTypingName('')
    window.clearTimeout(typingExpiryRef.current)
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
    socket.on('disconnect', () => { joinedRoomsRef.current.clear() })
    socket.on('new_message', receiveMessage)
    socket.on('message_receipt', receipt => {
      if (receipt.user_id === user?.id) return
      const updateReceipt = message => {
        if (message.conversation_id !== receipt.conversation_id || message.sender?.id !== user?.id || message.id > receipt.through_message_id) return message
        const rank = { sent: 0, delivered: 1, seen: 2 }
        return (rank[message.delivery_status] || 0) >= rank[receipt.status]
          ? message
          : { ...message, delivery_status: receipt.status }
      }
      setMessages(current => current.map(updateReceipt))
      setConversations(current => current.map(item => item.id === receipt.conversation_id && item.last_message
        ? { ...item, last_message: updateReceipt(item.last_message) }
        : item))
    })
    socket.on('typing', payload => {
      if (payload.conversation_id !== activeIdRef.current || payload.user_id === user?.id) return
      setTypingName(payload.is_typing ? payload.display_name : '')
      window.clearTimeout(typingExpiryRef.current)
      if (payload.is_typing) typingExpiryRef.current = window.setTimeout(() => setTypingName(''), 2600)
    })
    socket.on('conversation_updated', conversation => {
      loadConversations()
      if (activeIdRef.current === conversation.id) setActiveConversation(conversation)
    })
    socket.on('conversation_removed', ({ conversation_id: conversationId }) => {
      setConversations(current => current.filter(item => item.id !== conversationId))
      if (activeIdRef.current === conversationId) { clearComposer(); setActiveId(null); setActiveConversation(null); setMessages([]) }
    })
    return () => { socket.disconnect(); socketRef.current = null; joinedRoomsRef.current.clear() }
  }, [isAuthenticated, token, receiveMessage, loadConversations, clearComposer, user?.id])

  useEffect(() => {
    if (socketRef.current?.connected) conversations.forEach(item => {
      if (!joinedRoomsRef.current.has(item.id)) {
        joinedRoomsRef.current.add(item.id)
        socketRef.current.emit('join_conversation', { conversation_id: item.id })
      }
    })
  }, [conversations])

  useEffect(() => {
    const history = historyRef.current
    if (scrollBottomRef.current && history) history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' })
  }, [messages])
  useEffect(() => () => {
    attachmentsRef.current.forEach(item => URL.revokeObjectURL(item.preview))
    window.clearTimeout(floatDateTimerRef.current)
    window.clearInterval(recordingIntervalRef.current)
  }, [])

  useEffect(() => {
    const term = personQuery.trim()
    if (!term || (!dialog && !addingMembers)) { setPeople([]); return undefined }
    const timer = window.setTimeout(() => communityService.search(term, 'users').then(data => setPeople(getUserSearchResults(data))).catch(() => setPeople([])), 250)
    return () => window.clearTimeout(timer)
  }, [personQuery, dialog, addingMembers])

  const openDirect = async person => {
    try {
      const conversation = await communityService.startDirect(person.id)
      clearComposer(); setDialog(''); setPersonQuery(''); setShowGroupInfo(false); setActiveId(conversation.id); await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Could not start the conversation.') }
  }

  const send = async event => {
    event.preventDefault()
    const body = messageBody.trim()
    if ((!body && !attachments.length && !replyTo) || !activeId || sending) return
    setSending(true); setError(''); setUploadProgress(0)
    try {
      if (attachments.length) {
        const result = await communityService.sendMessageWithMedia(activeId, body, attachments.map(item => item.file), setUploadProgress, replyTo?.id)
        receiveMessage(result.message)
        attachments.forEach(item => URL.revokeObjectURL(item.preview))
        attachmentsRef.current = []
        setAttachments([]); setMessageBody(''); setReplyTo(null); setEmojiOpen(false); setUploadProgress(0); setSending(false)
        return
      }
      const socket = socketRef.current
      if (socket?.connected) {
        socket.timeout(10000).emit('send_message', { conversation_id: activeId, body, reply_to_id: replyTo?.id }, (timeoutError, result) => {
          if (timeoutError) {
            setError('Delivery could not be confirmed. Checking the saved conversation history…')
            communityService.messages(activeId)
              .then(history => setMessages(history.messages))
              .catch(() => setError('Connection interrupted. Reopen the conversation to check delivery.'))
          } else if (!result?.ok) setError(result?.error || 'Message was not sent.')
          else { receiveMessage(result.message); setMessageBody(''); setReplyTo(null) }
          setSending(false)
        })
      } else {
        const { message } = await communityService.sendMessage(activeId, body, replyTo?.id)
        receiveMessage(message); setMessageBody(''); setReplyTo(null); setSending(false)
      }
    } catch (err) { setError(err.response?.data?.error || 'Message was not sent.'); setSending(false) }
  }

  const emitTyping = value => {
    if (activeId && socketRef.current?.connected) socketRef.current.emit('typing', { conversation_id: activeId, is_typing: value })
  }

  const startRecording = async () => {
    if (recording || recordingPendingRef.current || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      if (!navigator.mediaDevices?.getUserMedia) setError('Voice recording is not available in this browser or connection.')
      return
    }
    try {
      recordingPendingRef.current = true
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recordedChunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size) recordedChunksRef.current.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        window.clearInterval(recordingIntervalRef.current)
        const recordedType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(recordedChunksRef.current, { type: recordedType })
        if (blob.size) {
          const extension = recordedType.includes('mp4') ? 'm4a' : 'webm'
          const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: recordedType })
          const next = [...attachmentsRef.current, { file, mediaType: 'audio', preview: URL.createObjectURL(file), key: crypto.randomUUID() }].slice(0, 4)
          attachmentsRef.current = next; setAttachments(next)
        }
        setRecording(false)
      }
      recorderRef.current = recorder
      recorder.start(); recordingPendingRef.current = false; setRecording(true); setRecordingSeconds(0); setError('')
      const recordingStartedAt = Date.now()
      recordingIntervalRef.current = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000)), 1000)
      if (stopWhenReadyRef.current) { stopWhenReadyRef.current = false; recorder.stop() }
    } catch { recordingPendingRef.current = false; stopWhenReadyRef.current = false; setError('Allow microphone access to record a voice note.') }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    else if (recordingPendingRef.current) stopWhenReadyRef.current = true
  }
  const onRecordPointerDown = event => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    holdStartedRef.current = false
    recordHoldTimerRef.current = window.setTimeout(() => { holdStartedRef.current = true; startRecording() }, 260)
  }

  const onRecordPointerUp = () => {
    window.clearTimeout(recordHoldTimerRef.current)
    if (holdStartedRef.current) {
      suppressRecordClickRef.current = true
      window.setTimeout(() => { suppressRecordClickRef.current = false }, 350)
      stopRecording()
    }
  }

  const beginMessagePull = (message, event) => {
    if (event.button !== undefined && event.button !== 0) return
    if (event.target.closest('a, button, input, textarea, audio, video')) return
    const gesture = { message, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, longPressed: false, timer: null }
    messagePointerRef.current = gesture
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (event.pointerType === 'touch') {
      gesture.timer = window.setTimeout(() => {
        if (messagePointerRef.current !== gesture || gesture.moved) return
        gesture.longPressed = true
        setPullingMessageId(message.id)
        setPullOffset(62)
        if (activeConversation?.kind === 'group' && message.sender.id === user?.id) {
          setSelectedMessageForInfo(message)
        } else {
          window.setTimeout(() => { setReplyTo(message); inputRef.current?.focus() }, 170)
        }
      }, 480)
    }
  }

  const moveMessagePull = event => {
    const gesture = messagePointerRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.longPressed) return
    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX)) {
      gesture.moved = true
      window.clearTimeout(gesture.timer)
      return
    }
    if (deltaX <= 0 || Math.abs(deltaX) < 5 || Math.abs(deltaY) > 48) return
    gesture.moved = true
    window.clearTimeout(gesture.timer)
    setPullingMessageId(gesture.message.id)
    setPullOffset(Math.min(deltaX * 0.82, 76))
  }

  const finishMessagePull = (event, cancelled = false) => {
    const gesture = messagePointerRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    messagePointerRef.current = null
    window.clearTimeout(gesture.timer)
    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    const shouldReply = !cancelled && !gesture.longPressed && deltaX > 66 && Math.abs(deltaY) < 48
    setPullOffset(0)
    window.setTimeout(() => setPullingMessageId(current => current === gesture.message.id ? null : current), 190)
    if (shouldReply) {
      setReplyTo(gesture.message)
      inputRef.current?.focus()
    }
  }

  const replyToMessage = message => {
    setReplyTo(message)
    inputRef.current?.focus()
  }

  const openMessageInfo = async () => {
    if (!selectedMessageForInfo || activeConversation?.kind !== 'group') return
    setMessageInfo(null)
    setMessageInfoError('')
    setMessageInfoLoading(true)
    try {
      const receipts = await communityService.messageReceipts(activeId, selectedMessageForInfo.id)
      setMessageInfo({ message: selectedMessageForInfo, receipts })
    } catch (err) {
      setMessageInfoError(err.response?.data?.error || 'Message information could not be loaded.')
    } finally { setMessageInfoLoading(false) }
  }

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined
    const syncViewport = () => document.documentElement.style.setProperty('--chat-viewport-height', `${viewport.height}px`)
    syncViewport()
    viewport.addEventListener('resize', syncViewport)
    viewport.addEventListener('scroll', syncViewport)
    return () => { viewport.removeEventListener('resize', syncViewport); viewport.removeEventListener('scroll', syncViewport); document.documentElement.style.removeProperty('--chat-viewport-height') }
  }, [])

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
    const dateLine = history.getBoundingClientRect().top + 52
    const visible = [...history.querySelectorAll('[data-message-date]')]
      .find(element => element.getBoundingClientRect().bottom > dateLine)
    if (visible) {
      const nextDate = visible.dataset.dateLabel
      setFloatingDate(current => current === nextDate ? current : nextDate)
      setShowFloatingDate(true)
    }
    window.clearTimeout(floatDateTimerRef.current)
    floatDateTimerRef.current = window.setTimeout(() => setShowFloatingDate(false), 2200)
    if (history.scrollTop < 70 && historyHasMore) loadOlderMessages()
  }

  const createGroup = async event => {
    event.preventDefault()
    try {
      const conversation = await communityService.startGroup(groupName, selectedPeople.map(person => person.id), groupDescription)
      clearComposer(); setDialog(''); setSelectedPeople([]); setPersonQuery(''); setGroupName(''); setGroupDescription(''); setShowGroupInfo(false); setActiveId(conversation.id); await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Group could not be created.') }
  }

  const togglePerson = person => setSelectedPeople(current => current.some(item => item.id === person.id) ? current.filter(item => item.id !== person.id) : [...current, person])
  const acceptGroupUpdate = updated => {
    setActiveConversation(updated)
    setConversations(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))
  }
  const addSelectedMembers = async () => {
    if (!selectedPeople.length || groupActionBusy) return
    setGroupActionBusy(true); setError('')
    try {
      const updated = await communityService.addMembers(activeId, selectedPeople.map(person => person.id))
      acceptGroupUpdate(updated)
      setSelectedPeople([]); setPeople([]); setPersonQuery(''); setAddingMembers(false)
      await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Members could not be added.') }
    finally { setGroupActionBusy(false) }
  }
  const removeMember = async person => {
    if (!window.confirm(`Remove ${person.display_name} from this group? They will lose access to the group conversation.`)) return
    setGroupActionBusy(true); setError('')
    try {
      await communityService.removeMember(activeId, person.id)
      acceptGroupUpdate(await communityService.conversation(activeId))
      await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Member could not be removed.') }
    finally { setGroupActionBusy(false) }
  }
  const leaveGroup = async () => {
    if (!window.confirm('Leave this group? You will no longer receive its messages.')) return
    try { await communityService.leaveGroup(activeId); clearComposer(); setShowGroupInfo(false); setActiveId(null); setActiveConversation(null); await loadConversations() }
    catch (err) { setError(err.response?.data?.error || 'Could not leave this group.') }
  }

  const saveGroupDetails = async event => {
    event.preventDefault()
    setGroupActionBusy(true); setError('')
    try {
      const updated = await communityService.updateGroupDetails(activeId, groupNameDraft, groupDescriptionDraft)
      acceptGroupUpdate(updated)
      setEditingGroupDetails(false)
      await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Group details could not be saved.') }
    finally { setGroupActionBusy(false) }
  }

  const updateMemberRole = async person => {
    const role = person.role === 'admin' ? 'member' : 'admin'
    if (role === 'member' && !window.confirm(`Remove administrator status from ${person.display_name}?`)) return
    setGroupActionBusy(true); setError('')
    try {
      acceptGroupUpdate(await communityService.updateMemberRole(activeId, person.id, role))
      await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Member role could not be changed.') }
    finally { setGroupActionBusy(false) }
  }

  const uploadGroupPicture = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP group picture up to 3 MB.')
      return
    }
    setGroupActionBusy(true); setError('')
    try {
      acceptGroupUpdate(await communityService.uploadGroupAvatar(activeId, file))
      await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Group picture could not be uploaded.') }
    finally { setGroupActionBusy(false) }
  }

  const removeGroupPicture = async () => {
    if (!activeConversation?.avatar_url || !window.confirm('Remove this group picture?')) return
    setGroupActionBusy(true); setError('')
    try {
      acceptGroupUpdate(await communityService.removeGroupAvatar(activeId))
      await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Group picture could not be removed.') }
    finally { setGroupActionBusy(false) }
  }

  const openGroupInfo = () => {
    groupInfoScrollTopRef.current = historyRef.current?.scrollTop || 0
    setShowGroupInfo(true)
    setEditingGroupDetails(false)
    setAddingMembers(false)
  }
  const returnToGroupChat = () => {
    setShowGroupInfo(false)
    requestAnimationFrame(() => { if (historyRef.current) historyRef.current.scrollTop = groupInfoScrollTopRef.current })
  }

  const activeRole = activeConversation?.participants?.find(person => person.id === user?.id)?.role
  const activeListConversation = conversations.find(item => item.id === activeId)
  const avatarConversation = activeConversation?.kind === 'group' && activeListConversation
    ? { ...activeConversation, avatar_url: activeListConversation.avatar_url }
    : activeConversation
  const directPerson = activeConversation?.kind === 'direct' ? activeConversation.participants?.find(person => person.id !== user?.id) : null
  if (loading) return <div className="loading-state"><Loader size={22} className="animate-spin" /></div>
  return <section className={`messages-page${activeId ? ' conversation-open' : ''}`}>
    <aside className="conversation-list">
      <div className="messages-heading"><div><p className="eyebrow">A note between people</p><h1>Messages</h1></div><button className="icon-action" onClick={() => { setDialog('direct'); setError('') }} aria-label="Start a conversation" title="Start a conversation"><Plus size={18} /></button></div>
      <div className="message-list-actions"><button className="text-action" onClick={() => { setDialog('group'); setError(''); setGroupName(''); setGroupDescription(''); setPersonQuery(''); setSelectedPeople([]) }}><Users size={15} /> New group</button></div>
      {error && <p className="inline-error messages-error">{error}</p>}
      {conversations.length === 0 ? <p className="feed-empty small">Your conversations will appear here.</p> : conversations.map(item => {
        const otherPerson = item.kind === 'direct' ? item.participants?.find(person => person.id !== user?.id) : null
        const lastMessage = item.last_message
        const lastMessagePreview = lastMessage?.system_event
          ? `${lastMessage.sender?.id === user?.id ? 'You' : lastMessage.sender?.display_name || 'A group admin'} ${lastMessage.body}`
          : lastMessage?.body || 'No messages yet'
        return <button type="button" key={item.id} onClick={() => openConversation(item)} className={`conversation-preview${activeId === item.id ? ' active' : ''}`}>
        {item.kind === 'group' ? <GroupAvatar key={`${item.id}:${item.avatar_url || 'default'}`} conversation={item} className="conversation-mark" /> : <span className="conversation-mark">{otherPerson?.avatar_url ? <img src={resolveAssetUrl(otherPerson.avatar_url)} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{(otherPerson?.display_name || '?').slice(0, 1).toUpperCase()}</span>}</span>}<span className="conversation-copy"><strong>{item.title || item.name || 'Conversation'}</strong><small>{lastMessagePreview}</small></span><span className="conversation-trailing">{!item.unread_count && item.last_message?.created_at && <time className="conversation-time" dateTime={item.last_message.created_at} title={new Date(item.last_message.created_at).toLocaleString()}>{new Date(item.last_message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}{item.unread_count > 0 && <span className="unread-badge" aria-label={`${item.unread_count} unread messages`}>{item.unread_count}</span>}</span>
      </button>})}
    </aside>
    <main className="message-thread">
      {showGroupInfo && activeConversation?.kind === 'group' ? <section className="group-info-screen">
        <header className="group-info-header"><button type="button" onClick={returnToGroupChat} aria-label="Back to conversation"><ArrowLeft size={19} /><span>Back</span></button><h2>Group info</h2><span /></header>
        <div className="group-info-scroll">
          <section className="group-info-hero">
            <GroupAvatar key={`${activeConversation.id}:${avatarConversation?.avatar_url || 'default'}`} conversation={avatarConversation} className="group-avatar-large" />
            {activeRole === 'admin' && <div className="group-picture-actions">
              <input ref={groupAvatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadGroupPicture} hidden />
              <button type="button" onClick={() => groupAvatarInputRef.current?.click()} disabled={groupActionBusy}><Camera size={16} />{activeConversation.avatar_url ? 'Change picture' : 'Add picture'}</button>
              {activeConversation.avatar_url && <button type="button" className="group-remove-picture" onClick={removeGroupPicture} disabled={groupActionBusy}>Remove</button>}
            </div>}
            <h1>{activeConversation.name || 'Group conversation'}</h1>
            <p>{activeConversation.participants?.length || 0} members</p>
          </section>

          {error && <p className="inline-error group-info-error" role="alert">{error}</p>}

          <section className="group-info-section">
            <header><div><p className="eyebrow">About</p><h3>Group details</h3></div>{activeRole === 'admin' && !editingGroupDetails && <button type="button" className="group-info-edit" onClick={() => { setGroupNameDraft(activeConversation.name || ''); setGroupDescriptionDraft(activeConversation.description || ''); setEditingGroupDetails(true) }}><Pencil size={15} /> Edit details</button>}</header>
            {editingGroupDetails ? <form className="group-info-form" onSubmit={saveGroupDetails}>
              <label>Group name<input value={groupNameDraft} onChange={event => setGroupNameDraft(event.target.value)} maxLength={100} required /></label>
              <label>Description<textarea value={groupDescriptionDraft} onChange={event => setGroupDescriptionDraft(event.target.value)} maxLength={500} rows={3} placeholder="Add a group description" /></label>
              <div className="group-info-form-actions"><button type="button" className="text-action" onClick={() => setEditingGroupDetails(false)}>Cancel</button><button type="submit" className="primary-action" disabled={groupActionBusy || !groupNameDraft.trim()}>{groupActionBusy ? 'Saving…' : 'Save changes'}</button></div>
            </form> : <p className="group-info-description">{activeConversation.description || 'No description yet.'}</p>}
          </section>

          <section className="group-info-section group-members-section">
            <header><div><p className="eyebrow">People</p><h3>Members <span>({activeConversation.participants?.length || 0})</span></h3></div>{activeRole === 'admin' && <button type="button" className="group-info-edit" onClick={() => { setAddingMembers(value => !value); setSelectedPeople([]); setPersonQuery(''); setPeople([]) }}><UserPlus size={16} /> Add</button>}</header>
            {addingMembers && activeRole === 'admin' && <div className="group-add-members">
              <label>Find people<input value={personQuery} onChange={event => setPersonQuery(event.target.value)} placeholder="Search by name or username" /></label>
              <div className="group-member-candidates">{people.filter(person => person.id !== user?.id && !activeConversation.participants.some(member => member.id === person.id)).map(person => {
                const selected = selectedPeople.some(item => item.id === person.id)
                return <button type="button" key={person.id} onClick={() => togglePerson(person)} aria-pressed={selected}><span>{person.display_name}<small>@{person.username}</small></span>{selected ? <Check size={17} /> : <Plus size={17} />}</button>
              })}{personQuery.trim() && !people.some(person => person.id !== user?.id && !activeConversation.participants.some(member => member.id === person.id)) && <p>No available people found.</p>}</div>
              <div className="group-info-form-actions"><span className="selected-count">{selectedPeople.length} selected</span><button type="button" className="primary-action" onClick={addSelectedMembers} disabled={!selectedPeople.length || groupActionBusy}>{groupActionBusy ? 'Adding…' : 'Add members'}</button></div>
            </div>}
            <div className="group-member-list">{activeConversation.participants.map(person => <article className="group-member-row" key={person.id}>
              {person.avatar_url ? <img className="group-member-avatar" src={resolveAssetUrl(person.avatar_url)} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="group-member-avatar group-member-avatar-fallback">{(person.display_name || '?').slice(0, 1).toUpperCase()}</span>}
              <span className="group-member-copy"><strong>{person.display_name}{person.id === user?.id ? ' (you)' : ''}</strong><small>@{person.username}</small></span>
              <span className={`group-role-label${person.role === 'admin' ? ' admin' : ''}`}>{person.role === 'admin' ? <><Shield size={12} /> Admin</> : 'Member'}</span>
              {activeRole === 'admin' && person.id !== user?.id && <div className="group-member-actions">
                <button type="button" onClick={() => updateMemberRole(person)} disabled={groupActionBusy} aria-label={`${person.role === 'admin' ? 'Demote' : 'Promote'} ${person.display_name}`} title={person.role === 'admin' ? 'Make member' : 'Make admin'}>{person.role === 'admin' ? <Shield size={15} /> : <Shield size={15} />}</button>
                <button type="button" className="remove-member-action" onClick={() => removeMember(person)} disabled={groupActionBusy} aria-label={`Remove ${person.display_name}`} title="Remove member"><UserMinus size={16} /></button>
              </div>}
            </article>)}</div>
          </section>
          <button type="button" className="group-leave-button" onClick={leaveGroup}><LogOut size={16} /> Leave group</button>
        </div>
      </section> : !activeId ? <div className="thread-empty"><MessageCircle size={28} /><p>Choose a conversation, or begin a new one.</p></div> : <>
        <header className="thread-header">
          <button className="mobile-back" onClick={() => { clearComposer(); setActiveId(null) }} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
          {activeConversation?.kind === 'group' ? <button type="button" className="group-header-trigger" onClick={openGroupInfo} aria-label="Open group information">
            <GroupAvatar key={`${activeConversation.id}:${avatarConversation?.avatar_url || 'default'}`} conversation={avatarConversation} className="group-avatar-header" />
            <span className="thread-person-copy"><strong>{activeConversation.name || 'Group conversation'}</strong><small className="thread-bio">{activeConversation.description || `${activeConversation.participants?.length || 0} members`}</small></span>
          </button> : <>
            {directPerson && <Link className="thread-profile-avatar" to={`/profile/${encodeURIComponent(directPerson.username)}`} aria-label={`View ${directPerson.display_name}'s profile`}>
              {directPerson.avatar_url ? <img className="thread-avatar" src={resolveAssetUrl(directPerson.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="thread-avatar thread-avatar-fallback">{(directPerson.display_name || '?').slice(0, 1).toUpperCase()}</span>}
            </Link>}
            <div className="thread-person-copy"><h2>{directPerson ? <Link className="thread-profile-name" to={`/profile/${encodeURIComponent(directPerson.username)}`}>{directPerson.display_name}</Link> : activeConversation?.title || 'Conversation'}</h2><small className="thread-bio">{directPerson?.biography?.trim() || 'No bio added yet'}</small></div>
          </>}
          {directPerson?.instagram_url && <a className="thread-instagram-link" href={directPerson.instagram_url} target="_blank" rel="noreferrer noopener" aria-label={`${directPerson.display_name}'s Instagram profile`} title="Open Instagram profile"><InstagramIcon size={20} /></a>}
          {activeConversation?.kind === 'group' && selectedMessageForInfo && <><button type="button" className="message-info-action" onClick={openMessageInfo} aria-label="View message info" title="Message info"><Info size={18} /><span>Info</span></button><button type="button" className="message-info-dismiss" onClick={() => setSelectedMessageForInfo(null)} aria-label="Clear selected message"><X size={17} /></button></>}
          {activeConversation?.kind === 'group' && !selectedMessageForInfo && <span className="participants-count"><Users size={15} /> {activeConversation.participants.length}</span>}
        </header>
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
              {message.system_event && <div className="group-system-event" role="status"><span>{message.sender?.id === user?.id ? 'You' : message.sender?.display_name || 'A group admin'} {message.body}</span><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>}
              {message.system_event ? null : <article className={`chat-message${mine ? ' mine' : ''}${startsGroup ? ' group-start' : ''}${endsGroup ? ' group-end' : ''}${pullingMessageId === message.id ? ' is-pulling' : ''}${selectedMessageForInfo?.id === message.id ? ' message-info-selected' : ''}`} style={pullingMessageId === message.id ? { transform: `translateX(${pullOffset}px)` } : undefined} data-message-date={dayKey(message.created_at)} data-date-label={dayLabel(message.created_at)} onContextMenu={event => { if (activeConversation?.kind !== 'group' || !mine) return; event.preventDefault(); setSelectedMessageForInfo(message) }} onPointerDown={event => beginMessagePull(message, event)} onPointerMove={moveMessagePull} onPointerUp={event => finishMessagePull(event)} onPointerCancel={event => finishMessagePull(event, true)}>
                {!mine && avatar}
                <div className="chat-message-stack">
                  {activeConversation?.kind === 'group' && startsGroup && <Link className="chat-sender-name" to={`/profile/${encodeURIComponent(message.sender.username)}`}>{mine ? 'You' : message.sender.display_name}</Link>}
                  <div className="chat-bubble">
                    <button type="button" className="message-reply-button" aria-label={`Reply to ${message.sender.display_name}'s message`} title="Reply to message" onClick={event => { event.stopPropagation(); replyToMessage(message) }}><Reply size={16} /></button>
                    {message.reply_to && <div className="reply-quote"><strong>{message.reply_to.sender}</strong><span>{message.reply_to.body || 'Attachment'}</span></div>}
                    {message.body && <p>{messageLinks(message.body)}</p>}
                    {!!media.length && <div className="message-media-list">{media.map(item => <SharedMessageMedia item={item} key={item.id} />)}</div>}
                    <span className="message-meta"><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>{mine && activeConversation?.kind === 'direct' && message.delivery_status && <span className={`message-status ${message.delivery_status}`} role="img" aria-label={message.delivery_status} title={message.delivery_status === 'seen' ? 'Seen' : message.delivery_status === 'delivered' ? 'Delivered' : 'Sent'}><Check size={13} />{message.delivery_status !== 'sent' && <Check size={13} />}</span>}</span>
                  </div>
                </div>
              </article>}
            </div>
          })}
          {typingName && <div className="typing-indicator" aria-live="polite"><span className="typing-dots"><i /><i /><i /></span>{typingName} is typing</div>}
          <div ref={bottomRef} />
        </div>
        {error && <p className="inline-error messages-thread-error">{error}</p>}
        <div className="message-composer-wrap">
          {replyTo && <div className="reply-preview"><Reply size={16} /><span><strong>Replying to {replyTo.sender.id === user?.id ? 'yourself' : replyTo.sender.display_name}</strong><small>{replyTo.body || 'Attachment'}</small></span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={17} /></button></div>}
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
          {recording && <div className="voice-recording-status" role="status" aria-live="polite"><span className="voice-recording-dot" /><span>Recording</span><span className="voice-recording-wave" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(index => <i key={index} />)}</span><time>{String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}</time></div>}
          <form className="message-composer" onSubmit={send}>
            <button className={`composer-emoji-button${emojiOpen ? ' active' : ''}`} type="button" onClick={() => setEmojiOpen(open => !open)} aria-label="Choose emoji" aria-expanded={emojiOpen}><Smile size={20} /></button>
            <label className="composer-attach-button" title="Attach photos, videos, or audio"><Paperclip size={19} /><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm" multiple disabled={sending || attachments.length >= 4} onChange={addAttachments} aria-label="Attach media" /></label>
            <textarea ref={inputRef} value={messageBody} onChange={event => { setMessageBody(event.target.value); emitTyping(true); window.clearTimeout(typingTimerRef.current); typingTimerRef.current = window.setTimeout(() => emitTyping(false), 1100) }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={5000} placeholder="Write a message…" aria-label="Write a message" rows={1} />
            <button className={`composer-voice-button${recording ? ' recording' : ''}`} type="button" aria-label={recording ? 'Stop recording voice note' : 'Record voice note'} title={recording ? 'Tap to finish recording' : 'Hold or tap to record a voice note'} onPointerDown={onRecordPointerDown} onPointerUp={onRecordPointerUp} onPointerCancel={onRecordPointerUp} onClick={() => { if (suppressRecordClickRef.current) return; if (recording) stopRecording(); else startRecording() }}><Mic size={21} /></button>
            <button className="composer-send-button" type="submit" disabled={sending || (!messageBody.trim() && !attachments.length && !replyTo)} aria-label="Send message">{sending ? <Loader size={17} className="animate-spin" /> : <Send size={17} />}</button>
          </form>
        </div>
      </>}
    </main>
    {messageInfoLoading || messageInfoError || messageInfo ? <div className="dialog-backdrop message-info-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setMessageInfo(null); setMessageInfoError('') } }}><section className="message-info-dialog" role="dialog" aria-modal="true" aria-labelledby="message-info-title"><header><div><p className="eyebrow">Group message</p><h2 id="message-info-title">Message info</h2></div><button className="icon-action" onClick={() => { setMessageInfo(null); setMessageInfoError('') }} aria-label="Close message info"><X size={18} /></button></header>{messageInfoLoading ? <p className="message-info-state">Loading receipts…</p> : messageInfoError ? <p className="message-info-state error">{messageInfoError}</p> : messageInfo && <><p className="message-info-preview">{messageInfo.message.body || 'Attachment'}<time>{new Date(messageInfo.message.created_at).toLocaleString()}</time></p>{['read', 'delivered', 'sent'].map(status => { const entries = messageInfo.receipts.filter(receipt => receipt.status === status); return <section className="message-info-status-group" key={status}><h3><span className={`message-info-status-dot ${status}`} />{status === 'read' ? 'Read by' : status === 'delivered' ? 'Delivered to' : 'Sent to'} <span>{entries.length}</span></h3>{entries.length ? entries.map(person => <p key={person.user_id}><strong>{person.display_name}</strong><small>@{person.username}</small></p>) : <p className="message-info-empty">No members yet</p>}</section>})}</>}</section></div> : null}
    {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDialog('') }}><section className="community-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><h2 id="dialog-title">{dialog === 'group' ? 'Create a group' : 'New conversation'}</h2><button className="icon-action" onClick={() => setDialog('')} aria-label="Close"><X size={18} /></button></header>{dialog === 'group' && <><label>Group name<input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={100} /></label><label>Description<textarea value={groupDescription} onChange={event => setGroupDescription(event.target.value)} maxLength={500} rows={3} placeholder="Optional group description" /></label></>}<label>{dialog === 'group' ? 'Add people' : 'Find a person'}<input value={personQuery} onChange={event => setPersonQuery(event.target.value)} placeholder="Search by name or username" /></label><div className="people-picker">{people.filter(person => person.id !== user?.id).map(person => { const chosen = selectedPeople.some(item => item.id === person.id); return <button key={person.id} onClick={() => dialog === 'group' ? togglePerson(person) : openDirect(person)}><span>{person.display_name} <small>@{person.username}</small></span>{chosen ? <Check size={16} /> : <Plus size={16} />}</button>})}</div>{dialog === 'group' && <><p className="selected-count">{selectedPeople.length} people selected</p><button className="primary-action" disabled={!groupName.trim() || selectedPeople.length === 0} onClick={createGroup}>Create group</button></>}</section></div>}
  </section>
}
