import { useState } from 'preact/hooks';
import type { WikiEntryType, WikiImage } from './types';

interface Props {
  img: WikiImage | null | undefined;
  type: WikiEntryType;
  alt: string;
  size?: number;
  className?: string;
}

const SILHOUETTE_GLYPH: Record<WikiEntryType, string> = {
  bestiary: 'M32 10c-9 0-15 7-15 15 0 6 3 10 6 13l-2 14h22l-2-14c3-3 6-7 6-13 0-8-6-15-15-15zm-6 14a3 3 0 110 6 3 3 0 010-6zm12 0a3 3 0 110 6 3 3 0 010-6z',
  item: 'M44 10L20 34l10 10L54 20 44 10zm-26 26l-8 8 10 10 8-8-10-10z',
  unique: 'M32 8l7 16 17 2-12 12 3 17-15-8-15 8 3-17-12-12 17-2 7-16z',
  set: 'M18 14h28l4 14-18 26L14 28l4-14zm6 6l-2 8 10 15 10-15-2-8H24z',
  affix: 'M32 10l18 22-18 22-18-22L32 10zm0 10l-9 12 9 12 9-12-9-12z',
  gem: 'M32 8l18 14-6 28H20L14 22 32 8z',
  spell: 'M34 8c4 10-8 14-4 24 3-4 8-5 10-12 6 6 8 14 4 22-4 8-12 12-18 10-10-3-14-16-8-26 4-7 10-12 16-18z',
  skill: 'M32 10l8 14 14 8-14 8-8 14-8-14-14-8 14-8 8-14z',
  class: 'M32 10a10 10 0 100 20 10 10 0 000-20zm-16 40c0-9 7-16 16-16s16 7 16 16H16z',
  merc: 'M32 10a10 10 0 100 20 10 10 0 000-20zm-16 40c0-9 7-16 16-16s16 7 16 16H16z',
  city: 'M12 52V28l8-6v-8h6v6l6-6 6 6v-6h6v8l8 6v24H12zm14 0V38h12v14H26z',
  map: 'M10 16l15-5 14 6 15-5v36l-15 5-14-6-15 5V16z',
  region: 'M10 46L24 22l10 12 10-16 10 28H10z',
  biome: 'M10 46L24 22l10 12 10-16 10 28H10z',
  mission: 'M18 10v44h6V32l24-9-24-13h-6z',
  lore: 'M16 12h30a4 4 0 014 4v34a4 4 0 01-4 4H16a4 4 0 01-4-4V16a4 4 0 014-4zm6 12h20v4H22v-4zm0 10h20v4H22v-4z',
  achievement: 'M20 12h24v12a12 12 0 01-24 0V12zm-8 4h8v8a8 8 0 01-8-8zm32 0h8a8 8 0 01-8 8v-8zM28 36h8v8h8v8H20v-8h8v-8z',
  tip: 'M32 10a14 14 0 00-7 26v6h14v-6a14 14 0 00-7-26zm-5 38h10v4H27v-4z',
  glossary: 'M14 14h16a6 6 0 016 6v30a4 4 0 00-4-4H14V14zm36 0H34a6 6 0 00-6 6v30a4 4 0 014-4h18V14z',
};

export function WikiPicture({ img, type, alt, size = 160, className = '' }: Props) {
  const [failed, setFailed] = useState(false);

  if (!img || failed) {
    return (
      <div
        class={`wiki-placeholder ${className}`.trim()}
        style={{ width: `${size}px`, height: `${size}px` }}
        role="img"
        aria-label={`${alt} placeholder`}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d={SILHOUETTE_GLYPH[type] ?? SILHOUETTE_GLYPH.lore} fill="currentColor" />
        </svg>
        {size >= 96 && <span class="wiki-placeholder-tag">No art yet</span>}
      </div>
    );
  }

  const base = import.meta.env.BASE_URL ?? '/';
  const url = `${base}${img.src.replace(/^\/+/, '')}`;

  if (img.atlas) {
    const { x, y, w, h, sw, sh } = img.atlas;
    const scale = size / Math.max(w, h);
    const boxW = Math.round(w * scale);
    const boxH = Math.round(h * scale);
    return (
      <div
        class={`wiki-atlas-pic ${className}`.trim()}
        role="img"
        aria-label={alt}
        style={{
          width: `${boxW}px`,
          height: `${boxH}px`,
          backgroundImage: `url("${url}")`,
          backgroundSize: `${(sw * scale).toFixed(2)}px ${(sh * scale).toFixed(2)}px`,
          backgroundPosition: `${(-x * scale).toFixed(2)}px ${(-y * scale).toFixed(2)}px`,
        }}
      />
    );
  }

  const isItemIcon = img.src.startsWith('itemicons/');
  const hiResIcon = isItemIcon && size >= 96;

  return (
    <img
      class={`wiki-img ${isItemIcon ? 'is-item-icon' : ''} ${hiResIcon ? 'is-hires-icon' : ''} ${className}`.trim()}
      src={url}
      alt={alt}
      width={hiResIcon ? size : undefined}
      height={hiResIcon ? size : undefined}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
