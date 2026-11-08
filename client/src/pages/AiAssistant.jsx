import { Fragment, useEffect, useRef, useState } from 'react'
import { Bot, Info, KeyRound, Send, Sparkles, Trash2, WandSparkles } from 'lucide-react'

const KEY_STORAGE = 'midnight_gemini_api_key'
const MODEL = 'gemini-2.5-flash'
const STARTERS = [
  'Help me turn this thought into a poem',
  'Polish my writing while keeping my voice',
  'Give me a few ways to finish this line',
]

function readKey() {
  try { return sessionStorage.getItem(KEY_STORAGE) || '' } catch { return '' }
}

const INLINE_MARKDOWN = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|`[^`\n]+`|\*[^*\n]+?\*|_[^_\n]+?_)/g

function AssistantInlineText({ text }) {
  return text.split(INLINE_MARKDOWN).map((part, index) => {
    if (!part) return null
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={index}>{part.slice(2, -2)}</s>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={index}>{part.slice(1, -1)}</em>
    return <Fragment key={index}>{part}</Fragment>
  })
}

function AssistantFormattedText({ text }) {
  const blocks = text.trim().split(/\n\s*\n/).filter(Boolean)
  const groups = []
  blocks.forEach(block => {
    const lines = block.split(/\r?\n/)
    const firstLine = lines[0]
    const ordered = firstLine.match(/^\s*(\d+)[.)]\s+(.*)$/)
    const unordered = firstLine.match(/^\s*[-+*]\s+(.*)$/)
    if (ordered || unordered) {
      const type = ordered ? 'ordered' : 'unordered'
      const previous = groups[groups.length - 1]
      const group = previous?.type === type ? previous : { type, items: [] }
      if (group !== previous) groups.push(group)
      group.items.push({ lines: [ordered ? ordered[2] : unordered[1], ...lines.slice(1)] })
      return
    }
    groups.push({ type: 'paragraph', lines })
  })

  const linesContent = lines => lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}<AssistantInlineText text={line} /></Fragment>)
  return <div className="assistant-markdown">{groups.map((group, index) => {
    if (group.type === 'ordered' || group.type === 'unordered') {
      const List = group.type === 'ordered' ? 'ol' : 'ul'
      return <List key={index}>{group.items.map((item, itemIndex) => <li key={itemIndex}>{linesContent(item.lines)}</li>)}</List>
    }
    return <p key={index}>{linesContent(group.lines)}</p>
  })}</div>
}

export default function AiAssistant() {
  const [apiKey, setApiKey] = useState(readKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyEditorOpen, setKeyEditorOpen] = useState(!readKey())
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const historyRef = useRef(null)

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const saveKey = event => {
    event.preventDefault()
    const nextKey = keyDraft.trim()
    if (!nextKey) return
    try { sessionStorage.setItem(KEY_STORAGE, nextKey) } catch { /* Keep the key in memory for this page. */ }
    setApiKey(nextKey)
    setKeyDraft('')
    setKeyEditorOpen(false)
    setError('')
  }

  const clearKey = () => {
    try { sessionStorage.removeItem(KEY_STORAGE) } catch { /* The key is also cleared from page memory. */ }
    setApiKey('')
    setKeyDraft('')
    setKeyEditorOpen(true)
  }

  const send = async (event, forcedText) => {
    event?.preventDefault()
    const text = (forcedText ?? draft).trim()
    if (!text || !apiKey || busy) return
    const nextMessages = [...messages, { role: 'user', text }]
    setMessages(nextMessages)
    setDraft('')
    setError('')
    setBusy(true)
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'You are Pablo, a warm and thoughtful writing partner. Help people write poetry, shape rough thoughts, polish drafts while preserving their voice, explore imagery, and find words. Match the length the user asks for; when they request a long poem, draft, or exploration, write a complete, developed response instead of summarizing. Be natural, collaborative, and specific. Ask a brief clarifying question when it would improve the writing. Never claim to be human, or to have edited or saved the user’s work.' }] },
          contents: nextMessages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text }] })),
          generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(response.status === 400 || response.status === 401 || response.status === 403 ? 'I couldn’t use that key. Please check it and try again.' : 'I couldn’t reach you just now. Please try again.')
      const candidate = data.candidates?.[0]
      const answer = candidate?.content?.parts?.map(part => part.text || '').join('').trim()
      if (!answer) throw new Error('No words came back this time. Please try again.')
      setMessages(current => [...current, { role: 'assistant', text: answer, truncated: candidate.finishReason === 'MAX_TOKENS' }])
    } catch (err) {
      setError(err.message || 'I couldn’t reach you just now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const startNewChat = () => {
    setMessages([])
    setDraft('')
    setError('')
  }

  return <section className="assistant-page" aria-label="Talk to Pablo">
    <aside className="assistant-conversations">
      <header className="assistant-list-heading"><div><h1>Midnight notes</h1></div><button type="button" onClick={startNewChat} aria-label="Start a new chat" title="Start a new chat"><Sparkles size={17} /></button></header>
      <button type="button" className="assistant-conversation active" onClick={startNewChat}><span className="assistant-avatar"><Bot size={19} /></span><span><strong>Pablo</strong></span></button>
      <p className="assistant-privacy-note">Your words stay in this page session. Messages go straight to Google using your key.</p>
    </aside>
    <main className="assistant-thread">
      <header className="assistant-thread-header"><span className="assistant-avatar"><Sparkles size={18} /></span><span><strong>Pablo</strong></span><div className="assistant-thread-actions">
        {apiKey ? <><button type="button" onClick={() => setKeyEditorOpen(open => !open)}><KeyRound size={15} /> API key</button><button type="button" className="assistant-clear-key" onClick={clearKey} aria-label="Remove API key" title="Remove API key"><Trash2 size={15} /></button></> : <button type="button" onClick={() => setKeyEditorOpen(true)}><KeyRound size={15} /> Add API key</button>}
        <a className="assistant-key-info" href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer noopener" aria-label="Get an API key from Google AI Studio" title="Get an API key from Google AI Studio"><Info size={16} /></a>
      </div></header>
      {keyEditorOpen && <form className="assistant-key-panel" onSubmit={saveKey}><div><strong><KeyRound size={16} /> Connect your API key</strong><p>Get a key from Google AI Studio. It stays in this tab and goes directly to Google; midnight does not receive it.</p></div><label><span className="sr-only">API key</span><input type="password" value={keyDraft} onChange={event => setKeyDraft(event.target.value)} placeholder="Paste your API key" autoComplete="new-password" /></label><button type="submit" className="assistant-key-save" disabled={!keyDraft.trim()}>Save key</button></form>}
      <div className="assistant-history" ref={historyRef} aria-live="polite">
        {messages.length === 0 ? <div className="assistant-welcome"><span className="assistant-welcome-icon"><WandSparkles size={23} /></span><h2>If the words run quiet, Pablo can help you ink down your midnight thoughts.</h2>{apiKey && <div className="assistant-starters">{STARTERS.map(starter => <button type="button" key={starter} onClick={() => { setDraft(starter); document.querySelector('.assistant-composer textarea')?.focus() }}>{starter}</button>)}</div>}</div> : <div className="assistant-message-list">{messages.map((message, index) => <article className={`assistant-message ${message.role}`} key={`${index}-${message.role}`}><span className="assistant-message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : 'You'}</span><div className="assistant-message-content"><span className="assistant-message-author">{message.role === 'assistant' ? 'Pablo' : 'You'}</span><AssistantFormattedText text={message.text} />{message.truncated && <div className="assistant-truncated"><span>That was a long thought. Shall I carry on?</span><button type="button" disabled={busy} onClick={() => send(null, 'Continue from exactly where you stopped. Do not repeat the previous text.')}>Continue <WandSparkles size={13} /></button></div>}</div></article>)}{busy && <div className="assistant-message assistant"><span className="assistant-message-avatar"><Sparkles size={15} /></span><div className="assistant-message-content"><span className="assistant-message-author">Pablo</span><p className="assistant-thinking">Thinking<span>···</span></p></div></div>}</div>}
      </div>
      <div className="assistant-composer-wrap">
        {error && <p className="assistant-error" role="alert">{error}</p>}
        <form className="assistant-composer" onSubmit={send}><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event) } }} maxLength={8000} placeholder={apiKey ? 'Tell me what’s on your mind…' : 'Add your API key before we begin'} aria-label="Message Pablo" disabled={!apiKey || busy} rows={1} /><button type="submit" disabled={!apiKey || !draft.trim() || busy} aria-label="Send message"><Send size={17} /></button></form>
      </div>
    </main>
  </section>
}
