import { useEffect, useState } from 'preact/hooks';
import { ArticleView } from './ArticleView';
import { CategoryPage } from './CategoryPage';
import { WIKI_INDEX } from './dataLoader';
import { HomePage } from './HomePage';
import { parseHash, type WikiRoute } from './router';
import { SearchBar } from './SearchBar';
import { SearchPage } from './SearchPage';
import { sectionForType, WIKI_SECTIONS } from './sections';
import {
  isGateSpoiled,
  readHideSpoilersPref,
  readSpoilerProgress,
  writeHideSpoilersPref,
  type SpoilerProgress,
} from './spoilers';
import type { WikiGate } from './types';

interface Props {
  updateReady?: boolean;
  onApplyUpdate?: () => void;
}

export function App({ updateReady, onApplyUpdate }: Props) {
  const [route, setRoute] = useState<WikiRoute>(() => parseHash());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hideSpoilers, setHideSpoilers] = useState<boolean>(() => readHideSpoilersPref());
  const [progress, setProgress] = useState<SpoilerProgress>({
    hasSave: false,
    heroLabel: 'Checking save…',
    maxAct: 4,
    unlockedMissions: new Set(),
  });

  useEffect(() => {
    void readSpoilerProgress(WIKI_INDEX).then(setProgress);
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const toggleSpoilers = () => {
    setHideSpoilers((prev) => {
      const next = !prev;
      writeHideSpoilersPref(next);
      return next;
    });
  };

  const turnOffSpoilers = () => {
    setHideSpoilers(false);
    writeHideSpoilersPref(false);
  };

  const isSpoiled = (gate?: WikiGate): boolean => isGateSpoiled(gate, hideSpoilers, progress, WIKI_INDEX.acts ?? {});

  const activeSecId =
    route.kind === 'home'
      ? 'home'
      : route.kind === 'category'
      ? sectionForType(route.entryType).id
      : route.kind === 'article'
      ? sectionForType(route.entryType).id
      : '';

  return (
    <div class="wiki-shell">
      <header class="wiki-header">
        <button
          type="button"
          class="wiki-menu-btn"
          aria-label="Toggle navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          ☰
        </button>
        <a class="wiki-brand" href="#/home">
          <span>Thornvael Wiki</span>
        </a>

        <SearchBar initialQuery={route.kind === 'search' ? route.query : ''} isSpoiled={isSpoiled} />

        <div class="wiki-header-actions">
          <button
            type="button"
            class={`wiki-spoiler-toggle ${hideSpoilers ? 'on' : ''}`}
            aria-pressed={hideSpoilers}
            title={progress.hasSave ? `Active save: ${progress.heroLabel}` : 'No IndexedDB save found — showing full wiki'}
            onClick={toggleSpoilers}
          >
            <span>🛡️ Hide spoilers: {hideSpoilers ? 'ON' : 'OFF'}</span>
          </button>
          {updateReady && onApplyUpdate && (
            <button type="button" class="wiki-update-pill" onClick={onApplyUpdate}>
              Update Ready
            </button>
          )}
        </div>
      </header>

      <div class="wiki-body">
        {drawerOpen && <div class="wiki-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

        <aside class={`wiki-sidebar ${drawerOpen ? 'open' : ''}`} aria-label="Wiki sections">
          <div class="wiki-sidebar-head">
            <span>Compendium</span>
            <button type="button" class="wiki-btn" onClick={() => setDrawerOpen(false)} aria-label="Close navigation">
              ✕
            </button>
          </div>
          <div class="wiki-hero-status" role="status">
            {progress.hasSave ? progress.heroLabel : 'No save detected · Full wiki shown'}
          </div>
          <nav class="wiki-nav">
            {WIKI_SECTIONS.map((sec) => (
              <a
                key={sec.id}
                href={`#/${sec.route}`}
                class={`wiki-nav-link ${activeSecId === sec.id ? 'active' : ''}`}
                aria-current={activeSecId === sec.id ? 'page' : undefined}
              >
                <span aria-hidden="true">{sec.icon}</span>
                <span>{sec.label}</span>
              </a>
            ))}
          </nav>
        </aside>

        <main class="wiki-main">
          {route.kind === 'home' && <HomePage />}
          {route.kind === 'search' && <SearchPage query={route.query} isSpoiled={isSpoiled} />}
          {route.kind === 'category' && <CategoryPage cat={route.cat} entryType={route.entryType} isSpoiled={isSpoiled} />}
          {route.kind === 'article' && (
            <ArticleView
              entryType={route.entryType}
              id={route.id}
              isSpoiled={isSpoiled}
              onShowSpoilers={turnOffSpoilers}
            />
          )}
        </main>
      </div>
    </div>
  );
}
