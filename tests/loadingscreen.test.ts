import { afterEach, describe, expect, it } from 'vitest';
import { LOADING_SCENES, LoadingScreen } from '../src/loadingscreen';

interface MockEl {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  hidden: boolean;
  src: string;
  alt: string;
  type?: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  children: MockEl[];
  classList: {
    add: (...cls: string[]) => void;
    remove: (...cls: string[]) => void;
    contains: (cls: string) => boolean;
  };
  setAttribute: (k: string, v: string) => void;
  append: (...nodes: MockEl[]) => void;
  replaceChildren: (...nodes: MockEl[]) => void;
  remove: () => void;
  onclick: (() => void) | null;
}

function makeMockDoc() {
  const mk = (tag: string): MockEl => {
    const classes = new Set<string>();
    const el: MockEl = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      hidden: false,
      src: '',
      alt: '',
      style: {},
      attributes: {},
      children: [],
      classList: {
        add: (...cls) => {
          for (const c of cls) classes.add(c);
          el.className = [...classes].join(' ');
        },
        remove: (...cls) => {
          for (const c of cls) classes.delete(c);
          el.className = [...classes].join(' ');
        },
        contains: (c) => classes.has(c) || el.className.split(/\s+/).includes(c),
      },
      setAttribute: (k, v) => { el.attributes[k] = v; },
      append: (...nodes) => { el.children.push(...nodes); },
      replaceChildren: (...nodes) => { el.children = [...nodes]; },
      remove: () => {},
      onclick: null,
    };
    return el;
  };
  const body = mk('body');
  const findClass = (root: MockEl, cls: string): MockEl | null => {
    if (root.className.split(/\s+/).includes(cls)) return root;
    for (const c of root.children) {
      const hit = findClass(c, cls);
      if (hit) return hit;
    }
    return null;
  };
  return {
    createElement: mk,
    body,
    findClass,
  };
}

describe('LoadingScreen', () => {
  const prevDoc = globalThis.document;

  afterEach(() => {
    (globalThis as unknown as { document: unknown }).document = prevDoc;
  });

  it('mounts with rotating scenes, bundled tip, and updates status', () => {
    const doc = makeMockDoc();
    (globalThis as unknown as { document: unknown }).document = doc;
    const ls = new LoadingScreen({ campaign: 'm01-blood-at-the-ford', baseUrl: '/thornvael/' });
    expect(LOADING_SCENES.length).toBeGreaterThanOrEqual(4);
    expect(doc.body.children.length).toBe(1);
    const root = doc.body.children[0];
    expect(root.id).toBe('tv-loading-screen');
    expect((doc.findClass(root, 'tv-loading-tip')?.textContent.length ?? 0)).toBeGreaterThan(10);

    ls.setStatus('Forging terrain...', 65);
    expect(doc.findClass(root, 'tv-loading-status')?.textContent).toBe('Forging terrain...');
    expect(doc.findClass(root, 'tv-loading-bar-fill')?.style.width).toBe('65%');
    ls.hide();
    expect(root.classList.contains('is-hiding')).toBe(true);
  });

  it('displays recoverable error controls on failure', () => {
    const doc = makeMockDoc();
    (globalThis as unknown as { document: unknown }).document = doc;
    const ls = new LoadingScreen({ baseUrl: '/thornvael/' });
    ls.showError('WebGL unavailable');
    const root = doc.body.children[0];
    const errBox = doc.findClass(root, 'tv-loading-error');
    expect(errBox?.hidden).toBe(false);
    expect(errBox?.children[0]?.textContent).toContain('WebGL unavailable');
    expect(errBox?.children[1]?.children.length).toBe(2);
    ls.hide();
  });
});
