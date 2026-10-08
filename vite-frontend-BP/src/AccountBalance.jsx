import { useCallback, useEffect, useRef, useState } from 'react';
import api from './api';

const POLL_MS = 5000; // bots trade on every 10s tick, so keep the balance fresh
const QUICK_AMOUNTS = [1000, 10000, 100000];
const MAX_DEPOSIT = 1_000_000; // matches the API's per-deposit limit

const money = (value) =>
  Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const errorMessage = (err) =>
  typeof err.response?.data === 'string' ? err.response.data : 'Something went wrong. Please try again.';

// Cash balance in the toolbar, with a dropdown for depositing more
function AccountBalance({ accountId }) {
  const [account, setAccount] = useState(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', error: false });
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const refresh = useCallback(
    () => api.get(`/api/accounts/${accountId}`).then((res) => setAccount(res.data)).catch(() => {}),
    [accountId],
  );

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const deposit = async (value) => {
    const parsed = Number(value);
    if (!(parsed > 0)) {
      setMessage({ text: 'Enter an amount greater than zero.', error: true });
      return;
    }
    if (parsed > MAX_DEPOSIT) {
      setMessage({ text: `Deposits are limited to ${money(MAX_DEPOSIT)} at a time.`, error: true });
      return;
    }

    setBusy(true);
    setMessage({ text: '', error: false });
    try {
      const { data } = await api.post(`/api/accounts/${accountId}/deposit`, { amount: parsed });
      setMessage({ text: `Deposited ${money(data.depositedAmount)}.`, error: false });
      setAmount('');
      await refresh();
    } catch (err) {
      setMessage({ text: errorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  const reserved = account ? account.cashBalance - account.availableCash : 0;
  const positions = account?.positions ?? [];

  return (
    <div className="balance" ref={rootRef}>
      <span
        className="balance-cash"
        title={account ? `Cash ${money(account.cashBalance)}, ${money(reserved)} reserved by open orders` : ''}
      >
        {account ? money(account.availableCash) : '—'}
      </span>
      <button
        className={open ? 'tv-button active' : 'tv-button'}
        onClick={() => { setOpen((o) => !o); setMessage({ text: '', error: false }); }}
        aria-expanded={open}
      >
        Deposit
      </button>

      {open && (
        <div className="balance-popover" role="dialog" aria-label="Deposit cash">
          <form onSubmit={(e) => { e.preventDefault(); deposit(amount); }}>
            <label className="balance-label" htmlFor="deposit-amount">Amount</label>
            <div className="balance-row">
              <input
                id="deposit-amount"
                ref={inputRef}
                className="balance-input"
                type="number"
                min="0.01"
                max={MAX_DEPOSIT}
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
              <button className="code-editor-button primary" type="submit" disabled={busy || amount === ''}>
                {busy ? 'Depositing…' : 'Deposit'}
              </button>
            </div>
            <div className="balance-row">
              {QUICK_AMOUNTS.map((value) => (
                <button key={value} type="button" className="balance-chip" disabled={busy} onClick={() => deposit(value)}>
                  +{money(value).replace('.00', '')}
                </button>
              ))}
            </div>
          </form>

          {message.text && (
            <div className={message.error ? 'balance-message error' : 'balance-message'} role="status">
              {message.text}
            </div>
          )}

          {account && (
            <dl className="balance-summary">
              <dt>Cash</dt><dd>{money(account.cashBalance)}</dd>
              <dt>Available</dt><dd>{money(account.availableCash)}</dd>
              {positions.map((p) => (
                <div key={p.symbol} className="balance-position">
                  <dt>{p.symbol}</dt><dd>{Number(p.quantity).toLocaleString()} shares</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

export default AccountBalance;
