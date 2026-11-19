import { useEffect, useState } from 'preact/hooks';
import { ArticleView } from './ArticleView';
import { CategoryPage } from './CategoryPage';
import { HomePage } from './HomePage';
import { parseHash, type WikiRoute } from './router';
import { sectionForType, WIKI_SECTIONS } from './sections';
import type { WikiGate } from './types';

interface Props {
  updateReady?: boolean;
  onApplyUpdate?: () => void;
}

export function App({ updateReady, onApplyUpdate }: Props) {
  const [route, setRoute] = useState<WikiRoute>(() => parseHash());
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const activeSecId =
    route.kind === 'home'
      ? 'home'
      : route.kind === 'category'
      ? sectionForType(route.entryType).id
      : route.kind === 'article'
      ? sectionForType(route.entryType).id
      : '';

  const isSpoiled = (_gate?: WikiGate) => false;

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
        <div class="wiki-header-actions">
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
          {route.kind === 'category' && <CategoryPage cat={route.cat} entryType={route.entryType} isSpoiled={isSpoiled} />}
          {route.kind === 'article' && <ArticleView entryType={route.entryType} id={route.id} isSpoiled={isSpoiled} />}
        </main>
      </div>
    </div>
  );
}
