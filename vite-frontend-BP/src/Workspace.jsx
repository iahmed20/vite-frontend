import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import PriceChart from './PriceChart';

// Monaco is large, so load it separately and let the chart render first
const CodeEditor = lazy(() => import('./CodeEditor'));

const DEFAULT_HEIGHT = 560;
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 2000;
const HEIGHT_KEY = 'workspace-height';

// Remembered layout is a per-viewer convenience; storage may be unavailable, so never throw
const safeStorage = {
  getItem(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key, value) {
    try { localStorage.setItem(key, value); } catch { /* not persisted */ }
  },
};

const clampHeight = (h) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h)));

function useIsNarrow(query = '(max-width: 760px)') {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}

function Workspace({ symbol, intervalSeconds, accountId }) {
  // Side by side on wide screens, stacked on phones
  const orientation = useIsNarrow() ? 'vertical' : 'horizontal';
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `workspace-${orientation}`,
    storage: safeStorage,
  });

  const [height, setHeight] = useState(
    () => clampHeight(Number(safeStorage.getItem(HEIGHT_KEY)) || DEFAULT_HEIGHT)
  );
  const dragRef = useRef(null);

  const commitHeight = (h) => {
    setHeight(h);
    safeStorage.setItem(HEIGHT_KEY, String(h));
  };

  // Bottom handle: drag to change the height of both panes together
  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, startHeight: height };
  };
  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    setHeight(clampHeight(dragRef.current.startHeight + event.clientY - dragRef.current.startY));
  };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    commitHeight(height);
  };
  const onKeyDown = (event) => {
    const step = event.shiftKey ? 100 : 20;
    if (event.key === 'ArrowDown') commitHeight(clampHeight(height + step));
    else if (event.key === 'ArrowUp') commitHeight(clampHeight(height - step));
    else return;
    event.preventDefault();
  };

  return (
    <>
      <div className="workspace" style={{ height }}>
        <Group
          key={orientation}
          orientation={orientation}
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="chart" defaultSize="60" minSize={240}>
            <PriceChart symbol={symbol} intervalSeconds={intervalSeconds} />
          </Panel>
          <Separator className={`workspace-separator ${orientation}`} />
          <Panel id="editor" defaultSize="40" minSize={200}>
            <Suspense fallback={<div className="code-editor-loading">Loading editor…</div>}>
              <CodeEditor accountId={accountId} />
            </Suspense>
          </Panel>
        </Group>
      </div>
      <div
        className="workspace-height-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize workspace height"
        aria-valuenow={height}
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={MAX_HEIGHT}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </>
  );
}

export default Workspace;
