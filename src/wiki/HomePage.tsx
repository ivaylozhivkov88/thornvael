import { useEffect, useMemo, useState } from 'preact/hooks';
import { WIKI_INDEX } from './dataLoader';
import {
  findIndexEntryForPin,
  GRAIL_UPDATED_EVENT,
  type GrailSnapshot,
  getGrailSummary,
  loadGrailSnapshot,
  lookupGrailStatus,
  MAX_GRAIL_PINS,
  unpinGrailTarget,
} from './grail-status';
import { TYPE_LABEL, WIKI_SECTIONS } from './sections';
import type { WikiIndexEntry } from './types';
import { WikiPicture } from './WikiPicture';

export function HomePage() {
  const counts = WIKI_INDEX.counts ?? {};
  const total = WIKI_INDEX.entries.length;
  const sectionCount = (types: readonly string[]) =>
    types.reduce((sum, t) => sum + WIKI_INDEX.entries.filter((e) => e.t === t).length, 0);

  const [grailSnap, setGrailSnap] = useState<GrailSnapshot>(() => loadGrailSnapshot());
  const [pinnedOnly, setPinnedOnly] = useState(false);

  useEffect(() => {
    const sync = () => setGrailSnap(loadGrailSnapshot());
    window.addEventListener('storage', sync);
    window.addEventListener(GRAIL_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(GRAIL_UPDATED_EVENT, sync);
    };
  }, []);

  const summary = useMemo(() => getGrailSummary(WIKI_INDEX.entries, grailSnap), [grailSnap]);

  const pinnedEntries = useMemo(() => {
    const out: { pinId: string; entry?: WikiIndexEntry; discovered: boolean }[] = [];
    for (const pin of summary.pins) {
      const entry = findIndexEntryForPin(pin, WIKI_INDEX.entries);
      const discovered = entry
        ? lookupGrailStatus(grailSnap, {
            id: entry.id,
            type: entry.t,
            title: entry.n,
            codexId: entry.tag.codexId,
          }).discovered
        : false;
      out.push({ pinId: pin, entry, discovered });
    }
    return out;
  }, [summary.pins, grailSnap]);

  const handleUnpin = (pinId: string) => {
    unpinGrailTarget(pinId);
    setGrailSnap(loadGrailSnapshot());
  };

  return (
    <div class="wiki-home">
      <section class="wiki-hero-banner">
        <div class="wiki-hero-copy">
          <span class="wiki-badge">Offline Chronicle &amp; Reference</span>
          <h1>Thornvael Compendium</h1>
          <p>
            Official game-data encyclopedia generated directly from Thornvael&apos;s combat, item, map, and lore tables.
            Explore <strong>{total.toLocaleString()}</strong> verified entries across all four acts.
          </p>
        </div>
        <div class="wiki-hero-stats">
          <div class="stat-box">
            <strong>{counts.bestiary ?? 52}</strong>
            <span>Creatures &amp; Bosses</span>
          </div>
          <div class="stat-box">
            <strong>{(counts.items ?? 0) + (counts.uniques ?? 0) + (counts.sets ?? 0)}</strong>
            <span>Items, Uniques &amp; Sets</span>
          </div>
          <div class="stat-box">
            <strong>{(counts.spells ?? 0) + (counts.skills ?? 0)}</strong>
            <span>Spells &amp; Skills</span>
          </div>
          <div class="stat-box">
            <strong>{counts.missions ?? 46}</strong>
            <span>Campaign Missions</span>
          </div>
        </div>
      </section>

      <section class="wiki-grail-home" aria-label="Imperial Holy Grail Progress">
        <div class="grail-home-head">
          <div>
            <h2>🏆 Imperial Holy Grail Progress</h2>
            <p class="wiki-muted grail-home-sub">
              {summary.discoveredCount} / {summary.totalCount} tracked collectibles ({summary.pct}%) ·{' '}
              <a href="#/glossary/holy-grail-tomes">Read Five Tomes Guide</a>
            </p>
          </div>
          <fieldset class="grail-home-filters" aria-label="Holy Grail view filter">
            <button
              type="button"
              class={`wiki-tab ${!pinnedOnly ? 'active' : ''}`}
              aria-pressed={!pinnedOnly}
              onClick={() => setPinnedOnly(false)}
            >
              All Tomes
            </button>
            <button
              type="button"
              class={`wiki-tab ${pinnedOnly ? 'active' : ''}`}
              aria-pressed={pinnedOnly}
              onClick={() => setPinnedOnly(true)}
            >
              🎯 Pinned Targets ({summary.pins.length}/{MAX_GRAIL_PINS})
            </button>
          </fieldset>
        </div>

        <div
          class="grail-progress-bar"
          role="progressbar"
          aria-label="Imperial Holy Grail completion"
          aria-valuenow={summary.pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="grail-progress-fill" style={{ width: `${summary.pct}%` }} />
        </div>

        {!pinnedOnly ? (
          <div class="grail-tome-strip">
            <a class="grail-tome-pill" href="#/uniques">
              <span>Tome I · Uniques</span>
              <strong>
                {summary.tomes.uniques.discovered}/{summary.tomes.uniques.total}
              </strong>
            </a>
            <a class="grail-tome-pill" href="#/sets">
              <span>Tome II · Sets</span>
              <strong>
                {summary.tomes.sets.discovered}/{summary.tomes.sets.total}
              </strong>
            </a>
            <a class="grail-tome-pill" href="#/gems">
              <span>Tome III · Runes &amp; Gems</span>
              <strong>
                {summary.tomes.gems.discovered}/{summary.tomes.gems.total}
              </strong>
            </a>
            <a class="grail-tome-pill" href="#/bestiary">
              <span>Tome IV · Bestiary</span>
              <strong>
                {summary.tomes.bestiary.discovered}/{summary.tomes.bestiary.total}
              </strong>
            </a>
            <a class="grail-tome-pill" href="#/items">
              <span>Tome V · Armory</span>
              <strong>
                {summary.tomes.items.discovered}/{summary.tomes.items.total}
              </strong>
            </a>
          </div>
        ) : null}

        {(pinnedOnly || pinnedEntries.length > 0) && (
          <div class="grail-pinned-wrap">
            {pinnedEntries.length === 0 ? (
              <p class="wiki-muted grail-pinned-empty">
                No Grail targets pinned yet. Open any undiscovered <a href="#/uniques">Unique</a>,{' '}
                <a href="#/sets">Set</a>, or <a href="#/gems">Rune / Runeword</a> page and click{' '}
                <strong>Pin Grail Target (🎯)</strong> (max {MAX_GRAIL_PINS}).
              </p>
            ) : (
              <div class="grail-pinned-grid">
                {pinnedEntries.map(({ pinId, entry, discovered }) => (
                  <div key={pinId} class={`grail-pinned-card ${discovered ? 'is-discovered' : ''}`.trim()}>
                    {entry ? (
                      <a class="grail-pinned-link" href={`#/${entry.r}`}>
                        <WikiPicture img={entry.img} type={entry.t} alt={entry.n} size={40} />
                        <div class="grail-pinned-meta">
                          <span class="chip-type">{TYPE_LABEL[entry.t]}</span>
                          <strong>{entry.n}</strong>
                          <span class="grail-pinned-state">{discovered ? '🏆 Found' : '🎯 Hunting'}</span>
                        </div>
                      </a>
                    ) : (
                      <span class="grail-pinned-meta">
                        <strong>{pinId}</strong>
                        <span class="grail-pinned-state">🎯 Pinned</span>
                      </span>
                    )}
                    <button
                      type="button"
                      class="grail-unpin-btn"
                      aria-label={`Unpin ${entry?.n ?? pinId}`}
                      onClick={() => handleUnpin(pinId)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section class="wiki-sec">
        <h2>Compendium Sections</h2>
        <div class="wiki-section-grid">
          {WIKI_SECTIONS.filter((s) => s.id !== 'home').map((sec) => {
            const cnt = sectionCount(sec.types);
            return (
              <a key={sec.id} class="wiki-sec-card" href={`#/${sec.route}`}>
                <div class="sec-card-top">
                  <span class="sec-icon" aria-hidden="true">
                    {sec.icon}
                  </span>
                  <span class="sec-count">{cnt}</span>
                </div>
                <h3>{sec.label}</h3>
                <p>{sec.desc}</p>
              </a>
            );
          })}
        </div>
      </section>

      <section class="wiki-sec">
        <h2>Quick Starting Points</h2>
        <div class="wiki-link-grid">
          <a class="wiki-link-chip" href="#/bestiary/gnoll">
            <span class="chip-type">Bestiary</span>
            <span class="chip-name">Border Gnoll</span>
          </a>
          <a class="wiki-link-chip" href="#/bestiary/morvessa">
            <span class="chip-type">Boss</span>
            <span class="chip-name">Morvessa</span>
          </a>
          <a class="wiki-link-chip" href="#/class/warrior">
            <span class="chip-type">Class</span>
            <span class="chip-name">Warrior</span>
          </a>
          <a class="wiki-link-chip" href="#/city/thornwick">
            <span class="chip-type">City</span>
            <span class="chip-name">Thornwick</span>
          </a>
          <a class="wiki-link-chip" href="#/map/map1">
            <span class="chip-type">Map</span>
            <span class="chip-name">Act I Macro Map</span>
          </a>
          <a class="wiki-link-chip" href="#/biome/forest">
            <span class="chip-type">Biome</span>
            <span class="chip-name">Forest Skirmish</span>
          </a>
          <a class="wiki-link-chip" href="#/lore/timeline">
            <span class="chip-type">Lore</span>
            <span class="chip-name">Timeline of the Border</span>
          </a>
          <a class="wiki-link-chip" href="#/glossary/crafting-cube">
            <span class="chip-type">Glossary</span>
            <span class="chip-name">Transmutation Cube</span>
          </a>
        </div>
      </section>
    </div>
  );
}
