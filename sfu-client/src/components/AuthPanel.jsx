import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

function AuthPanel() {
  const [signupForm, setSignupForm] = useState({
    username: '',
    password: ''
  })
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: ''
  })
  const [status, setStatus] = useState('')
  const [memberInfo, setMemberInfo] = useState(null)

  useEffect(() => {
    const member = localStorage.getItem('sfu_member')
    if (member) {
      const parsed = safeParse(member)
      if (parsed) {
        setMemberInfo(parsed)
      } else {
        localStorage.removeItem('sfu_member')
        setStatus('Stored session info was invalid. Please login again.')
      }
    }
  }, [])

  async function signup(event) {
    event.preventDefault()
    setStatus('Signing up...')
    try {
      const response = await fetch(`${API_BASE}/api/members/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signupForm)
      })
      if (!response.ok) {
        throw new Error('Signup failed')
      }
      setStatus('Signup complete. Please login.')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function login(event) {
    event.preventDefault()
    setStatus('Logging in...')
    try {
      const response = await fetch(`${API_BASE}/api/members/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(loginForm)
      })
      if (!response.ok) {
        throw new Error('Login failed')
      }
      const data = await response.json()
      localStorage.setItem('sfu_member', JSON.stringify(data))
      setMemberInfo(data)
      setStatus('Logged in (session)')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function logout() {
    setStatus('Logging out...')
    try {
      await fetch(`${API_BASE}/api/members/logout`, {
        method: 'POST',
        credentials: 'include'
      })
    } catch (err) {
      // Ignore logout errors; clear local state regardless.
    } finally {
      localStorage.removeItem('sfu_member')
      setMemberInfo(null)
      setStatus('Logged out')
    }
  }

  return (
    <section className="panel auth-panel">
      <header className="panel__header">
        <h2>Member</h2>
        <p>회원가입/로그인을 통해 토큰을 발급받습니다.</p>
      </header>
      <div className="panel__body">
        <div className="auth-grid">
          <form onSubmit={signup} className="auth-form">
            <h3>Sign up</h3>
            <label>
              Username
              <input
                value={signupForm.username}
                onChange={(event) =>
                  setSignupForm((prev) => ({ ...prev, username: event.target.value }))
                }
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={signupForm.password}
                onChange={(event) =>
                  setSignupForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </label>
            <button type="submit">Create account</button>
          </form>

          <form onSubmit={login} className="auth-form">
            <h3>Login</h3>
            <label>
              Username
              <input
                value={loginForm.username}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                }
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </label>
            <button type="submit">Login</button>
            {memberInfo ? (
              <button type="button" className="secondary" onClick={logout}>
                Logout
              </button>
            ) : null}
          </form>
        </div>
        <div className="status">{status || 'Ready.'}</div>
        {memberInfo ? (
          <div className="token-box">
            <strong>Session User</strong>
            <code>{memberInfo.username} ({memberInfo.role})</code>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function safeParse(value) {
  try {
    return JSON.parse(value)
  } catch (err) {
    return null
  }
}

export default AuthPanel
