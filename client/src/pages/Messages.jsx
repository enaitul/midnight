import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { ArrowLeft, Check, Edit2, Loader, MessageCircle, Plus, Send, Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { communityService } from '../services/community'
import { findUserSearchResult, getUserSearchResults } from '../services/searchResults'
import { resolveAssetUrl } from '../services/api'

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
  const socketRef = useRef(null)
  const conversationsRef = useRef([])
  const activeIdRef = useRef(null)
  const joinedRoomsRef = useRef(new Set())
  const bottomRef = useRef(null)
  const token = localStorage.getItem('midnight_token')

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
      setActiveId(conversation.id)
      setSearchParams({}, { replace: true })
    }).catch(err => setError(err.response?.data?.error || 'Could not start the conversation.'))
    return () => { cancelled = true }
  }, [searchParams, isAuthenticated, loadConversations, setSearchParams])

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
        setActiveConversation(conversation); setMessages(history.messages)
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
          .then(history => setMessages(current => {
            const merged = new Map(current.map(message => [message.id, message]))
            history.messages.forEach(message => merged.set(message.id, message))
            return [...merged.values()].sort((a, b) => a.id - b.id)
          }))
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
      if (activeIdRef.current === conversationId) { setActiveId(null); setActiveConversation(null); setMessages([]) }
    })
    return () => { socket.disconnect(); socketRef.current = null; joinedRoomsRef.current.clear(); setSocketConnected(false) }
  }, [isAuthenticated, token, receiveMessage, loadConversations])

  useEffect(() => {
    if (socketRef.current?.connected) conversations.forEach(item => {
      if (!joinedRoomsRef.current.has(item.id)) {
        joinedRoomsRef.current.add(item.id)
        socketRef.current.emit('join_conversation', { conversation_id: item.id })
      }
    })
  }, [conversations])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const term = personQuery.trim()
    if (!term || !dialog) { setPeople([]); return undefined }
    const timer = window.setTimeout(() => communityService.search(term, 'users').then(data => setPeople(getUserSearchResults(data))).catch(() => setPeople([])), 250)
    return () => window.clearTimeout(timer)
  }, [personQuery, dialog])

  const openDirect = async person => {
    try {
      const conversation = await communityService.startDirect(person.id)
      setDialog(''); setPersonQuery(''); setActiveId(conversation.id); await loadConversations()
    } catch (err) { setError(err.response?.data?.error || 'Could not start the conversation.') }
  }

  const send = async event => {
    event.preventDefault()
    const body = messageBody.trim()
    if (!body || !activeId || sending) return
    setSending(true); setError('')
    try {
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

  const createGroup = async event => {
    event.preventDefault()
    try {
      const conversation = await communityService.startGroup(groupName, selectedPeople.map(person => person.id))
      setDialog(''); setSelectedPeople([]); setPersonQuery(''); setGroupName(''); setActiveId(conversation.id); await loadConversations()
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
    try { await communityService.leaveGroup(activeId); setActiveId(null); setActiveConversation(null); await loadConversations() }
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
          <button className="mobile-back" onClick={() => setActiveId(null)} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
          {directPerson && (directPerson.avatar_url ? <img className="thread-avatar" src={resolveAssetUrl(directPerson.avatar_url)} alt="" referrerPolicy="no-referrer" /> : <span className="thread-avatar thread-avatar-fallback"><MessageCircle size={17} /></span>)}
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
                <h2>{activeConversation?.title || 'Conversation'}</h2>
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
        {activeConversation?.kind === 'group' && <div className="group-members">{activeConversation.participants.map(person => <span key={person.id}>{person.display_name}{activeRole === 'admin' && person.id !== user?.id && <button onClick={() => removeMember(person)} aria-label={`Remove ${person.display_name}`}><X size={12} /></button>}</span>)}{activeRole === 'admin' && <div className="member-add"><input value={personQuery} onChange={e => setPersonQuery(e.target.value)} placeholder="Add a member" />{people.filter(p => !activeConversation.participants.some(m => m.id === p.id)).map(person => <button key={person.id} onClick={() => manageMember(person)}>{person.display_name} <Plus size={13} /></button>)}</div>}<button className="text-action" onClick={leaveGroup}>Leave group</button></div>}
        <div className="message-history">{messages.length === 0 ? <div className="thread-empty"><p>No messages yet. Begin when you're ready.</p></div> : messages.map(message => <article key={message.id} className={`chat-message${message.sender.id === user?.id ? ' mine' : ''}`}><div className="chat-message-byline"><strong>{message.sender.id === user?.id ? 'You' : message.sender.display_name}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div><p>{message.body}</p></article>)}<div ref={bottomRef} /></div>
        {error && <p className="inline-error">{error}</p>}
        <form className="message-composer" onSubmit={send}><textarea value={messageBody} onChange={e => setMessageBody(e.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={5000} placeholder="Write a message..." aria-label="Write a message" /><button type="submit" disabled={sending || !messageBody.trim()} aria-label="Send message">{sending ? <Loader size={17} className="animate-spin" /> : <Send size={17} />}</button></form>
      </>}
    </main>
    {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDialog('') }}><section className="community-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><h2 id="dialog-title">{dialog === 'group' ? 'Create a group' : 'New conversation'}</h2><button className="icon-action" onClick={() => setDialog('')} aria-label="Close"><X size={18} /></button></header>{dialog === 'group' && <label>Group name<input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={100} /></label>}<label>{dialog === 'group' ? 'Add people' : 'Find a person'}<input value={personQuery} onChange={event => setPersonQuery(event.target.value)} placeholder="Search by name or username" /></label><div className="people-picker">{people.filter(person => person.id !== user?.id).map(person => { const chosen = selectedPeople.some(item => item.id === person.id); return <button key={person.id} onClick={() => dialog === 'group' ? togglePerson(person) : openDirect(person)}><span>{person.display_name} <small>@{person.username}</small></span>{chosen ? <Check size={16} /> : <Plus size={16} />}</button>})}</div>{dialog === 'group' && <><p className="selected-count">{selectedPeople.length} people selected</p><button className="primary-action" disabled={!groupName.trim() || selectedPeople.length === 0} onClick={createGroup}>Create group</button></>}</section></div>}
  </section>
}
