import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TutorialStep {
  id: string;
  order: number;
  minuteMark: number;
  title: string;
  popup: {
    heading: string;
    body: string;
    position: 'bottom-center' | 'top-right' | 'top-center' | 'bottom-left';
    dismissable: boolean;
  };
  trigger: {
    type: string;
    [key: string]: unknown;
  };
  next: string | null;
}

interface TutorialDoc {
  version: number;
  title: string;
  estimatedMinutes: number;
  steps: TutorialStep[];
}

const DATA_PATH = resolve(__dirname, '..', 'src', 'data', 'tutorial.json');

describe('First-10-Minutes Tutorial Schema', () => {
  const doc = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as TutorialDoc;

  it('covers a complete 10-minute onboarding chain with valid triggers and next links', () => {
    expect(doc.version).toBe(1);
    expect(doc.estimatedMinutes).toBe(10);
    expect(doc.steps.length).toBeGreaterThanOrEqual(8);

    const ids = new Set(doc.steps.map((s) => s.id));
    expect(ids.size).toBe(doc.steps.length);

    for (let i = 0; i < doc.steps.length; i++) {
      const s = doc.steps[i];
      expect(s.order).toBe(i + 1);
      expect(s.minuteMark).toBeGreaterThan(0);
      expect(s.minuteMark).toBeLessThanOrEqual(10);
      expect(s.title.trim().length).toBeGreaterThan(3);
      expect(s.popup.heading.trim().length).toBeGreaterThan(3);
      expect(s.popup.body.trim().length).toBeGreaterThan(20);
      expect(typeof s.popup.dismissable).toBe('boolean');
      expect(typeof s.trigger.type).toBe('string');
      expect(s.trigger.type.length).toBeGreaterThan(2);

      if (i < doc.steps.length - 1) {
        expect(s.next).toBe(doc.steps[i + 1].id);
        expect(ids.has(s.next!)).toBe(true);
      } else {
        expect(s.next).toBeNull();
      }
    }
  });
});
