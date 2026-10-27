import { installData } from './sim/data';

/** Fetch the data tables next to the page (the service worker precaches them for offline play) and install them. */
export async function loadGameData(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const get = async (name: string): Promise<unknown> => {
    const r = await fetch(`${base}data/${name}.json`);
    if (!r.ok) throw new Error(`data/${name}.json: HTTP ${r.status}`);
    return r.json();
  };
  const [items, spells] = await Promise.all([get('items'), get('spells')]);
  installData({ items, spells });
}
