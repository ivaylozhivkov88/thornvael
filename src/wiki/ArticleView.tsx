import { useEffect, useMemo, useState } from 'preact/hooks';
import { getIndexEntry, loadArticle, WIKI_INDEX } from './dataLoader';
import {
  GRAIL_UPDATED_EVENT,
  type GrailSnapshot,
  getEntryDropClue,
  isGrailEligibleType,
  isTargetPinned,
  loadGrailSnapshot,
  lookupGrailStatus,
  MAX_GRAIL_PINS,
  toggleGrailPin,
} from './grail-status';
import { sectionForType, TYPE_LABEL, TYPE_TO_CAT } from './sections';
import type { WikiEntry, WikiEntryType, WikiGate, WikiIndexEntry } from './types';
import { WikiPicture, WikiSpriteTurnaround } from './WikiPicture';

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
  const [grailSnap, setGrailSnap] = useState<GrailSnapshot>(() => loadGrailSnapshot());
  const [pinLimitMsg, setPinLimitMsg] = useState(false);

  useEffect(() => {
    const syncGrail = () => setGrailSnap(loadGrailSnapshot());
    window.addEventListener('storage', syncGrail);
    window.addEventListener(GRAIL_UPDATED_EVENT, syncGrail);
    return () => {
      window.removeEventListener('storage', syncGrail);
      window.removeEventListener(GRAIL_UPDATED_EVENT, syncGrail);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRevealed(false);
    setPinLimitMsg(false);
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

  const grailStatus = useMemo(() => {
    if (!entry || !isGrailEligibleType(entry.type)) return null;
    return lookupGrailStatus(grailSnap, {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      codexId: entry.tags.codexId,
    });
  }, [entry, grailSnap]);

  const isPinned = useMemo(() => {
    if (!entry || !isGrailEligibleType(entry.type)) return false;
    return isTargetPinned(grailSnap.pins, entry.id, entry.type, entry.title);
  }, [entry, grailSnap.pins]);

  const onTogglePin = () => {
    if (!entry) return;
    const res = toggleGrailPin(entry.id, entry.title);
    setPinLimitMsg(res.limitReached);
    setGrailSnap(loadGrailSnapshot());
  };

  const relatedEntries = useMemo(() => {
    if (!entry) return [] as WikiIndexEntry[];
    return entry.related.map((r) => getIndexEntry(r)).filter((x): x is WikiIndexEntry => Boolean(x));
  }, [entry]);

  const seeAlso = useMemo(() => {
    if (!entry) return [] as WikiIndexEntry[];
    const seen = new Set<string>([`${entry.type}/${entry.id}`, ...entry.related]);
    const sameType = WIKI_INDEX.entries.filter((e) => e.t === entry.type && !seen.has(e.r));
    const sameAct = entry.tags.act ? sameType.filter((e) => e.tag.act === entry.tags.act) : sameType;
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
        <p>
          No article exists for{' '}
          <code>
            {entryType}/{id}
          </code>
          .
        </p>
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
            {entry.gate?.a ? ` (Act ${entry.gate.a})` : entry.gate?.m ? ` (Mission ${entry.gate.m.toUpperCase()})` : ''}
            .
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
        <>
          {grailStatus && (
            <section
              class={`wiki-grail-banner ${grailStatus.discovered ? 'is-discovered' : 'is-missing'} ${grailStatus.primal ? 'is-primal' : ''}`.trim()}
              aria-label="Live Holy Grail status"
            >
              {grailStatus.discovered ? (
                <div class="grail-banner-row">
                  <div class="grail-banner-copy">
                    <div class="grail-banner-badges">
                      <span class="grail-pill discovered">🏆 In Your Holy Grail</span>
                      {grailStatus.rollPerfectionPct != null && (
                        <span class="grail-pill perfection">{grailStatus.rollPerfectionPct}% Perfection</span>
                      )}
                      {grailStatus.primal && <span class="grail-pill primal">✨ Primal Relic</span>}
                    </div>
                    <p class="grail-banner-meta">
                      {grailStatus.discoveredByHero || grailStatus.missionName || grailStatus.droppedBy
                        ? [
                            grailStatus.discoveredByHero
                              ? `Found by ${grailStatus.discoveredByHero}${
                                  grailStatus.heroClass
                                    ? ` (${grailStatus.heroClass}${grailStatus.heroLevel ? ` Lv.${grailStatus.heroLevel}` : ''})`
                                    : ''
                                }`
                              : '',
                            grailStatus.missionName ? `in ${grailStatus.missionName}` : '',
                            grailStatus.droppedBy ? `from ${grailStatus.droppedBy}` : '',
                          ]
                            .filter(Boolean)
                            .join(' ')
                        : 'Recorded in your local Hall of Relics ledger.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div class="grail-banner-row">
                  <div class="grail-banner-copy">
                    <div class="grail-banner-badges">
                      <span class="grail-pill missing">🎯 Undiscovered in Holy Grail</span>
                      <span class="grail-pin-count">
                        {grailSnap.pins.length}/{MAX_GRAIL_PINS} pinned
                      </span>
                    </div>
                    {getEntryDropClue(entry) && (
                      <p class="grail-banner-meta">
                        <strong>Drop Clue:</strong> {getEntryDropClue(entry)}
                      </p>
                    )}
                    {pinLimitMsg && (
                      <p class="grail-pin-limit" role="alert">
                        Maximum of {MAX_GRAIL_PINS} Grail Targets already pinned — unpin one on Home or its article.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    class={`wiki-btn grail-pin-btn ${isPinned ? 'is-pinned' : 'primary'}`}
                    aria-pressed={isPinned}
                    onClick={onTogglePin}
                  >
                    {isPinned ? '🎯 Pinned Grail Target (Unpin)' : 'Pin Grail Target (🎯)'}
                  </button>
                </div>
              )}
            </section>
          )}
          <div class="wiki-article-layout">
            <aside
              class={`wiki-infobox ${entry.tags.rarity ? `rarity-${entry.tags.rarity}` : ''}`.trim()}
              aria-label="Article infobox"
            >
              <div class="infobox-title">{entry.title}</div>
              <div class="infobox-media">
                <div class="infobox-portrait-frame">
                  {entry.sprite && <span class="infobox-media-kicker">Portrait</span>}
                  <WikiPicture img={entry.img} type={entry.type} alt={entry.title} size={180} />
                </div>
                {entry.sprite && (
                  <div class="infobox-figure-panel">
                    <div class="infobox-figure-head">
                      <span class="infobox-sprite-label">In-game figure</span>
                      {entry.sprite.turnaround && entry.sprite.turnaround.length > 1 && (
                        <span class="infobox-figure-badge">Turnaround</span>
                      )}
                    </div>
                    <WikiSpriteTurnaround
                      img={entry.sprite}
                      type={entry.type}
                      alt={`${entry.title} in-game figure`}
                      stageSize={96}
                      thumbSize={44}
                    />
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
                              <th key={ci} scope="col">
                                {col}
                              </th>
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
                  <p class="wiki-muted">
                    Browse the <a href={`#/${sec.route}`}>{sec.label}</a> index for more entries.
                  </p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
