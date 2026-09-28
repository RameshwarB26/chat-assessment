import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  return [...byId.values()].sort(
    (first, second) => new Date(first.timestamp) - new Date(second.timestamp),
  )
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function App() {
  const [username, setUsername] = useState('')
  const [text, setText] = useState('')
  const [messages, setMessages] = useState([])
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const socketRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    const socket = io(BACKEND_URL)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnection('connected')
      setError('')
    })
    socket.on('disconnect', () => setConnection('disconnected'))
    socket.on('connect_error', () => {
      setConnection('disconnected')
      setError('Could not connect to the chat server. Retrying…')
    })
    socket.on('new_message', (message) => {
      setMessages((current) => mergeMessages(current, [message]))
    })
    socket.on('message_error', (response) => {
      setError(response?.error || 'The message could not be sent.')
    })

    const controller = new AbortController()
    fetch(`${BACKEND_URL}/api/messages`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load previous messages.')
        return response.json()
      })
      .then((previousMessages) => {
        if (!Array.isArray(previousMessages)) throw new Error('Invalid message history response.')
        setMessages((current) => mergeMessages(current, previousMessages))
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') {
          setError('Could not load previous messages. Check that the backend is running.')
        }
      })
      .finally(() => setLoading(false))

    return () => {
      controller.abort()
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  async function sendMessage(event) {
    event.preventDefault()
    const cleanUsername = username.trim()
    const cleanText = text.trim()
    if (!cleanUsername || !cleanText) {
      setError('Enter a username and a message to send.')
      return
    }
    setError('')
    try {
      const response = await fetch(`${BACKEND_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, text: cleanText }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The message could not be sent.')
      setMessages((current) => mergeMessages(current, [result]))
      setText('')
    } catch (sendError) {
      setError(sendError.message || 'Could not send the message. Check that the backend is running.')
    }
  }

  return (
    <main className="page-shell">
      <section className="chat-card" aria-label="Real-time chat">
        <header className="chat-header">
          <div className="brand-mark" aria-hidden="true">C</div>
          <div className="heading-copy">
            <p className="eyebrow">OPEN CHAT ROOM</p>
            <h1>Say hello.</h1>
            <p className="subtitle">A little space for a good conversation.</p>
          </div>
          <div className={`connection-pill ${connection}`} role="status">
            <span className="status-dot" />
            {connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}
          </div>
        </header>

        <div className="conversation" aria-live="polite" aria-relevant="additions text">
          {loading && messages.length === 0 && <p className="conversation-note">Loading conversation…</p>}
          {!loading && messages.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">✳</span>
              <h2>It’s quiet in here</h2>
              <p>Start the conversation with the first message.</p>
            </div>
          )}
          {messages.map((message) => {
            const isMine = username.trim() && message.username === username.trim()
            return (
              <article className={`message-row ${isMine ? 'mine' : ''}`} key={message.id}>
                <div className="message-avatar" aria-hidden="true">
                  {(message.username?.trim().charAt(0) || '?').toUpperCase()}
                </div>
                <div className="message-content">
                  <div className="message-meta">
                    <span className="message-author">{message.username}</span>
                    <time dateTime={message.timestamp}>{formatTime(message.timestamp)}</time>
                  </div>
                  <p className="message-bubble">{message.text}</p>
                </div>
              </article>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <footer className="composer-area">
          {error && <p className="error-banner" role="alert">{error}</p>}
          <form className="composer" onSubmit={sendMessage}>
            <label className="username-field">
              <span>Your name</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. Alex"
                maxLength={40}
                autoComplete="nickname"
                aria-label="Username"
              />
            </label>
            <label className="message-field">
              <span className="sr-only">Message</span>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Write a message…"
                aria-label="Message"
              />
            </label>
            <button className="send-button" type="submit" aria-label="Send message">
              <span>Send</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M10 4l6 6-6 6" /></svg>
            </button>
          </form>
          <p className="composer-hint">Press <kbd>Enter</kbd> to send</p>
        </footer>
      </section>
      <p className="page-caption">A simple chat, shared in real time.</p>
    </main>
  )
}

export default App
