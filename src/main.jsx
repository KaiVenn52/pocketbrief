import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  asMarkdown, EXAMPLE, formatLocal, MAX_CARRYOVER_BYTES, readCarryover,
  resolveItem, SECTIONS, serializeCarryover, startHandover,
} from './core.mjs';
import { configured, deviceConfigured, generateHandover } from './firebase.mjs';
import './style.css';

const example = { ...formatLocal(EXAMPLE), mode: 'Example' };
const modes = [
  ['format', 'Local formatting', 'Sort notes on this device using rules.'],
  ['device', 'On-device AI only', 'Use the device model. Stop if it is unavailable.'],
  ['hybrid', 'Allow cloud fallback', 'Use the device model first. If unavailable, send these notes to Google for processing.'],
];

function useOfflineStatus() {
  const available = import.meta.env.PROD && 'serviceWorker' in navigator;
  const [status, setStatus] = useState(available ? 'Preparing offline access' : '');
  useEffect(() => {
    if (!available) return;
    const workers = navigator.serviceWorker;
    const workerUrl = new URL(import.meta.env.BASE_URL + 'offline-worker.js', document.baseURI);
    let active = true;
    const ready = () => {
      if (active && workers.controller?.scriptURL === workerUrl.href) setStatus('Offline ready');
    };
    workers.addEventListener('controllerchange', ready);
    ready();
    workers.register(workerUrl).catch(() => {
      if (active && workers.controller?.scriptURL !== workerUrl.href) setStatus('Offline access unavailable');
    });
    return () => {
      active = false;
      workers.removeEventListener('controllerchange', ready);
    };
  }, [available]);
  return status;
}

