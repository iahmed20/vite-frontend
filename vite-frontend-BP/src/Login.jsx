import { useState } from 'react';
import api from './api';

// One form for both sign-up and sign-in: a new email creates an account with this name,
// an existing email just signs in (the name is ignored)
function Login({ initialError }) {
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'sent'
  const [error, setError] = useState(initialError ?? '');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('sending');
    try {
      await api.post('/api/auth/request-link', { email, ownerName });
      setStatus('sent');
    } catch (err) {
      setError(typeof err.response?.data === 'string' ? err.response.data : 'Something went wrong. Please try again.');
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <div className="auth-card">
        <h1>Check your email</h1>
        <p className="auth-muted">
          We sent a sign-in link to <b>{email.trim()}</b>. It expires in 15 minutes.
        </p>
        <button className="auth-link" onClick={() => setStatus('idle')}>Use a different email</button>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <h1>Log in</h1>

      <label>
        Name
        <input
          type="text"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          autoComplete="name"
          required
          autoFocus
        />
      </label>

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>

      {error && <p className="auth-error" role="alert">{error}</p>}

      <button className="auth-submit" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send login link'}
      </button>
    </form>
  );
}

export default Login;
