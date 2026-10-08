import { useCallback, useEffect, useState } from 'react';
import api from './api';
import { formatCountdown, money, toDate, useRounds, useServerNow } from './rounds';

const POLL_MS = 5000;

const errorMessage = (err) =>
  typeof err.response?.data === 'string' ? err.response.data : 'Something went wrong. Please try again.';

const BOT_LABELS = { QUEUED: 'waiting', RUNNING: 'running', COMPLETED: 'finished', STOPPED: 'stopped', FAILED: 'failed' };

// Countdown and Join button for one round
function RoundHeader({ round, label, onJoined }) {
  const now = useServerNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/rounds/${round.roundId}/join`);
      await onJoined();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const active = round.status === 'ACTIVE';
  const target = toDate(active ? round.endsAt : round.startsAt).getTime();
  const timing = active ? `${formatCountdown(target - now)} left` : `starts in ${formatCountdown(target - now)}`;

  return (
    <div className="round-header">
      <span className={active ? 'round-badge active' : 'round-badge'}>{label}</span>
      <span className="round-title">Round #{round.roundId}</span>
      <span className="round-meta">
        {timing} · {round.players} player{round.players === 1 ? '' : 's'} · {money(round.startingCash, 0)} each
      </span>
      {round.joined ? (
        <span className="round-joined">✓ Joined</span>
      ) : (
        <button className="code-editor-button primary" onClick={join} disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      )}
      {error && <span className="round-error">{error}</span>}
    </div>
  );
}

function Leaderboard({ roundId, title }) {
  const [view, setView] = useState(null);

  const refresh = useCallback(
    () => api.get(`/api/rounds/${roundId}`).then((res) => setView(res.data)).catch(() => {}),
    [roundId],
  );

  useEffect(() => {
    setView(null);
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!view) return <div className="round-empty">Loading standings…</div>;

  const rows = view.leaderboard;
  const you = view.you;
  const finished = view.round.status === 'FINISHED';

  return (
    <div className="leaderboard">
      <div className="leaderboard-title">{title}</div>
      {rows.length === 0 ? (
        <div className="round-empty">No players yet. Join to be first on the board.</div>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Player</th>
              <th>Bot</th>
              <th className="num">Trades</th>
              <th className="num">{finished ? 'Final equity' : 'Equity'}</th>
              <th className="num">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.rank}-${r.player}-${r.joinedAt}`} className={r.isYou ? 'you' : undefined}>
                <td className="num rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
                <td>{r.player}{r.isYou && <span className="you-tag">you</span>}</td>
                <td className={`bot ${(r.botStatus ?? '').toLowerCase()}`}>
                  {r.botStatus ? `v${r.botVersion} ${BOT_LABELS[r.botStatus] ?? r.botStatus.toLowerCase()}` : '—'}
                </td>
                <td className="num">{r.trades}</td>
                <td className="num">{money(r.equity)}</td>
                <td className={`num ${r.returnPct > 0 ? 'up' : r.returnPct < 0 ? 'down' : ''}`}>
                  {r.returnPct > 0 ? '+' : ''}{Number(r.returnPct).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {you && !finished && (
        <div className="round-you">
          Your round account: {money(you.availableCash)} cash
          {you.positions.length > 0 && ` · ${you.positions.map((p) => `${Number(p.quantity)} ${p.symbol}`).join(', ')}`}
        </div>
      )}
    </div>
  );
}

// Competition rounds: current and next round, with the live leaderboard
function CompetitionPanel() {
  const { rounds, refresh } = useRounds();
  const [showLast, setShowLast] = useState(false);

  if (!rounds) return null;
  const { active, upcoming, lastFinished } = rounds;
  const featured = active ?? upcoming;

  return (
    <section className="competition" aria-label="Competition">
      <div className="competition-bar">
        <span className="competition-title">Competition</span>
        {lastFinished && (
          <div className="tv-group">
            <button className={showLast ? 'tv-button' : 'tv-button active'} onClick={() => setShowLast(false)}>Current</button>
            <button className={showLast ? 'tv-button active' : 'tv-button'} onClick={() => setShowLast(true)}>
              Last round
            </button>
          </div>
        )}
      </div>

      {showLast && lastFinished ? (
        <Leaderboard roundId={lastFinished.roundId} title={`Round #${lastFinished.roundId} final results`} />
      ) : (
        <>
          {active && <RoundHeader round={active} label="Live" onJoined={refresh} />}
          {upcoming && <RoundHeader round={upcoming} label="Next" onJoined={refresh} />}
          {featured ? (
            <Leaderboard key={featured.roundId} roundId={featured.roundId} title={`Round #${featured.roundId} leaderboard`} />
          ) : (
            <div className="round-empty">No rounds scheduled.</div>
          )}
          <p className="competition-help">
            Everyone in a round starts with the same cash in a separate round account and trades only with other
            players in that round. Join, then pick the round under <b>Run in</b> next to Submit to send your bot.
            Rounds rank by equity: cash plus shares at the latest price.
          </p>
        </>
      )}
    </section>
  );
}

export default CompetitionPanel;
