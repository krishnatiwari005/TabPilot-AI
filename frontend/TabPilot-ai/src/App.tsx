
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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

interface ChatResponse {
  answer?: string
  detail?: string
}

interface AnalyzeResponse {
  data?: PageContent
  error?: string
}

function App() {
  // Authentication
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)

  // Webpage and PDF
  const [page, setPage] = useState<PageContent | null>(null)
  const [loadingPage, setLoadingPage] = useState(false)
  const [usePageContext, setUsePageContext] = useState(true)
  const [pdf, setPdf] = useState<File | null>(null)

  // Chat
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])

  const messageIdRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addMessage = useCallback(
    (role: Message['role'], content: string) => {
      const id = ++messageIdRef.current

      setMessages((previous) => [
        ...previous,
        { id, role, content },
      ])
    },
    [],
  )

  // Automatically scroll to the newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, sending])

  // Restore and validate the saved extension session.
  useEffect(() => {
    let cancelled = false

    async function checkAuth() {
      try {
        const stored = await chrome.storage.session.get('access_token')
        const token = stored.access_token as string | undefined

        if (!token) return

        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          await chrome.storage.session.remove('access_token')
          return
        }

        const user = (await response.json()) as AuthUser

        if (!cancelled) {
          setAuthToken(token)
          setCurrentUser(user)
        }
      } catch (error) {
        console.error('Session verification failed:', error)
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

  // Called after successful login or registration.
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

      setCurrentUser(user)
      setAuthToken(token)
      setPage(null)
      setPdf(null)
      setInput('')
      setMessages([])
      messageIdRef.current = 0
    } catch (error) {
      console.error('Unable to verify login:', error)
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
    setMessages([])
    messageIdRef.current = 0
  }

  // Manual refresh for the current webpage.
  const analyzePage = useCallback(async () => {
    setLoadingPage(true)

    try {
      const response = await new Promise<AnalyzeResponse>(
        (resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: 'ANALYZE_PAGE' },
            (result: AnalyzeResponse) => {
              if (chrome.runtime.lastError) {
                reject(
                  new Error(chrome.runtime.lastError.message),
                )
                return
              }

              resolve(result)
            },
          )
        },
      )

      if (response.error) {
        setPage(null)
        console.warn('Page analysis failed:', response.error)
        return
      }

      if (response.data) {
        setPage(response.data)
      }
    } catch (error) {
      setPage(null)
      console.error('Page analysis failed:', error)
    } finally {
      setLoadingPage(false)
    }
  }, [])

  // Automatically analyze the current tab after authentication.
  // All state updates happen after the asynchronous response.
  useEffect(() => {
    if (!authToken) return

    let cancelled = false

    async function loadCurrentPage() {
      try {
        const response = await new Promise<AnalyzeResponse>(
          (resolve, reject) => {
            chrome.runtime.sendMessage(
              { type: 'ANALYZE_PAGE' },
              (result: AnalyzeResponse) => {
                if (chrome.runtime.lastError) {
                  reject(
                    new Error(chrome.runtime.lastError.message),
                  )
                  return
                }

                resolve(result)
              },
            )
          },
        )

        if (cancelled) return

        if (response.error) {
          console.warn(
            'Automatic page analysis failed:',
            response.error,
          )
          return
        }

        if (response.data) {
          setPage(response.data)
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            'Automatic page analysis failed:',
            error,
          )
        }
      }
    }

    void loadCurrentPage()

    return () => {
      cancelled = true
    }
  }, [authToken])

  // PDF selection UI. Upload and RAG processing are not connected yet.
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
  }

  // Send a question to the authenticated FastAPI endpoint.
  async function sendMessage(text = input) {
    const question = text.trim()

    if (!question || !authToken || sending) return

    const userMessageId = ++messageIdRef.current

    setMessages((previous) => [
      ...previous,
      {
        id: userMessageId,
        role: 'user',
        content: question,
      },
    ])

    setInput('')

    if (pdf) {
      addMessage(
        'assistant',
        'PDF question answering is not connected yet. PDF upload and RAG will be implemented next.',
      )
      return
    }

    setSending(true)

    try {
      const includeContext = usePageContext && page !== null

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          question,
          page_title: includeContext ? page.title : null,
          page_url: includeContext ? page.url : null,
          page_content: includeContext
            ? page.text.slice(0, 12000)
            : null,
        }),
      })

      const data = (await response.json()) as ChatResponse

      if (response.status === 401) {
        await chrome.storage.session.remove('access_token')
        setAuthToken(null)
        setCurrentUser(null)
        return
      }

      if (!response.ok) {
        throw new Error(data.detail ?? 'The AI request failed.')
      }

      addMessage(
        'assistant',
        data.answer ?? 'The AI provider returned an empty response.',
      )
    } catch (error) {
      addMessage(
        'assistant',
        error instanceof Error
          ? `Unable to get a response: ${error.message}`
          : 'Unable to connect to the AI backend.',
      )
    } finally {
      setSending(false)
    }
  }

  const quickPrompts = [
    'Summarize page',
    'Give me key points',
    'Explain simply',
  ]

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
        Checking your session...
      </div>
    )
  }

  if (!authToken) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />
  }

  const displayName =
    currentUser?.full_name?.trim() ||
    currentUser?.email?.split('@')[0] ||
    'My workspace'

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-xl">
            ✦
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold tracking-tight">
              TabPilot <span className="text-violet-400">AI</span>
            </h1>
            <p className="truncate text-xs text-slate-400">
              {displayName}
            </p>
          </div>

          <span
            className={`rounded-full border px-2 py-1 text-[10px] ${
              page
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-slate-400'
            }`}
          >
            {loadingPage
              ? 'READING PAGE'
              : page
                ? 'PAGE READY'
                : 'CHAT'}
          </span>

          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Current webpage */}
      <section className="shrink-0 border-b border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800">
            🌐
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Current webpage
            </p>

            <p className="truncate text-sm font-semibold">
              {loadingPage
                ? 'Reading current tab...'
                : page?.title ?? 'No webpage available'}
            </p>

            <p className="truncate text-xs text-slate-500">
              {page?.url ??
                (loadingPage
                  ? 'Extracting page content'
                  : 'Open a regular website to use page context')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void analyzePage()}
            disabled={loadingPage}
            title="Refresh webpage context"
            aria-label="Refresh webpage context"
            className="rounded-lg px-2 py-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            ↻
          </button>
        </div>
      </section>

      {/* Chat messages */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {messages.length === 0 && !sending && (
          <div className="flex min-h-full items-center justify-center">
            <p className="max-w-xs text-center text-sm leading-6 text-slate-500">
              Ask a question whenever you're ready.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${
                message.role === 'user'
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-sm text-violet-300">
                  ✦
                </div>
              )}

              <div
                className={`max-w-[92%] min-w-0 break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === 'user'
                    ? 'rounded-br-md bg-violet-600 text-white'
                    : 'rounded-bl-md border border-white/10 bg-slate-900 text-slate-200'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="markdown-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => (
                          <h1 className="mb-3 mt-2 text-xl font-bold text-white">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="mb-2 mt-4 text-lg font-bold text-white">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mb-2 mt-3 text-base font-semibold text-white">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => (
                          <p className="mb-3 last:mb-0">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
                            {children}
                          </ol>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-white">
                            {children}
                          </strong>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="my-3 border-l-2 border-violet-400 pl-3 text-slate-300">
                            {children}
                          </blockquote>
                        ),
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                          >
                            {children}
                          </a>
                        ),
                        pre: ({ children }) => (
                          <pre className="my-3 overflow-x-auto rounded-lg border border-white/10 bg-slate-950 p-3 text-xs">
                            {children}
                          </pre>
                        ),
                        code: ({ children, className }) =>
                          className ? (
                            <code className={className}>
                              {children}
                            </code>
                          ) : (
                            <code className="rounded bg-black/20 px-1 py-0.5 text-violet-200">
                              {children}
                            </code>
                          ),
                        table: ({ children }) => (
                          <div className="my-3 overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-white/10 bg-white/5 px-3 py-2 font-semibold">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-white/10 px-3 py-2">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">
                    {message.content}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
                ✦
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-400">
                Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Quick prompts */}
      <section className="shrink-0 space-y-2 px-3 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Try asking
        </p>

        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendMessage(prompt)}
              disabled={sending}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition hover:border-violet-400/50 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {/* PDF preview */}
      {pdf && (
        <section className="shrink-0 px-3 pb-2">
          <div className="flex items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3">
            <span>📄</span>
            <p className="min-w-0 flex-1 truncate text-xs text-violet-200">
              {pdf.name}
            </p>
            <button
              type="button"
              onClick={() => setPdf(null)}
              aria-label="Remove PDF"
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        </section>
      )}

      {/* Message composer */}
      <footer className="shrink-0 border-t border-white/10 p-3">
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
            void sendMessage()
          }}
          className="rounded-2xl border border-white/10 bg-slate-900 p-2 focus-within:border-violet-500/60"
        >
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach PDF"
              aria-label="Attach PDF"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl text-slate-400 transition hover:bg-white/10 hover:text-violet-400"
            >
              +
            </button>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder={
                pdf ? 'Ask about your PDF...' : 'Ask TabPilot AI...'
              }
              rows={1}
              className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500"
            />

            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-lg transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? '…' : '↑'}
            </button>
          </div>

          {/* Optional webpage context */}
          <div className="mt-2 flex items-center justify-between border-t border-white/5 px-2 pt-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={usePageContext}
                onChange={(event) =>
                  setUsePageContext(event.target.checked)
                }
                className="h-3.5 w-3.5 accent-violet-500"
              />
              Use page context
            </label>

            <span className="text-[10px] text-slate-500">
              {usePageContext && page
                ? 'Page included'
                : usePageContext
                  ? 'No page loaded'
                  : 'General chat'}
            </span>
          </div>
        </form>
      </footer>
    </div>
  )
}

export default App
