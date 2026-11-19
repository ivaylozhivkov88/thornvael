import { useEffect, useState } from 'preact/hooks';
import { loadCategory } from './dataLoader';
import { sectionForType, TYPE_LABEL } from './sections';
import type { WikiEntry, WikiEntryType, WikiGate } from './types';
import { WikiPicture } from './WikiPicture';

interface Props {
  cat: string;
  entryType: WikiEntryType;
  isSpoiled?: (gate?: WikiGate) => boolean;
}

export function CategoryPage({ cat, entryType, isSpoiled }: Props) {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadCategory(cat).then((list) => {
      if (!active) return;
      setEntries(list);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [cat]);

  const sec = sectionForType(entryType);

  return (
    <div class="wiki-category">
      <header class="wiki-cat-head">
        <div>
          <h1>
            <span aria-hidden="true">{sec.icon}</span> {sec.label}
          </h1>
          <p class="wiki-muted">{sec.desc}</p>
        </div>
      </header>

      {sec.tabs && (
        <nav class="wiki-tabs" aria-label="Section tabs">
          {sec.tabs.map((tab) => (
            <a
              key={tab.id}
              href={`#/${tab.route}`}
              class={`wiki-tab ${tab.type === entryType ? 'active' : ''}`}
              aria-current={tab.type === entryType ? 'page' : undefined}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      )}

      {loading ? (
        <div class="wiki-loading" role="status">
          Loading {TYPE_LABEL[entryType]}…
        </div>
      ) : (
        <div class="wiki-card-grid">
          {entries.map((entry) => {
            const spoiled = Boolean(isSpoiled?.(entry.gate));
            return (
              <a key={entry.id} class={`wiki-card ${spoiled ? 'is-spoiler' : ''}`} href={`#/${entry.type}/${entry.id}`}>
                <div class="wiki-card-media">
                  <WikiPicture img={spoiled ? null : entry.img} type={entry.type} alt={entry.title} size={64} />
                </div>
                <div class="wiki-card-body">
                  <h3>{spoiled ? 'Hidden Spoiler Entry' : entry.title}</h3>
                  <p>{spoiled ? 'Progress further or disable Hide Spoilers to read.' : entry.summary}</p>
                  <div class="wiki-card-meta">
                    {entry.tags.act ? <span class="wiki-mini-tag">Act {entry.tags.act}</span> : null}
                    {entry.tags.rarity ? <span class="wiki-mini-tag">{entry.tags.rarity}</span> : null}
                    {entry.tags.family ? <span class="wiki-mini-tag">{entry.tags.family}</span> : null}
                    {entry.tags.school ? <span class="wiki-mini-tag">{entry.tags.school}</span> : null}
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
