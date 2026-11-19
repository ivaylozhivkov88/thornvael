import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './wiki.css';

function Root() {
  const [updateReady, setUpdateReady] = useState(false);
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

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

  return <App updateReady={updateReady} onApplyUpdate={applyUpdate ?? undefined} />;
}

const mount = document.getElementById('wiki-root');
if (mount) {
  render(<Root />, mount);
}
