import { expect, test, type Page } from '@playwright/test';
import type { CampaignRecord } from '../src/flow';
import type { SaveFile } from '../src/save';

const start = 'm01-blood-at-the-ford';
const town = 'town-thornwick';
const fen = 'm02-whispers-in-the-fen';

// Real IndexedDB, with transaction completion awaited. No application storage mocks.
async function storage(page: Page, campaign?: CampaignRecord): Promise<Record<string, SaveFile | CampaignRecord>> {
  return page.evaluate((record) => new Promise((resolve, reject) => {
    const request = indexedDB.open('thornvael', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', record ? 'readwrite' : 'readonly');
      const store = tx.objectStore('saves');
      if (record) store.put(record, 'campaign');
      const keys = store.getAllKeys();
      const values = store.getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(Object.fromEntries(keys.result.map((key, i) => [String(key), values.result[i]])));
      };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), campaign);
}

async function newCampaign(page: Page, mage: boolean): Promise<CampaignRecord> {
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.getByRole('button', { name: mage ? 'Mage' : 'Warrior', exact: true }).click();
  await page.getByRole('button', { name: mage ? 'Female' : 'Male', exact: true }).click();
  await page.getByRole('button', { name: mage ? 'Hard' : 'Easy', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('.sh-map')).toBeVisible();
  return (await storage(page)).campaign as CampaignRecord;
}

function advanceToTown(record: CampaignRecord): CampaignRecord {
  return { ...record, progress: { ...record.progress, node: town, completed: [start], unlocked: [start, town, fen], townVisits: 3 } };
}

test('actual campaign save capture → New Game B → load A restores A and exits its town safely', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/thornvael/');
  const a = advanceToTown(await newCampaign(page, true));
  // Seed earned map progress only; capture and loading run through the actual production UI.
  await storage(page, a);
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Thornwick Market/ }).click();
  await page.getByRole('button', { name: 'Enter the town', exact: true }).click();
  await page.waitForFunction(() => window.__game);
  await page.getByRole('button', { name: 'Begin the mission', exact: true }).click();
  // A returning town visit waives the opening purse/dialogue; handle either opening flow.
  await page.waitForFunction(() => window.__game!.sim.tick >= 8 || (window.__game!.sim.tick > 0 && !document.getElementById('mission')!.hidden));
  if (await page.locator('#mission').isVisible()) {
    await page.locator('#mission').getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(page.locator('#mission')).toBeHidden();
  await page.locator('#btn-saves').click();
  await page.locator('.saves input[type=text]').fill('Campaign A');
  await page.getByRole('button', { name: 'Save as new slot', exact: true }).click();
  await expect.poll(async () => Object.values(await storage(page)).filter((v) => 'name' in v && v.name === 'Campaign A').length).toBe(1);
  const entries = Object.entries(await storage(page));
  const [id, raw] = entries.find(([, value]) => 'name' in value && value.name === 'Campaign A')!;
  const captured = raw as SaveFile;
  expect(captured.saveVersion).toBe(4);
  expect(captured.state.node).toBe(town);
  expect(captured.state.campaign).toEqual(a);

  await page.goto('/thornvael/');
  const b = await newCampaign(page, false);
  expect(b.progress.unlocked).toEqual([start]);
  await expect(page.getByRole('button', { name: /Thornwick Market/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Load / Export Save', exact: true }).click();
  await page.getByRole('button', { name: /^Load: Campaign A/ }).click();
  await page.waitForURL((url) => url.searchParams.get('load') === id);
  await page.waitForFunction(() => window.__game);
  expect((await storage(page)).campaign).toEqual(a);
  await expect(page.locator('#btn-missions')).toHaveText('To the map');
  // This uses the restored in-memory record too, proving the load did not just repair IndexedDB.
  await page.locator('#btn-missions').click();
  // toMap navigates to the bare address, whose initial screen is the main menu.
  await expect(page.getByRole('button', { name: 'New Game', exact: true })).toBeVisible();
  const afterTown = (await storage(page)).campaign as CampaignRecord;
  expect(afterTown.hero).toEqual(a.hero);
  expect(afterTown.progress.difficulty).toBe(2);
  expect(afterTown.progress.completed).toEqual([start]);
  expect(afterTown.progress.townVisits).toBe(4);
  expect(afterTown.carry?.hero.cls).toBe(1);
  expect(errors).toEqual([]);
});

test('campaign-only Export All → fresh browser context → import UI restores map progress', async ({ page, browser }) => {
  await page.goto('/thornvael/');
  const a = advanceToTown(await newCampaign(page, true));
  await storage(page, a);
  await page.reload();
  await page.getByRole('button', { name: 'Storage & Offline', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all saves', exact: true }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = Buffer.concat(chunks);
  const bundle = JSON.parse(backup.toString('utf8'));
  expect(bundle).toMatchObject({ thornvaelBundle: 2, saves: [], campaign: a });

  const fresh = await browser.newContext({ viewport: { width: 900, height: 450 } });
  try {
    const restoredPage = await fresh.newPage();
    const errors: string[] = [];
    restoredPage.on('pageerror', (e) => errors.push(e.message));
    await restoredPage.goto(new URL('/thornvael/', page.url()).href);
    await expect(restoredPage.getByRole('button', { name: 'New Game', exact: true })).toBeVisible();
    expect(await storage(restoredPage)).toEqual({});
    await restoredPage.getByRole('button', { name: 'Load / Export Save', exact: true }).click();
    const oldImportButton = await restoredPage.getByRole('button', { name: 'Import a save file', exact: true }).elementHandle();
    const choosing = restoredPage.waitForEvent('filechooser');
    await restoredPage.getByRole('button', { name: 'Import a save file', exact: true }).click();
    await (await choosing).setFiles({ name: 'thornvael-all-saves.json', mimeType: 'application/json', buffer: backup });
    // The replaced button proves the async import has refreshed the shell's in-memory record too.
    await expect.poll(() => oldImportButton!.evaluate((button) => button.isConnected)).toBe(false);
    await expect.poll(async () => (await storage(restoredPage)).campaign).toEqual(a);
    expect(Object.keys(await storage(restoredPage))).toEqual(['campaign']);
    await restoredPage.getByRole('button', { name: 'Back', exact: true }).click();
    await restoredPage.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(restoredPage.locator('.sh-map')).toBeVisible();
    await expect(restoredPage.getByRole('button', { name: /Thornwick Market/ })).toBeEnabled();
    await expect(restoredPage.getByRole('button', { name: /Whispers in the Fen/ })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await fresh.close();
  }
});
