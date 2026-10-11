import { useState, type FormEvent } from 'react'

const API_URL = 'http://127.0.0.1:8000'

interface AuthScreenProps {
  onAuthenticated: (token: string) => void
}

export default function AuthScreen({
  onAuthenticated,
}: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'register') {
        const registerResponse = await fetch(
          `${API_URL}/api/auth/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              password,
              full_name: fullName.trim() || null,
            }),
          },
        )

        if (!registerResponse.ok) {
          const data = await registerResponse.json()
          throw new Error(
            data.detail ?? 'Registration failed.',
          )
        }
      }

      const response = await fetch(
        `${API_URL}/api/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail ?? 'Unable to log in.',
        )
      }

      if (!data.access_token) {
        throw new Error('The server did not return a token.')
      }

      await chrome.storage.session.set({
        access_token: data.access_token,
      })

      onAuthenticated(data.access_token)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to the backend.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6">

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-3xl">
            ✦
          </div>

          <h1 className="text-2xl font-bold">
            TabPilot <span className="text-violet-400">AI</span>
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Your AI companion for the web
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError('')
            }}
            className={`rounded-lg py-2 text-sm font-medium ${
              mode === 'login'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400'
            }`}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register')
              setError('')
            }}
            className={`rounded-lg py-2 text-sm font-medium ${
              mode === 'register'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-sm text-slate-300">
                Full name
              </label>

              <input
                value={fullName}
                onChange={(event) =>
                  setFullName(event.target.value)
                }
                placeholder="Your name"
                maxLength={100}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-violet-500"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-slate-300">
              Email address
            </label>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-300">
              Password
            </label>

            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              maxLength={128}
              autoComplete={
                mode === 'register'
                  ? 'new-password'
                  : 'current-password'
              }
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Enter your password"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-violet-500"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 py-3 font-semibold transition hover:bg-violet-500 disabled:opacity-50"
          >
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Login to TabPilot AI'
                : 'Create account'}
          </button>

        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          Your account is managed by the TabPilot AI backend.
        </p>
      </div>
    </div>
  )
}