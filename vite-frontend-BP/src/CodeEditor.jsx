import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import Editor, { loader } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import api from './api';
import SubmissionPanel from './SubmissionPanel';
import { joinableTargets, useRounds } from './rounds';

// Use the bundled monaco-editor package instead of @monaco-editor/react's default CDN download
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

const STARTER_CODE = `# strategy.py
# Write your trading strategy here.

def on_tick(symbol: str, price: float) -> None:
    pass
`;

// Unsaved edits are kept in the browser so a reload doesn't lose them.
// localStorage can be unavailable (private windows, blocked storage), so never let it throw.
const draftKey = (accountId) => `strategy-draft-${accountId}`;
function readDraft(accountId) {
  try { return localStorage.getItem(draftKey(accountId)); } catch { return null; }
}
function writeDraft(accountId, code) {
  try { localStorage.setItem(draftKey(accountId), code); } catch { /* not persisted */ }
}
function clearDraft(accountId) {
  try { localStorage.removeItem(draftKey(accountId)); } catch { /* ignore */ }
}

// vs-dark, recolored to match the chart's blue-black panels
function defineTheme(monacoInstance) {
  monacoInstance.editor.defineTheme('brokerage-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#131722',
      'editor.lineHighlightBackground': '#1e222d',
      'editorLineNumber.foreground': '#4c525e',
      'editorLineNumber.activeForeground': '#b2b5be',
      'editorGutter.background': '#131722',
    },
  });
}

const errorMessage = (err) =>
  typeof err.response?.data === 'string' ? err.response.data : 'Request failed. Please try again.';

// Backend timestamps are UTC; older API versions sent them without a zone suffix
const formatTime = (utc) =>
  new Date(/(Z|[+-]\d\d:\d\d)$/i.test(utc) ? utc : utc + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function CodeEditor({ accountId }) {
  const [initialCode, setInitialCode] = useState(null); // null until the saved strategy is fetched
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState({ busy: null, message: '', error: false });
  const [submissionId, setSubmissionId] = useState(null); // latest submission, shown in the run panel
  const [target, setTarget] = useState(null); // round id to submit to; null for the open market
  const targetTouched = useRef(false);
  const { rounds } = useRounds();
  const targets = joinableTargets(rounds);

  // Default to the round you joined; fall back to the open market when that round is over
  useEffect(() => {
    const ids = targets.map((r) => r.roundId);
    if (target !== null && !ids.includes(target)) setTarget(null);
    else if (target === null && !targetTouched.current && ids.length > 0) setTarget(ids[0]);
  }, [targets.map((r) => r.roundId).join(','), target]); // eslint-disable-line react-hooks/exhaustive-deps
  const codeRef = useRef('');
  const savedCodeRef = useRef('');
  const saveRef = useRef(null);

  // Load the saved strategy, preferring an unsaved local draft if there is one
  useEffect(() => {
    let cancelled = false;
    api.get('/api/strategy')
      .then(({ data }) => data)
      .catch(() => ({}))
      .then((data) => {
        if (cancelled) return;
        const draft = readDraft(accountId);
        const code = draft ?? data.code ?? STARTER_CODE;

        savedCodeRef.current = data.code ?? '';
        codeRef.current = code;
        setDirty(code !== savedCodeRef.current);
        setInitialCode(code);
        if (data.lastSubmission) setSubmissionId(data.lastSubmission.strategySubmissionId);
      });
    return () => { cancelled = true; };
  }, [accountId]);

  const markSaved = (code) => {
    savedCodeRef.current = code;
    clearDraft(accountId);
    setDirty(codeRef.current !== code);
  };

  const run = async (busy, request, describe) => {
    const code = codeRef.current;
    setStatus({ busy, message: '', error: false });
    try {
      const { data } = await request(code);
      markSaved(code);
      setStatus({ busy: null, message: describe(data), error: false });
    } catch (err) {
      setStatus({ busy: null, message: errorMessage(err), error: true });
    }
  };

  const save = () => run('save',
    (code) => api.put('/api/strategy', { code }),
    (data) => data.created
      ? `Saved v${data.version} · ${formatTime(data.updatedAt)}`
      : `No changes · v${data.version} is current`);

  const submit = () => run('submit',
    (code) => api.post('/api/strategy/submit', { code, roundId: target }),
    (data) => {
      setSubmissionId(data.strategySubmissionId);
      const where = data.roundId ? ` to round #${data.roundId}` : '';
      return `Submitted v${data.strategyVersion}${where} · ${formatTime(data.submittedAt)}`;
    });

  // Monaco keybindings are registered once, so route them through a ref to the latest handler
  saveRef.current = status.busy ? null : save;

  const handleMount = (editor, monacoInstance) => {
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => saveRef.current?.());
  };

  const handleChange = (value = '') => {
    codeRef.current = value;
    const isDirty = value !== savedCodeRef.current;
    setDirty(isDirty);
    if (isDirty) writeDraft(accountId, value);
    else clearDraft(accountId);
  };

  const disabled = initialCode === null || status.busy !== null;

  return (
    <div className="code-editor">
      <div className="code-editor-bar">
        <span className="code-editor-tab">
          strategy.py
          {dirty && <span className="code-editor-dirty" title="Unsaved changes" aria-label="Unsaved changes">●</span>}
        </span>
        <span className={status.error ? 'code-editor-status error' : 'code-editor-status'} role="status">
          {status.message}
        </span>
        <button className="code-editor-button" onClick={save} disabled={disabled} title="Save (⌘S / Ctrl+S)">
          {status.busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        <label className="run-target">
          <span>Run in</span>
          <select
            value={target ?? ''}
            onChange={(e) => { targetTouched.current = true; setTarget(e.target.value ? Number(e.target.value) : null); }}
            disabled={disabled}
          >
            <option value="">Open market</option>
            {targets.map((r) => (
              <option key={r.roundId} value={r.roundId}>
                Round #{r.roundId}{r.status === 'ACTIVE' ? ' (live)' : ' (next)'}
              </option>
            ))}
          </select>
        </label>
        <button className="code-editor-button primary" onClick={submit} disabled={disabled} title="Save and submit this strategy">
          {status.busy === 'submit' ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      <div className="code-editor-body">
        {initialCode !== null && (
          <Editor
            defaultLanguage="python"
            defaultValue={initialCode}
            theme="brokerage-dark"
            beforeMount={defineTheme}
            onMount={handleMount}
            onChange={handleChange}
            options={{
              automaticLayout: true, // re-measure when the panel is resized
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 4,
            }}
          />
        )}
      </div>
      {submissionId !== null && <SubmissionPanel submissionId={submissionId} />}
    </div>
  );
}

export default CodeEditor;
