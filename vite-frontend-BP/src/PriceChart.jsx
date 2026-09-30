import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, CrosshairMode } from 'lightweight-charts';
import api from './api';

const TICK_LIMIT = 2000; // ticks arrive every 10s, so ~5.5 hours of history
const POLL_MS = 5000;
const VISIBLE_BARS = 100;

const UP = '#26a69a';
const DOWN = '#ef5350';

// Group raw price ticks into OHLC candles of `bucketSeconds`
function toCandles(ticks, bucketSeconds) {
  const candles = [];
  for (const tick of ticks) {
    const seconds = Math.floor(new Date(tick.timestamp + "Z").getTime() / 1000);
    const time = seconds - (seconds % bucketSeconds);
    const last = candles[candles.length - 1];

    if (last && last.time === time) {
      last.high = Math.max(last.high, tick.price);
      last.low = Math.min(last.low, tick.price);
      last.close = tick.price;
    } else {
      candles.push({ time, open: tick.price, high: tick.price, low: tick.price, close: tick.price });
    }
  }
  return candles;
}

const formatTime = (seconds, options) =>
  new Date(seconds * 1000).toLocaleString([], options);

function PriceChart({ symbol, intervalSeconds }) {
  const containerRef = useRef(null);
  const seriesRef = useRef(null);
  const chartRef = useRef(null);
  const [legend, setLegend] = useState(null);
  const latestRef = useRef(null);
  const hoveringRef = useRef(false);

  // Create the chart once
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        // Timestamps are UTC; show them in the viewer's local time
        tickMarkFormatter: (time) => formatTime(time, { hour: '2-digit', minute: '2-digit' }),
      },
      localization: {
        timeFormatter: (time) =>
          formatTime(time, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    // OHLC legend follows the crosshair, falling back to the latest candle
    chart.subscribeCrosshairMove((param) => {
      const candle = param.time ? param.seriesData.get(series) : null;
      hoveringRef.current = Boolean(candle);
      setLegend(candle ?? latestRef.current);
    });

    chartRef.current = chart;
    seriesRef.current = series;
    return () => chart.remove();
  }, []);

  // Load history on symbol/interval change, then poll for new ticks
  useEffect(() => {
    let cancelled = false;
    let firstLoad = true;
    latestRef.current = null;
    setLegend(null);

    const fetchPrices = () => {
      api.get(`/api/Securities/${symbol}/prices`, { params: { limit: TICK_LIMIT } })
        .then((response) => {
          if (cancelled) return;
          const candles = toCandles(response.data, intervalSeconds);
          if (candles.length === 0) return;

          const series = seriesRef.current;
          if (firstLoad) {
            series.setData(candles);
            // Open on the most recent bars; older history is a scroll away
            chartRef.current.timeScale().setVisibleLogicalRange({
              from: Math.max(0, candles.length - VISIBLE_BARS),
              to: candles.length + 5,
            });
            firstLoad = false;
          } else {
            // update() keeps the user's zoom/scroll position, unlike setData()
            const lastShown = series.data().at(-1)?.time ?? 0;
            candles.filter((c) => c.time >= lastShown).forEach((c) => series.update(c));
          }

          latestRef.current = candles[candles.length - 1];
          if (!hoveringRef.current) setLegend(latestRef.current);
        })
        .catch((error) => console.error("Data fetching error:", error));
    };

    fetchPrices();
    const timer = setInterval(fetchPrices, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, intervalSeconds]);

  const change = legend ? legend.close - legend.open : 0;
  const changePct = legend && legend.open ? (change / legend.open) * 100 : 0;
  const color = change >= 0 ? UP : DOWN;

  return (
    <div className="tv-chart">
      <div className="tv-legend">
        <span className="tv-legend-symbol">{symbol}</span>
        {legend && (
          <>
            <span>O <b style={{ color }}>{legend.open.toFixed(2)}</b></span>
            <span>H <b style={{ color }}>{legend.high.toFixed(2)}</b></span>
            <span>L <b style={{ color }}>{legend.low.toFixed(2)}</b></span>
            <span>C <b style={{ color }}>{legend.close.toFixed(2)}</b></span>
            <b style={{ color }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} ({change >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
            </b>
          </>
        )}
      </div>
      <div ref={containerRef} className="tv-chart-canvas" />
    </div>
  );
}

export default PriceChart;