function downloadFile(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FollowUp({ item, canResolve, onResolve, children }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  return (
    <li>
      {children}
      {item.resolution && <p className="followup-resolution"><strong>Resolved</strong> {item.resolution}</p>}
      {canResolve && !item.resolution && !editing && (
        <button className="resolve" onClick={() => setEditing(true)}>Resolve</button>
      )}
      {canResolve && editing && (
        <form className="resolve-form" onSubmit={event => {
          event.preventDefault();
          onResolve(item.key, note);
          setEditing(false);
        }}>
          <label>
            Resolution note
            <input required value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
          </label>
          <div>
            <button type="submit" disabled={!note.trim()}>Save resolution</button>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}

function App() {
  const [notes, setNotes] = useState(EXAMPLE);
  const [mode, setMode] = useState('format');
  const [history, setHistory] = useState([]);
  const [viewId, setViewId] = useState(null);
  const [carryForward, setCarryForward] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [imported, setImported] = useState(null);
  const [openingFile, setOpeningFile] = useState(false);
  const historyDialog = useRef(null);
  const latest = history[0];
  const preceding = latest ?? imported;
  const result = history.find(item => item.id === viewId) ?? example;
  const canResolve = Boolean(latest && latest.id === viewId);
  const carryCount = preceding?.tracked.filter(item => !item.resolution).length ?? 0;
  const earlier = result.tracked?.filter(item => item.handoverId !== result.id) ?? [];
  const current = new Map(result.tracked?.filter(item => item.handoverId === result.id)
    .map(item => [item.sourceId, item]));
  const offlineStatus = useOfflineStatus();

  async function run() {
    setError('');
    setCopied(false);
    setBusy(true);
    try {
      const generated = mode === 'format'
        ? formatLocal(notes)
        : await generateHandover(notes, mode === 'hybrid', setDownloadProgress);
      const id = (preceding?.id ?? 0) + 1;
      setHistory(existing => {
        const previous = carryForward ? existing[0] ?? imported : null;
        return [startHandover(generated, id, previous), ...existing].slice(0, 10);
      });
      setImported(null);
      setViewId(id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create the handover.');
    } finally {
      setBusy(false);
      setDownloadProgress(null);
    }
  }

  function resolve(key, note) {
    setCopied(false);
    setHistory(([head, ...previous]) => [resolveItem(head, key, note), ...previous]);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(asMarkdown(result));
      setCopied(true);
    } catch {
      setError('Clipboard unavailable. Use Download handover.');
    }
  }

  function download() {
    const name = result.id ? `field-handover-${result.id}.md` : 'field-handover-example.md';
    downloadFile(asMarkdown(result), 'text/markdown', name);
  }

  function saveOpenItems() {
    const data = serializeCarryover(latest);
    if (new Blob([data]).size > MAX_CARRYOVER_BYTES) {
      setError('The carryover file exceeds 2 MB. Keep a Markdown copy or resolve items before exporting.');
      return;
    }
    downloadFile(data, 'application/json', `pocketbrief-carryover-${latest.id}.json`);
  }

  async function openCarryover(event) {
    const input = event.currentTarget;
    const [file] = input.files;
    if (!file) return;
    setError('');
    setOpeningFile(true);
    try {
      if (file.size > MAX_CARRYOVER_BYTES) throw new Error('Choose a carryover file under 2 MB.');
      setImported(readCarryover(await file.text()));
      setCarryForward(true);
      setNotes(previous => previous === EXAMPLE ? '' : previous);
    } catch (error) {
      setError(error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message);
    } finally {
      setOpeningFile(false);
      input.value = '';
    }
  }

  return (
    <div className="shell">
      <header>
        <a href="#" className="logo">PocketBrief</a>
        <div className="header-actions">
          {offlineStatus && <span role="status" className="offline-status">{offlineStatus}</span>}
          <button onClick={() => historyDialog.current.showModal()}>History{history.length > 0 && ` (${history.length})`}</button>
        </div>
      </header>
      <h1>Turn field notes into a clear handover.</h1>
      {error && <div role="alert" className="error">{error}</div>}
      <main>
        <section className="entry">
          <h2>Field notes</h2>
          <label className="notes-label">
            <span>{notes === EXAMPLE ? 'Example' : 'Your notes'}</span>
            <textarea aria-label="Field notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={12000} />
          </label>
          {!latest && (
            <div className="carry-file">
              <label htmlFor="carryover-file">Open carryover file</label>
              <input id="carryover-file" type="file" accept=".json,application/json" onChange={openCarryover} disabled={busy || openingFile} />
            </div>
          )}
          {imported && (
            <p className="carry-loaded" role="status">
              Loaded {carryCount} open {carryCount === 1 ? 'item' : 'items'} from handover {imported.id}.
            </p>
          )}
          {carryCount > 0 && (
            <label className="carry-option">
              <input type="checkbox" checked={carryForward} onChange={event => setCarryForward(event.target.checked)} />
              Carry forward {carryCount} open {carryCount === 1 ? 'item' : 'items'} from handover {preceding.id}
            </label>
          )}
          <fieldset>
            <legend>Processing</legend>
            {modes.map(([id, title, help]) => (
              <label key={id} className="radio">
                <input type="radio" name="mode" checked={mode === id} onChange={() => setMode(id)} />
                <span>{title}<small>{help}</small></span>
              </label>
            ))}
          </fieldset>
          <button className="primary" onClick={run} disabled={busy || openingFile}>{busy ? 'Creating handover…' : 'Create handover'}</button>
          {downloadProgress !== null && (
            <p className="carry-loaded" role="status">Downloading device model · {Math.round(downloadProgress * 100)}%</p>
          )}
          <p className="privacy">Notes stay in this tab unless you export them. Cloud fallback can send the current field notes to Google.</p>
        </section>
        <section className="preview">
          <div className="preview-heading">
            <h2>{result.id ? `Handover ${result.id}` : 'Handover'}</h2>
            <span role="status">{result.mode}</span>
          </div>
          {latest && !canResolve && (
            <button className="resolve" onClick={() => {
              setViewId(latest.id);
              setCopied(false);
            }}>Back to latest</button>
          )}
          {earlier.length > 0 && (
            <section className="doc-section carryover" key={viewId}>
              <h3>From earlier handovers</h3>
              <ul>
                {earlier.map(item => (
                  <FollowUp key={item.key} item={item} canResolve={canResolve} onResolve={resolve}>
                    {item.text}
                    <small className="origin">Handover {item.handoverId} · Source {item.sourceId}</small>
                  </FollowUp>
                ))}
              </ul>
            </section>
          )}
          {Object.entries(SECTIONS).map(([section, title]) => (
            <section className="doc-section" key={section}>
              <h3>{title}</h3>
              {result[section].length > 0 ? (
                <ul>{result[section].map(item => {
                  const content = <>{item.text} <a href={`#source-${item.sourceId}`}>[{item.sourceId}]</a></>;
                  const tracked = current.get(item.sourceId);
                  return tracked
                    ? <FollowUp key={tracked.key} item={tracked} canResolve={canResolve} onResolve={resolve}>{content}</FollowUp>
                    : <li key={item.sourceId}>{content}</li>;
                })}</ul>
              ) : <p className="muted">No items classified here.</p>}
            </section>
          ))}
          <section className="sources">
            <h3>Sources</h3>
            {result.sources.map(source => (
              <p key={source.id} id={`source-${source.id}`}><strong>[{source.id}]</strong> “{source.text}”</p>
            ))}
          </section>
          <p className="privacy">Review actions with the responsible person before execution.</p>
          <div className="export">
            <button onClick={copy}>{copied ? 'Copied' : 'Copy handover'}</button>
            <button onClick={download}>Download handover</button>
            {canResolve && carryCount > 0 && <button onClick={saveOpenItems}>Save open items</button>}
          </div>
        </section>
      </main>
      <footer><i />{configured ? 'Firebase settings loaded'
        : deviceConfigured ? 'On-device AI configured · Cloud requires App Check'
          : 'Local formatting available · Firebase setup pending'}</footer>
      <dialog ref={historyDialog} aria-labelledby="history-title">
        <form method="dialog"><button className="close">Close</button></form>
        <h2 id="history-title">Session history</h2>
        <p>Closing this tab clears the history. Export a handover to keep a copy.</p>
        {history.length ? history.map(item => (
          <button className="history" key={item.id} onClick={() => {
            setViewId(item.id);
            setCopied(false);
            historyDialog.current.close();
          }}>
            Handover {item.id} · {item.mode}
            <small>{item.sources[0]?.text}</small>
          </button>
        )) : <p>No handovers created yet.</p>}
      </dialog>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
