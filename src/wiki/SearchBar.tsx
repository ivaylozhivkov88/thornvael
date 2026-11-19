import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { WIKI_INDEX } from './dataLoader';
import { go } from './router';
import { TYPE_LABEL } from './sections';
import type { WikiGate, WikiIndexEntry } from './types';

interface Props {
  initialQuery?: string;
  isSpoiled: (gate?: WikiGate) => boolean;
}

export function searchEntries(entries: readonly WikiIndexEntry[], rawQuery: string): WikiIndexEntry[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const scored: { entry: WikiIndexEntry; score: number }[] = [];
  for (const entry of entries) {
    const title = entry.n.toLowerCase();
    const id = entry.id.toLowerCase();
    const summary = entry.s.toLowerCase();
    const tags = [entry.tag.family, entry.tag.school, entry.tag.rarity, entry.tag.slot, entry.tag.cls, entry.tag.biome, entry.tag.cat]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let score = 0;
    if (title === q || id === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if (id.includes(q)) score = 45;
    else if (tags.includes(q)) score = 30;
    else if (summary.includes(q)) score = 15;

    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.n.localeCompare(b.entry.n));
  return scored.map((x) => x.entry);
}

export function SearchBar({ initialQuery = '', isSpoiled }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const onDocDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, []);

  const suggestions = useMemo(() => searchEntries(WIKI_INDEX.entries, query).slice(0, 10), [query]);

  const submitSearch = (e: Event) => {
    e.preventDefault();
    const q = query.trim();
    setOpen(false);
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      go(suggestions[activeIdx].r);
      return;
    }
    if (q) {
      go(`search?q=${encodeURIComponent(q)}`);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open && suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div class="wiki-search-slot" ref={wrapRef}>
      <form class="wiki-search-form" role="search" onSubmit={submitSearch}>
        <input
          type="search"
          class="wiki-search-input"
          placeholder="Search creatures, items, spells, lore…"
          aria-label="Search Thornvael Wiki"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          value={query}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" class="wiki-search-btn" aria-label="Search">
          🔍
        </button>
      </form>

      {open && suggestions.length > 0 && (
        <ul class="wiki-autocomplete" role="listbox" aria-label="Search suggestions">
          {suggestions.map((item, idx) => {
            const spoiled = isSpoiled(item.g);
            return (
              <li key={item.r} role="option" aria-selected={idx === activeIdx}>
                <button
                  type="button"
                  class={`wiki-ac-item ${idx === activeIdx ? 'active' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    setActiveIdx(-1);
                    go(item.r);
                  }}
                >
                  <span class="wiki-ac-title">{spoiled ? `${item.n} (Spoiler)` : item.n}</span>
                  <span class="wiki-ac-type">{TYPE_LABEL[item.t]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
