import { useCallback, useEffect, useRef, useState } from 'react';
import api from './api';
import { useRounds } from './rounds';

const POLL_MS = 2000;
const TICK_SECONDS = 10; // how often the price feed ticks
const ACTIVE = ['QUEUED', 'RUNNING'];

const STATUS_LABELS = {
  QUEUED: 'Starting',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  STOPPED: 'Stopped',
  FAILED: 'Failed',
};

const toDate = (utc) => new Date(/(Z|[+-]\d\d:\d\d)$/i.test(utc) ? utc : utc + 'Z');

const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// Live status, output, and orders for the latest strategy submission
function SubmissionPanel({ submissionId }) {
  const [detail, setDetail] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pulse, setPulse] = useState(0); // bumps on every new tick to replay the blink
  const lastTicks = useRef(null);
  const logRef = useRef(null);
  const stickToBottom = useRef(true);

  const status = detail?.submission.status;
  const active = !detail || ACTIVE.includes(status);

  const refresh = useCallback(
    () => api.get(`/api/strategy/submissions/${submissionId}`).then((res) => setDetail(res.data)).catch(() => {}),
    [submissionId],
  );

  // A new submission opens the panel and starts from a clean slate
  useEffect(() => {
    setDetail(null);
    setCollapsed(false);
    lastTicks.current = null;
    stickToBottom.current = true;
  }, [submissionId]);

  // Poll while the submission is queued or running; stop once it has finished
  useEffect(() => {
    refresh();
    if (!active) return undefined;
    const poll = setInterval(refresh, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh, active]);

  // Blink the status badge whenever the bot answers another tick
  const ticks = detail?.submission.ticksProcessed;
  useEffect(() => {
    if (ticks == null) return;
    if (lastTicks.current !== null && ticks > lastTicks.current) setPulse((p) => p + 1);
    lastTicks.current = ticks;
  }, [ticks]);

  // Follow new output, unless the user has scrolled up to read something
  useEffect(() => {
    const el = logRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [detail?.submission.log, collapsed]);

  const onScroll = () => {
    const el = logRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const stop = async () => {
    setStopping(true);
    try {
      await api.post(`/api/strategy/submissions/${submissionId}/stop`);
    } catch {
      /* it may have finished on its own; the next refresh shows the real state */
    }
    await refresh();
    setStopping(false);
  };

  const { rounds } = useRounds();
  const sub = detail?.submission;
  const round = sub?.roundId ? [rounds?.active, rounds?.upcoming].find((r) => r?.roundId === sub.roundId) : null;
  const orders = detail?.orders ?? [];
  const filled = orders.filter((o) => o.quantityFilled > 0).length;
  const rejected = orders.filter((o) => o.status === 'REJECTED').length;
  const end = sub?.finishedAt ? toDate(sub.finishedAt).getTime() : now;
  const elapsed = sub?.startedAt ? formatElapsed(end - toDate(sub.startedAt).getTime()) : null;
  const statusClass = (status ?? 'QUEUED').toLowerCase();

  const sinceTick = sub?.lastTickAt ? Math.max(0, Math.floor((now - toDate(sub.lastTickAt).getTime()) / 1000)) : null;
  const stalled = status === 'RUNNING' && sinceTick !== null && sinceTick > TICK_SECONDS * 3;

  let hint = null;
  if (status === 'QUEUED' && round?.status === 'UPCOMING')
    hint = `Waiting for round #${round.roundId} to start at ${toDate(round.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Your bot starts automatically.`;
  else if (!sub || status === 'QUEUED') hint = 'Starting the sandbox…';
  else if (status === 'RUNNING' && !sub.ticksProcessed) hint = `Running. Waiting for the first price tick (every ${TICK_SECONDS} s)…`;
  else if (status === 'RUNNING' && !sub.log)
    hint = `on_tick has run for ${sub.ticksProcessed} tick${sub.ticksProcessed === 1 ? '' : 's'} without printing anything or placing orders. Add print() calls to see what your strategy is deciding.`;
  else if (!sub.log) hint = 'No output.';

  return (
    <section className={collapsed ? 'run-panel collapsed' : 'run-panel'} aria-label="Strategy run">
      <header className="run-panel-bar">
        <button
          className="run-panel-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show output' : 'Hide output'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span key={pulse} className={`run-status ${statusClass}${pulse ? ' ticked' : ''}`} role="status">
          <span className="run-status-dot" aria-hidden="true" />
          {status === 'QUEUED' && round?.status === 'UPCOMING' ? 'Waiting' : STATUS_LABELS[status] ?? 'Starting'}
        </span>
        <span className="run-panel-meta">
          #{submissionId}{sub && ` · v${sub.strategyVersion}`}
          {sub && (sub.roundId ? ` · round #${sub.roundId}` : ' · open market')}
          {elapsed && ` · ${elapsed}`}
          {sub?.ticksProcessed > 0 && ` · tick ${sub.ticksProcessed}`}
          {status === 'RUNNING' && sinceTick !== null && (
            <span className={stalled ? 'run-stale' : undefined}>{` (${sinceTick}s ago)`}</span>
          )}
          {sub && ` · ${orders.length} order${orders.length === 1 ? '' : 's'}`}
          {filled > 0 && ` · ${filled} filled`}
          {rejected > 0 && ` · ${rejected} rejected`}
        </span>
        {active && (
          <button className="code-editor-button" onClick={stop} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </header>

      {!collapsed && (
        <div className="run-panel-body">
          {sub?.error && (
            <pre className={status === 'FAILED' ? 'run-error failed' : 'run-error'}>{sub.error}</pre>
          )}
          <pre className="run-log" ref={logRef} onScroll={onScroll}>
            {sub?.log || <span className="run-hint">{hint}</span>}
          </pre>
        </div>
      )}
    </section>
  );
}

export default SubmissionPanel;
