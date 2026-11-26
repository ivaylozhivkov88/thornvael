import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { loadWikiIndex } from './dataLoader';
import './wiki.css';

function Root() {
  const [ready, setReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    void loadWikiIndex().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const update = registerSW({
        onNeedRefresh: () => setUpdateReady(true),
        onOfflineReady: () => {},
      });
      setApplyUpdate(() => () => void update(true));
    } catch {
      /* service worker unavailable */
    }
  }, []);

  if (!ready) return <div class="wiki-loading">Loading Compendium…</div>;
  return <App updateReady={updateReady} onApplyUpdate={applyUpdate ?? undefined} />;
}

const mount = document.getElementById('wiki-root');
if (mount) {
  render(<Root />, mount);
}
