import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadCategory } from './dataLoader';
import { sectionForType, TYPE_LABEL } from './sections';
import type { WikiEntry, WikiEntryType, WikiGate } from './types';
import { WikiPicture } from './WikiPicture';

interface Props {
  cat: string;
  entryType: WikiEntryType;
  isSpoiled?: (gate?: WikiGate) => boolean;
}

type SortKey = 'title' | 'group' | 'level' | 'attr';
type SortDir = 'asc' | 'desc';

function groupVal(e: WikiEntry): string {
  return e.tags.family ?? e.tags.school ?? e.tags.slot ?? e.tags.biome ?? e.tags.cat ?? e.infobox[0]?.[1] ?? '';
}

function attrVal(e: WikiEntry): string {
  return e.tags.rarity || e.tags.cls || e.infobox[1]?.[1] || '';
}

export function CategoryPage({ cat, entryType, isSpoiled }: Props) {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [actFilter, setActFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [bestiaryScope, setBestiaryScope] = useState<'all' | 'core' | 'super' | 'extra'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setQ('');
    setGroupFilter('all');
    setActFilter('all');
    setRarityFilter('all');
    setClassFilter('all');
    setBestiaryScope('all');
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

  const groupOptions = useMemo(
    () => [...new Set(entries.map(groupVal).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const actOptions = useMemo(() => {
    const acts = [...new Set(entries.map((e) => e.tags.act).filter((a): a is number => Boolean(a && a > 0)))].sort((a, b) => a - b);
    return acts;
  }, [entries]);
  const levelOptions = useMemo(() => {
    if (actOptions.length > 0) return [];
    return [...new Set(entries.map((e) => e.tags.level).filter((l): l is number => Boolean(l && l > 0)))].sort((a, b) => a - b).slice(0, 10);
  }, [entries, actOptions]);
  const rarityOptions = useMemo(
    () => [...new Set(entries.map((e) => e.tags.rarity).filter((r): r is string => Boolean(r)))].sort(),
    [entries],
  );
  const classOptions = useMemo(
    () => [...new Set(entries.map((e) => e.tags.cls).filter((c): c is string => Boolean(c)))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = entries.filter((e) => {
      if (entryType === 'bestiary') {
        if (bestiaryScope === 'core' && !e.tags.core) return false;
        if (bestiaryScope === 'super' && e.tags.family !== 'super-unique') return false;
        if (bestiaryScope === 'extra' && (e.tags.core || e.tags.family === 'super-unique')) return false;
      }
      if (groupFilter !== 'all' && groupVal(e) !== groupFilter) return false;
      if (actFilter !== 'all') {
        if (actOptions.length > 0 && String(e.tags.act ?? 0) !== actFilter) return false;
        if (actOptions.length === 0 && String(e.tags.level ?? 0) !== actFilter) return false;
      }
      if (rarityFilter !== 'all' && e.tags.rarity !== rarityFilter) return false;
      if (classFilter !== 'all' && e.tags.cls !== classFilter) return false;
      if (needle) {
        const hay = `${e.title} ${e.summary} ${groupVal(e)} ${attrVal(e)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortKey === 'group') cmp = groupVal(a).localeCompare(groupVal(b)) || a.title.localeCompare(b.title);
      else if (sortKey === 'level') cmp = (a.tags.act || a.tags.level || 0) - (b.tags.act || b.tags.level || 0) || a.title.localeCompare(b.title);
      else if (sortKey === 'attr') cmp = attrVal(a).localeCompare(attrVal(b)) || a.title.localeCompare(b.title);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [entries, entryType, bestiaryScope, groupFilter, actFilter, actOptions, rarityFilter, classFilter, q, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕');

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

      {entryType === 'bestiary' && (
        <div class="wiki-tabs" role="group" aria-label="Bestiary tier scope">
          {(
            [
              ['all', `All (${entries.length})`],
              ['core', `52 Core Creatures (${entries.filter((e) => e.tags.core).length})`],
              ['super', `Super Uniques (${entries.filter((e) => e.tags.family === 'super-unique').length})`],
              ['extra', `Field Variants (${entries.filter((e) => !e.tags.core && e.tags.family !== 'super-unique').length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              class={`wiki-tab ${bestiaryScope === id ? 'active' : ''}`}
              onClick={() => setBestiaryScope(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div class="wiki-filters" role="region" aria-label="Category filters">
        <input
          type="search"
          class="wiki-filter-input"
          placeholder={`Filter ${TYPE_LABEL[entryType]}…`}
          aria-label={`Filter ${TYPE_LABEL[entryType]}`}
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />

        {groupOptions.length > 1 && (
          <select
            class="wiki-filter-select"
            aria-label="Filter by family or type"
            value={groupFilter}
            onChange={(e) => setGroupFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="all">All types / families</option>
            {groupOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {(actOptions.length > 0 || levelOptions.length > 0) && (
          <select
            class="wiki-filter-select"
            aria-label="Filter by act or tier"
            value={actFilter}
            onChange={(e) => setActFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="all">{actOptions.length > 0 ? 'All acts' : 'All tiers'}</option>
            {actOptions.map((a) => (
              <option key={a} value={String(a)}>
                Act {a}
              </option>
            ))}
            {levelOptions.map((l) => (
              <option key={l} value={String(l)}>
                Tier / Lv {l}
              </option>
            ))}
          </select>
        )}

        {rarityOptions.length > 1 && (
          <select
            class="wiki-filter-select"
            aria-label="Filter by rarity"
            value={rarityFilter}
            onChange={(e) => setRarityFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="all">All rarities</option>
            {rarityOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}

        {classOptions.length > 1 && (
          <select
            class="wiki-filter-select"
            aria-label="Filter by class"
            value={classFilter}
            onChange={(e) => setClassFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="all">All classes</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <div class="wiki-view-switch" role="group" aria-label="View mode">
          <button
            type="button"
            class={`wiki-tab ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            class={`wiki-tab ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Table
          </button>
        </div>
      </div>

      <p class="wiki-muted">
        Showing {filtered.length} of {entries.length} entries
      </p>

      {loading ? (
        <div class="wiki-loading" role="status">
          Loading {TYPE_LABEL[entryType]}…
        </div>
      ) : filtered.length === 0 ? (
        <div class="wiki-empty">No entries match the current filters.</div>
      ) : viewMode === 'table' ? (
        <div class="wiki-table-wrap">
          <table class="wiki-data-table">
            <thead>
              <tr>
                <th scope="col">
                  <button type="button" class="wiki-sort-btn" onClick={() => toggleSort('title')}>
                    Name{sortArrow('title')}
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="wiki-sort-btn" onClick={() => toggleSort('group')}>
                    Type / Family{sortArrow('group')}
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="wiki-sort-btn" onClick={() => toggleSort('level')}>
                    Act / Tier{sortArrow('level')}
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="wiki-sort-btn" onClick={() => toggleSort('attr')}>
                    Attribute{sortArrow('attr')}
                  </button>
                </th>
                <th scope="col">Summary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const spoiled = Boolean(isSpoiled?.(entry.gate));
                return (
                  <tr key={entry.id}>
                    <td>
                      <a href={`#/${entry.type}/${entry.id}`}>{spoiled ? 'Hidden Spoiler Entry' : entry.title}</a>
                    </td>
                    <td>{groupVal(entry) || '—'}</td>
                    <td>{entry.tags.act ? `Act ${entry.tags.act}` : entry.tags.level ? `T${entry.tags.level}` : '—'}</td>
                    <td>{attrVal(entry) || '—'}</td>
                    <td>{spoiled ? 'Spoiler protection active' : entry.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div class="wiki-card-grid">
          {filtered.map((entry) => {
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
