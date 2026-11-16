/**
 * Hotkey Customization & Configuration Manager (Phase 11).
 * Allows players to rebind game shortcuts cleanly from the pause/options menu.
 */

export interface KeybindAction {
  id: string;
  category: 'movement' | 'combat' | 'ui';
  label: string;
  detail: string;
  defaultKey: string;
  defaultCode: string;
}

export const DEFAULT_KEYBINDS: readonly KeybindAction[] = [
  { id: 'moveUp', category: 'movement', label: 'Move Up', detail: 'Walk hero north', defaultKey: 'W', defaultCode: 'KeyW' },
  { id: 'moveLeft', category: 'movement', label: 'Move Left', detail: 'Walk hero west', defaultKey: 'A', defaultCode: 'KeyA' },
  { id: 'moveDown', category: 'movement', label: 'Move Down', detail: 'Walk hero south', defaultKey: 'S', defaultCode: 'KeyS' },
  { id: 'moveRight', category: 'movement', label: 'Move Right', detail: 'Walk hero east', defaultKey: 'D', defaultCode: 'KeyD' },
  { id: 'potion1', category: 'combat', label: 'Potion 1 (Health)', detail: 'Drink Belt Slot 1 (Healing Draught)', defaultKey: '1', defaultCode: 'Digit1' },
  { id: 'potion2', category: 'combat', label: 'Potion 2 (Mana)', detail: 'Drink Belt Slot 2 (Mana Draught)', defaultKey: '2', defaultCode: 'Digit2' },
  { id: 'potion3', category: 'combat', label: 'Potion 3 (Rejuvenation)', detail: 'Drink Belt Slot 3 (Rejuvenation Draught)', defaultKey: '3', defaultCode: 'Digit3' },
  { id: 'potion4', category: 'combat', label: 'Potion 4 (Utility)', detail: 'Drink Belt Slot 4 (Utility / Elixir)', defaultKey: '4', defaultCode: 'Digit4' },
  { id: 'recenter', category: 'movement', label: 'Recenter Camera', detail: 'Snap viewport camera directly onto your hero', defaultKey: 'Space', defaultCode: 'Space' },
  { id: 'quests', category: 'ui', label: 'Quest Journal / Tracker', detail: 'Open Gothic Quest Dossier and toggle objectives tracker', defaultKey: 'Q', defaultCode: 'KeyQ' },
  { id: 'inventory', category: 'ui', label: 'Inventory & Equipment', detail: 'Toggle Hero backpack and equipment slots', defaultKey: 'I', defaultCode: 'KeyI' },
  { id: 'spellbook', category: 'ui', label: 'Spellbook / Grimoire', detail: 'Open learned spellbook and elemental schools', defaultKey: 'S', defaultCode: 'KeyS' },
  { id: 'character', category: 'ui', label: 'Character Attributes', detail: 'Open attributes and combat ratings sheet', defaultKey: 'C', defaultCode: 'KeyC' },
  { id: 'minimap', category: 'ui', label: 'Toggle Minimap', detail: 'Toggle minimap tactical zoom and layout', defaultKey: 'M', defaultCode: 'KeyM' },
  { id: 'pause', category: 'ui', label: 'Pause / Options Menu', detail: 'Pause simulation cleanly and open settings menu', defaultKey: 'ESC', defaultCode: 'Escape' },
];

export class KeybindManager {
  private bindings: Map<string, { key: string; code: string }> = new Map();

  constructor() {
    this.load();
  }

  load(): void {
    try {
      const stored = localStorage.getItem('thornvael.customKeybinds');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          for (const action of DEFAULT_KEYBINDS) {
            if (parsed[action.id] && parsed[action.id].code) {
              this.bindings.set(action.id, {
                key: String(parsed[action.id].key),
                code: String(parsed[action.id].code),
              });
            } else {
              this.bindings.set(action.id, { key: action.defaultKey, code: action.defaultCode });
            }
          }
          return;
        }
      }
    } catch {
      // storage failed / parsing failed
    }

    // Default bindings fallback
    this.resetDefaults();
  }

  save(): void {
    try {
      const obj: Record<string, { key: string; code: string }> = {};
      for (const [id, bind] of this.bindings.entries()) {
        obj[id] = bind;
      }
      localStorage.setItem('thornvael.customKeybinds', JSON.stringify(obj));
    } catch {
      // storage unavailable
    }
  }

  resetDefaults(): void {
    this.bindings.clear();
    for (const action of DEFAULT_KEYBINDS) {
      this.bindings.set(action.id, { key: action.defaultKey, code: action.defaultCode });
    }
    this.save();
  }

  getBinding(actionId: string): { key: string; code: string } {
    return this.bindings.get(actionId) ?? { key: '?', code: 'Unknown' };
  }

  setBinding(actionId: string, key: string, code: string): void {
    this.bindings.set(actionId, { key, code });
    this.save();
  }

  matches(actionId: string, eventCode: string, eventKey?: string): boolean {
    const bind = this.getBinding(actionId);
    if (bind.code === eventCode) return true;
    if (eventKey && bind.key.toLowerCase() === eventKey.toLowerCase()) return true;
    return false;
  }
}

export const keybindManager = new KeybindManager();
