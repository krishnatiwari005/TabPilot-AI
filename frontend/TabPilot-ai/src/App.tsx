
import { useEffect, useRef, useState } from 'react'
import AuthScreen from './AuthScreen'

const API_URL = 'http://127.0.0.1:8000'

interface PageContent {
  title: string
  url: string
  text: string
}

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
}

interface AuthUser {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
}

function App() {
  // Authentication
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)

  // Webpage and PDF state
  const [page, setPage] = useState<PageContent | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [loadingPage, setLoadingPage] = useState(false)

  // Chat state
  const [input, setInput] = useState('')
  const [nextMessageId, setNextMessageId] = useState(2)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content:
        "Hi! I'm TabPilot AI. Analyze a webpage or attach a PDF to get started.",
    },
  ])

  // Restore the extension session and validate the token.
  useEffect(() => {
    let cancelled = false

    async function checkAuth() {
      try {
        const stored = await chrome.storage.session.get('access_token')
        const token = stored.access_token as string | undefined

        if (!token) {
          if (!cancelled) {
            setAuthToken(null)
            setCurrentUser(null)
            setAuthChecked(true)
          }
          return
        }

        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          await chrome.storage.session.remove('access_token')

          if (!cancelled) {
            setAuthToken(null)
            setCurrentUser(null)
          }

          return
        }

        const user = (await response.json()) as AuthUser

        if (!cancelled) {
          setAuthToken(token)
          setCurrentUser(user)
        }
      } catch {
        // Keep authentication UI available if the API is unreachable.
        if (!cancelled) {
          setAuthToken(null)
          setCurrentUser(null)
        }
      } finally {
        if (!cancelled) {
          setAuthChecked(true)
        }
      }
    }

    void checkAuth()

    return () => {
      cancelled = true
    }
  }, [])

  // Called after AuthScreen successfully logs in.
  async function handleAuthenticated(token: string) {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        await chrome.storage.session.remove('access_token')
        setAuthToken(null)
        setCurrentUser(null)
        return
      }

      const user = (await response.json()) as AuthUser

      setAuthToken(token)
      setCurrentUser(user)
      setMessages([
        {
          id: 1,
          role: 'assistant',
          content:
            "Welcome to TabPilot AI! Analyze a webpage or attach a PDF to get started.",
        },
      ])
      setNextMessageId(2)
    } catch {
      setAuthToken(null)
      setCurrentUser(null)
      setMessages((previous) => [
        ...previous,
        {
          id: nextMessageId,
          role: 'assistant',
          content:
            'Could not verify your login with the backend. Please check that FastAPI is running and try again.',
        },
      ])
      setNextMessageId((current) => current + 1)
    }
  }

  // Logout and clear the extension session.
  async function logout() {
    await chrome.storage.session.remove('access_token')

    setAuthToken(null)
    setCurrentUser(null)
    setPage(null)
    setPdf(null)
    setInput('')
    setMessages([
      {
        id: 1,
        role: 'assistant',
        content: "You've logged out. Sign in again to use TabPilot AI.",
      },
    ])
    setNextMessageId(2)
  }

  function addMessage(role: Message['role'], content: string) {
    const id = nextMessageId

    setNextMessageId((current) => current + 1)
    setMessages((previous) => [
      ...previous,
      { id, role, content },
    ])
  }

  // Extract the active webpage through the extension service worker.
  function analyzePage() {
    if (loadingPage) return

    setLoadingPage(true)

    chrome.runtime.sendMessage(
      { type: 'ANALYZE_PAGE' },
      (response) => {
        setLoadingPage(false)

        if (chrome.runtime.lastError) {
          addMessage(
            'assistant',
            chrome.runtime.lastError.message ?? 'Extension error.',
          )
          return
        }

        if (response?.error) {
          addMessage('assistant', response.error)
          return
        }

        if (!response?.data) {
          addMessage('assistant', 'No webpage content was returned.')
          return
        }

        setPage(response.data as PageContent)

        addMessage(
          'assistant',
          'Webpage content loaded successfully. You can now ask questions about it.',
        )
      },
    )
  }

  // Select a PDF. Actual extraction and RAG will be implemented in the backend.
  function selectPdf(file?: File) {
    if (!file) return

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      addMessage('assistant', 'Please select a PDF file.')
      return
    }

    setPdf(file)

    addMessage(
      'assistant',
      `"${file.name}" is attached. PDF RAG will be available once the backend is connected.`,
    )
  }

  function removePdf() {
    setPdf(null)
  }

  // Current frontend demo. The authenticated AI endpoint will be connected later.
  function sendMessage(text = input) {
    const question = text.trim()

    if (!question) return

    addMessage('user', question)
    setInput('')

    if (pdf) {
      addMessage(
        'assistant',
        `Demo mode: I'll answer "${question}" using "${pdf.name}" once the PDF RAG backend is connected.`,
      )
      return
    }

    if (page) {
      addMessage(
        'assistant',
        `Demo mode: You asked "${question}". The content from "${page.title}" is available. Real AI answers will come after we connect the FastAPI agent backend.`,
      )
      return
    }

    addMessage(
      'assistant',
      'Please analyze the current webpage or attach a PDF first.',
    )
  }

  const quickPrompts = [
    'Summarize page',
    'Give me key points',
    'Explain simply',
  ]

  // Loading screen while checking the saved session.
  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="text-center">
          <div className="mb-3 text-3xl text-violet-400">✦</div>
          <p>Checking your session...</p>
        </div>
      </div>
    )
  }

  // Require login before showing the chatbot.
  if (!authToken) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/20 text-xl">
            ✦
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold tracking-tight">
              TabPilot <span className="text-violet-400">AI</span>
            </h1>

            <p className="truncate text-xs text-slate-400">
              {currentUser?.email ?? 'Your AI companion for the web'}
            </p>
          </div>

          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
            {pdf ? 'PDF READY' : page ? 'PAGE READY' : 'DEMO MODE'}
          </span>

          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="rounded-lg border border-white/10 px-2 py-2 text-xs text-slate-300 transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Current webpage */}
      <section className="border-b border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800">
            🌐
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Current webpage
            </p>

            <p className="truncate text-sm font-medium">
              {page?.title ?? 'No page analyzed yet'}
            </p>

            <p className="truncate text-xs text-slate-500">
              {page?.url ?? 'Analyze a page to get started'}
            </p>
          </div>

          <button
            onClick={analyzePage}
            disabled={loadingPage}
            className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold transition hover:bg-violet-500 disabled:opacity-50"
          >
            {loadingPage ? 'Loading…' : page ? 'Refresh' : 'Analyze page'}
          </button>
        </div>
      </section>

      {/* Chat messages */}
      <main
        aria-live="polite"
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-sm text-violet-300">
                ✦
              </div>
            )}

            <div
              className={`max-w-[88%] whitespace-pre-wrap wrap-break-word rounded-2xl px-3 py-3 text-sm leading-6 ${
                message.role === 'user'
                  ? 'rounded-br-md bg-violet-600 text-white'
                  : 'rounded-bl-md border border-white/10 bg-slate-900 text-slate-200'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
      </main>

      {/* Quick prompts */}
      <section className="space-y-2 px-3 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Try asking
        </p>

        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="rounded-full border border-white/10 bg-white/3 px-3 py-2 text-xs text-slate-300 transition hover:border-violet-400/50 hover:bg-violet-500/10"
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {/* PDF attachment preview */}
      {pdf && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
              📄
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-violet-200">
                PDF attached
              </p>

              <p className="truncate text-xs text-slate-400">
                {pdf.name}
              </p>
            </div>

            <button
              onClick={removePdf}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Remove PDF"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Chat input */}
      <footer className="border-t border-white/10 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => {
            selectPdf(event.target.files?.[0])
            event.target.value = ''
          }}
        />

        <form
          onSubmit={(event) => {
            event.preventDefault()
            sendMessage()
          }}
          className="flex items-end gap-2 rounded-2xl border border-white/10 bg-slate-900 p-2 transition focus-within:border-violet-500/60"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl text-slate-400 transition hover:bg-white/10 hover:text-violet-400"
            aria-label="Attach PDF"
            title="Attach PDF"
          >
            +
          </button>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendMessage()
              }
            }}
            placeholder={
              pdf ? 'Ask about your PDF...' : 'Ask about this webpage...'
            }
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-lg transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↑
          </button>
        </form>

        <p className="mt-2 text-center text-[10px] text-slate-500">
          {pdf
            ? 'PDF RAG · Backend integration coming next'
            : 'Authenticated session · AI backend integration coming next'}
        </p>
      </footer>
    </div>
  )
}

export default App
