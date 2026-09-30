import { useEffect, useState } from 'react';
import './App.css'
import Workspace from './Workspace';
import Login from './Login';
import api from './api';

const SYMBOLS = ["MEOW", "NEKO", "PAWS", "TUNA", "YARN"];

// Candle intervals in seconds
const INTERVALS = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
];

// Resolve the session exactly once per page load (StrictMode runs effects twice in dev,
// and a magic-link token can only be redeemed once).
// Returns { account } when signed in, or { account: null, error? } when not.
const sessionPromise = (() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    return api.get('/api/auth/me')
      .then((res) => ({ account: res.data }))
      .catch(() => ({ account: null }));
  }

  // Remove the token from the address bar so it isn't left in history or shared by accident
  params.delete('token');
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));

  return api.post('/api/auth/verify', { token })
    .then((res) => ({ account: res.data }))
    .catch((err) => ({
      account: null,
      error: typeof err.response?.data === 'string' ? err.response.data : 'Sign-in failed. Please request a new link.',
    }));
})();

function App() {
  const [session, setSession] = useState(null); // null while loading

  useEffect(() => {
    sessionPromise.then(setSession);
  }, []);

  const handleSignOut = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setSession({ account: null });
  };

  if (!session) return null;

  if (!session.account) {
    return (
      <div className="auth-page">
        <Login initialError={session.error} />
      </div>
    );
  }

  return <Dashboard account={session.account} onSignOut={handleSignOut} />;
}

function Dashboard({ account, onSignOut }) {
  const [selectedSymbol, setSelectedSymbol] = useState("MEOW");
  const [intervalSeconds, setIntervalSeconds] = useState(60);

  return (
    <div className="tv-panel">
      <div className="tv-toolbar">
        <div className="tv-group">
          {SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              className={symbol === selectedSymbol ? 'tv-button active' : 'tv-button'}
              onClick={() => setSelectedSymbol(symbol)}
            >
              {symbol}
            </button>
          ))}
        </div>
        <div className="tv-divider" />
        <div className="tv-group">
          {INTERVALS.map(({ label, seconds }) => (
            <button
              key={label}
              className={seconds === intervalSeconds ? 'tv-button active' : 'tv-button'}
              onClick={() => setIntervalSeconds(seconds)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="tv-account">
          <span title={account.email}>{account.ownerName}</span>
          <button className="tv-button" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <Workspace symbol={selectedSymbol} intervalSeconds={intervalSeconds} accountId={account.accountId} />
    </div>
  );
}

export default App
