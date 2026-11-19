import { useEffect, useMemo, useState } from 'preact/hooks';
import { getIndexEntry, loadArticle, WIKI_INDEX } from './dataLoader';
import { sectionForType, TYPE_LABEL, TYPE_TO_CAT } from './sections';
import type { WikiEntry, WikiEntryType, WikiGate, WikiIndexEntry } from './types';
import { WikiPicture } from './WikiPicture';

interface Props {
  entryType: WikiEntryType;
  id: string;
  isSpoiled?: (gate?: WikiGate) => boolean;
  onShowSpoilers?: () => void;
}

export function ArticleView({ entryType, id, isSpoiled, onShowSpoilers }: Props) {
  const [entry, setEntry] = useState<WikiEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRevealed(false);
    void loadArticle(entryType, id).then((res) => {
      if (!active) return;
      setEntry(res);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [entryType, id]);

  const sec = sectionForType(entryType);

  const relatedEntries = useMemo(() => {
    if (!entry) return [] as WikiIndexEntry[];
    return entry.related.map((r) => getIndexEntry(r)).filter((x): x is WikiIndexEntry => Boolean(x));
  }, [entry]);

  const seeAlso = useMemo(() => {
    if (!entry) return [] as WikiIndexEntry[];
    const seen = new Set<string>([`${entry.type}/${entry.id}`, ...entry.related]);
    const sameType = WIKI_INDEX.entries.filter((e) => e.t === entry.type && !seen.has(e.r));
    const sameAct = entry.tags.act
      ? sameType.filter((e) => e.tag.act === entry.tags.act)
      : sameType;
    const pool = sameAct.length >= 4 ? sameAct : sameType;
    return pool.slice(0, 6);
  }, [entry]);

  if (loading) {
    return (
      <div class="wiki-loading" role="status">
        Loading chronicle entry…
      </div>
    );
  }

  if (!entry) {
    return (
      <div class="wiki-empty">
        <h1>Entry not found</h1>
        <p>No article exists for <code>{entryType}/{id}</code>.</p>
        <a class="wiki-btn" href={`#/${TYPE_TO_CAT[entryType] ?? 'home'}`}>
          Back to {TYPE_LABEL[entryType] ?? 'Home'}
        </a>
      </div>
    );
  }

  const gated = Boolean(isSpoiled?.(entry.gate) && !revealed);

  return (
    <article class="wiki-article">
      <nav class="wiki-breadcrumb" aria-label="Breadcrumb">
        <a href="#/home">Home</a>
        <span aria-hidden="true">›</span>
        <a href={`#/${sec.route}`}>{sec.label}</a>
        {sec.tabs && (
          <>
            <span aria-hidden="true">›</span>
            <a href={`#/${TYPE_TO_CAT[entry.type]}`}>{TYPE_LABEL[entry.type]}</a>
          </>
        )}
        <span aria-hidden="true">›</span>
        <span class="crumb-cur">{entry.title}</span>
      </nav>

      <header class="wiki-article-head">
        <div>
          <span class="wiki-badge">{TYPE_LABEL[entry.type]}</span>
          {entry.tags.act ? <span class="wiki-badge badge-act">Act {entry.tags.act}</span> : null}
          {entry.tags.rarity ? <span class={`wiki-badge badge-${entry.tags.rarity}`}>{entry.tags.rarity}</span> : null}
          <h1>{entry.title}</h1>
          {entry.summary && <p class="wiki-lead">{gated ? 'Hidden to prevent spoilers.' : entry.summary}</p>}
        </div>
      </header>

      {gated ? (
        <section class="wiki-spoiler-wall">
          <h2>Spoiler Protection Active</h2>
          <p>
            This article covers content beyond your active hero&apos;s current progress
            {entry.gate?.a ? ` (Act ${entry.gate.a})` : entry.gate?.m ? ` (Mission ${entry.gate.m.toUpperCase()})` : ''}.
          </p>
          <div class="wiki-spoiler-actions">
            <button type="button" class="wiki-btn primary" onClick={() => setRevealed(true)}>
              Reveal this article
            </button>
            {onShowSpoilers && (
              <button type="button" class="wiki-btn" onClick={onShowSpoilers}>
                Turn off Hide Spoilers globally
              </button>
            )}
          </div>
        </section>
      ) : (
        <div class="wiki-article-layout">
          <aside class={`wiki-infobox ${entry.tags.rarity ? `rarity-${entry.tags.rarity}` : ''}`.trim()} aria-label="Article infobox">
            <div class="infobox-title">{entry.title}</div>
            <div class="infobox-media">
              <WikiPicture img={entry.img} type={entry.type} alt={entry.title} size={180} />
              {entry.sprite && (
                <div class="infobox-sprite-row">
                  <span class="infobox-sprite-label">In-game sprite</span>
                  <WikiPicture img={entry.sprite} type={entry.type} alt={`${entry.title} sprite`} size={72} />
                </div>
              )}
            </div>
            <table class="infobox-table">
              <tbody>
                {entry.infobox.map(([k, v], i) => (
                  <tr key={`${k}-${i}`}>
                    <th scope="row">{k}</th>
                    <td>{v || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>

          <div class="wiki-article-body">
            {entry.sections.map((s, idx) => (
              <section key={`${s.h}-${idx}`} class="wiki-sec">
                <h2>{s.h}</h2>
                {s.p?.map((para, pi) => (
                  <p key={pi}>{para}</p>
                ))}
                {s.list && s.list.length > 0 && (
                  <ul class="wiki-list">
                    {s.list.map((item, li) => (
                      <li key={li}>{item}</li>
                    ))}
                  </ul>
                )}
                {s.table && (
                  <div class="wiki-table-wrap">
                    <table class="wiki-data-table">
                      <thead>
                        <tr>
                          {s.table.head.map((col, ci) => (
                            <th key={ci} scope="col">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.table.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}

            {relatedEntries.length > 0 && (
              <section class="wiki-sec">
                <h2>Related links</h2>
                <div class="wiki-link-grid">
                  {relatedEntries.map((rel) => (
                    <a key={rel.r} class="wiki-link-chip" href={`#/${rel.r}`}>
                      <span class="chip-type">{TYPE_LABEL[rel.t]}</span>
                      <span class="chip-name">{isSpoiled?.(rel.g) ? '??? (Spoiler)' : rel.n}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section class="wiki-sec">
              <h2>See also</h2>
              {seeAlso.length > 0 ? (
                <div class="wiki-link-grid">
                  {seeAlso.map((peer) => (
                    <a key={peer.r} class="wiki-link-chip" href={`#/${peer.r}`}>
                      <span class="chip-type">{TYPE_LABEL[peer.t]}</span>
                      <span class="chip-name">{isSpoiled?.(peer.g) ? '??? (Spoiler)' : peer.n}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p class="wiki-muted">Browse the <a href={`#/${sec.route}`}>{sec.label}</a> index for more entries.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </article>
  );
}
