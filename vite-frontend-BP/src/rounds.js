import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import api from './api';

const POLL_MS = 5000;

const RoundsContext = createContext(null);

export const toDate = (utc) => new Date(/(Z|[+-]\d\d:\d\d)$/i.test(utc) ? utc : utc + 'Z');

export const money = (value, digits = 2) =>
  Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// Polls /api/rounds/current and shares it, so the toolbar, editor, and leaderboard agree
export function RoundsProvider({ children }) {
  const [rounds, setRounds] = useState(null);
  const [clockOffset, setClockOffset] = useState(0); // server time minus local time

  const refresh = useCallback(() =>
    api.get('/api/rounds/current')
      .then(({ data }) => {
        setRounds(data);
        setClockOffset(toDate(data.serverTime).getTime() - Date.now());
      })
      .catch(() => {}),
  []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return createElement(RoundsContext.Provider, { value: { rounds, refresh, clockOffset } }, children);
}

export function useRounds() {
  return useContext(RoundsContext);
}

// Re-renders every second while mounted; returns the current server time in ms
export function useServerNow() {
  const { clockOffset } = useRounds();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now + clockOffset;
}

// Rounds you've joined that a bot can still be sent to, soonest first
export function joinableTargets(rounds) {
  return [rounds?.active, rounds?.upcoming].filter((r) => r?.joined);
}
