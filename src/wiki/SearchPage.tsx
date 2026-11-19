import { useEffect, useMemo, useState } from 'preact/hooks';
import { WIKI_INDEX } from './dataLoader';
import { searchEntries } from './SearchBar';
import { TYPE_LABEL } from './sections';
import type { WikiEntryType, WikiGate } from './types';
import { WikiPicture } from './WikiPicture';

interface Props {
  query: string;
  isSpoiled: (gate?: WikiGate) => boolean;
}

export function SearchPage({ query, isSpoiled }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | WikiEntryType>('all');

  useEffect(() => {
    setTypeFilter('all');
  }, [query]);

  const allHits = useMemo(() => searchEntries(WIKI_INDEX.entries, query), [query]);
  const availableTypes = useMemo(() => {
    const counts = new Map<WikiEntryType, number>();
    for (const h of allHits) counts.set(h.t, (counts.get(h.t) ?? 0) + 1);
    return [...counts.entries()];
  }, [allHits]);

  const filtered = useMemo(
    () => (typeFilter === 'all' ? allHits : allHits.filter((h) => h.t === typeFilter)),
    [allHits, typeFilter],
  );

  return (
    <div class="wiki-category">
      <header class="wiki-cat-head">
        <h1>Search results for &ldquo;{query}&rdquo;</h1>
        <p class="wiki-muted">{allHits.length} matching entries found across the compendium.</p>
      </header>

      {availableTypes.length > 1 && (
        <div class="wiki-tabs" role="group" aria-label="Filter search results by type">
          <button
            type="button"
            class={`wiki-tab ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All ({allHits.length})
          </button>
          {availableTypes.map(([t, cnt]) => (
            <button
              key={t}
              type="button"
              class={`wiki-tab ${typeFilter === t ? 'active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {TYPE_LABEL[t]} ({cnt})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div class="wiki-empty">
          <p>No entries matched &ldquo;{query}&rdquo;. Try another keyword such as <code>gnoll</code>, <code>hollow</code>, <code>fireball</code>, or <code>thornwick</code>.</p>
        </div>
      ) : (
        <div class="wiki-card-grid">
          {filtered.slice(0, 100).map((item) => {
            const spoiled = isSpoiled(item.g);
            return (
              <a key={item.r} class={`wiki-card ${item.tag.rarity ? `rarity-${item.tag.rarity}` : ''} ${spoiled ? 'is-spoiler' : ''}`.trim()} href={`#/${item.r}`}>
                <div class="wiki-card-media">
                  <WikiPicture img={spoiled ? null : item.img} type={item.t} alt={item.n} size={64} />
                </div>
                <div class="wiki-card-body">
                  <h3>{spoiled ? 'Hidden Spoiler Entry' : item.n}</h3>
                  <p>{spoiled ? 'Hidden to protect progress.' : item.s}</p>
                  <div class="wiki-card-meta">
                    <span class="wiki-mini-tag">{TYPE_LABEL[item.t]}</span>
                    {item.tag.act ? <span class="wiki-mini-tag">Act {item.tag.act}</span> : null}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
