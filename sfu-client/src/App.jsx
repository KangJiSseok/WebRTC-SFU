import { Link, NavLink, Route, Routes } from 'react-router-dom'
import Broadcaster from './components/Broadcaster'
import Viewer from './components/Viewer'
import AuthPanel from './components/AuthPanel'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="eyebrow">WebRTC SFU Client</p>
          <h1>Mediasoup Streaming Console</h1>
          <p className="subtitle">
            브로드캐스터와 뷰어 URL을 분리해서 테스트하세요.
          </p>
        </div>
        <div className="mode-switch">
          <NavLink to="/broadcaster">Broadcaster</NavLink>
          <NavLink to="/viewer">Viewer</NavLink>
        </div>
      </header>
      <AuthPanel />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/broadcaster" element={<Broadcaster />} />
          <Route path="/viewer" element={<Viewer />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="app__footer">
        <p>
          Signaling server 기본값: <code>ws://localhost:3001</code> (환경변수{' '}
          <code>VITE_WS_URL</code>로 변경 가능)
        </p>
      </footer>
    </div>
  )
}

function Home() {
  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Choose a Mode</h2>
        <p>브로드캐스터 또는 뷰어로 이동하세요.</p>
      </header>
      <div className="panel__body">
        <div className="button-row">
          <Link to="/broadcaster">Go to Broadcaster</Link>
          <Link to="/viewer">Go to Viewer</Link>
        </div>
      </div>
    </section>
  )
}

function NotFound() {
  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Not Found</h2>
        <p>요청한 페이지를 찾을 수 없습니다.</p>
      </header>
      <div className="panel__body">
        <Link to="/">Back to Home</Link>
      </div>
    </section>
  )
}

export default App
