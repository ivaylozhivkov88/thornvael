import { WIKI_INDEX } from './dataLoader';
import { WIKI_SECTIONS } from './sections';

export function HomePage() {
  const counts = WIKI_INDEX.counts ?? {};
  const total = WIKI_INDEX.entries.length;
  const sectionCount = (types: readonly string[]) =>
    types.reduce((sum, t) => sum + WIKI_INDEX.entries.filter((e) => e.t === t).length, 0);

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

      <section class="wiki-sec">
        <h2>Compendium Sections</h2>
        <div class="wiki-section-grid">
          {WIKI_SECTIONS.filter((s) => s.id !== 'home').map((sec) => {
            const cnt = sectionCount(sec.types);
            return (
              <a key={sec.id} class="wiki-sec-card" href={`#/${sec.route}`}>
                <div class="sec-card-top">
                  <span class="sec-icon" aria-hidden="true">{sec.icon}</span>
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
