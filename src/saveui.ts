import { decodeSave, encodeSave, makeSave, type SaveState } from './save';
import { AUTO, deleteSave, getSave, listSaves, putSave } from './savedb';
import { S } from './strings';

/**
 * Save slots sheet, autosave, the "continue" offer on start, file export and import, and the storage
 * notes for iPhone (Safari and the home-screen app keep separate storage).
 */

export interface SaveUiCtx {
  /** The state to save, or null when this game cannot be saved (no mission or no hero). */
  capture: () => SaveState | null;
  /** Mission name, hero and time for the slot list. */
  label: () => string;
  toast: (m: string, action?: { label: string; run: () => void }) => void;
  onOpen: () => void;
  standalone: boolean;
  ios: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function button(text: string, onclick: () => void): HTMLButtonElement {
  const b = el('button', '', text);
  b.type = 'button';
  b.onclick = onclick;
  return b;
}

const NOTE_KEY = 'thornvael.storageNote';
export const loadSlot = (id: string): void => {
  location.search = `?load=${encodeURIComponent(id)}`;
};

export class SaveUi {
  private readonly root: HTMLElement;
  private persisted: boolean | null = null;

  constructor(private readonly ctx: SaveUiCtx) {
    this.root = el('div', 'sheet saves');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', S.save.title);
    this.root.hidden = true;
    document.body.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else void this.show();
  }

  close(): void {
    this.root.hidden = true;
  }

  async show(): Promise<void> {
    this.root.hidden = false;
    this.ctx.onOpen();
    await this.render();
  }

  /** Ask once for persistent storage; browsers grant it by their own rules. */
  private async persist(): Promise<void> {
    if (this.persisted !== null) return;
    try {
      this.persisted = (await navigator.storage?.persist?.()) ?? false;
    } catch {
      this.persisted = false;
    }
  }

  async save(id: string | null, name: string, auto = false): Promise<boolean> {
    const st = this.ctx.capture();
    if (!st) {
      if (!auto) this.ctx.toast(S.save.cannot);
      return false;
    }
    try {
      await putSave(id ?? `slot-${Date.now()}`, makeSave(name, this.ctx.label(), st));
      await this.persist();
      if (!auto) this.ctx.toast(S.save.saved);
      return true;
    } catch (e) {
      if (!auto) this.ctx.toast(`${(e as Error).message}`);
      return false;
    }
  }

  autosave(): Promise<boolean> {
    return this.save(AUTO, S.save.auto, true);
  }

  private async exportSlot(id: string): Promise<void> {
    const s = await getSave(id);
    if (!s) return;
    const blob = new Blob([encodeSave(s)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `thornvael-${s.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'save'}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  private importFile(): void {
    const input = el('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const s = decodeSave(await f.text());
        await putSave(`slot-${Date.now()}`, s);
        await this.persist();
        this.ctx.toast(S.save.imported);
        await this.render();
      } catch (e) {
        this.ctx.toast(`${S.save.loadFailed} ${(e as Error).message}`);
      }
    };
    input.click();
  }

  private async render(): Promise<void> {
    const r = this.root;
    r.replaceChildren();
    const head = el('div', 'sheet-head');
    head.append(el('h2', '', S.save.title), el('span', 'spacer'), button(S.hero.close, () => this.close()));
    r.append(head);
    const can = this.ctx.capture() !== null;
    const row = el('div', 'row');
    const name = el('input');
    name.type = 'text';
    name.placeholder = S.save.name;
    name.value = this.ctx.label().split(',')[0];
    name.maxLength = 40;
    const saveNew = button(S.save.saveNew, () => void this.save(null, name.value.trim() || S.save.title).then(() => this.render()));
    saveNew.disabled = !can;
    row.append(name, saveNew);
    r.append(can ? row : el('p', 'note', S.save.cannot));
    const list = el('div', 'lines');
    let slots: Awaited<ReturnType<typeof listSaves>> = [];
    try {
      slots = await listSaves();
    } catch (e) {
      r.append(el('p', 'note', (e as Error).message));
    }
    for (const s of slots) {
      const line = el('div', 'line slot');
      const info = el('span', 'grow');
      info.append(el('b', '', s.id === AUTO ? S.save.auto : s.name), el('br'), el('small', '', `${s.label} · ${new Date(s.createdAt).toLocaleString()}`));
      line.append(info, button(S.save.load, () => loadSlot(s.id)));
      if (s.id !== AUTO && can) line.append(button(S.save.overwrite, () => void this.save(s.id, s.name).then(() => this.render())));
      line.append(button(S.save.exportFile, () => void this.exportSlot(s.id)));
      line.append(
        button(S.save.del, () => {
          if (!confirm(S.save.confirmDel)) return;
          void deleteSave(s.id).then(() => {
            this.ctx.toast(S.save.deleted);
            return this.render();
          });
        }),
      );
      list.append(line);
    }
    r.append(slots.length ? list : el('p', 'note', S.save.empty));
    const tools = el('div', 'row');
    tools.append(button(S.save.importFile, () => this.importFile()));
    r.append(tools);
    if (this.ctx.ios) r.append(el('p', 'note', this.ctx.standalone ? S.save.noteApp : S.save.noteSafari));
    const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
    r.append(el('p', 'note', persisted ? S.save.persisted : S.save.notPersisted));
  }

  /**
   * On start: offer to continue the autosave (unless a save is being loaded), and show the iPhone
   * storage note once per context when it applies.
   */
  async greet(loading: boolean): Promise<void> {
    let slots: Awaited<ReturnType<typeof listSaves>> = [];
    try {
      slots = await listSaves();
    } catch {
      return;
    }
    if (!loading && slots.some((s) => s.id === AUTO)) this.ctx.toast(S.save.resume, { label: S.save.resumeBtn, run: () => loadSlot(AUTO) });
    let shown = false;
    try {
      shown = localStorage.getItem(NOTE_KEY) === '1';
    } catch {
      /* private mode */
    }
    if (this.ctx.ios && !shown && (this.ctx.standalone ? slots.length === 0 : slots.length > 0)) {
      if (!loading) setTimeout(() => this.ctx.toast(this.ctx.standalone ? S.save.noteApp : S.save.noteSafari), 3500);
      try {
        localStorage.setItem(NOTE_KEY, '1');
      } catch {
        /* private mode */
      }
    }
  }
}
