import { Container, Graphics } from 'pixi.js';
import { UnitAtlas, UnitSprite } from './units';

/** Opt-in art inspection inside the game (?art=1). Uses the actual shared GPU
 * sources and UnitSprite path. Changes presentation only, never simulation state.
 */
export class ArtPreview {
  readonly layer = new Container();
  private readonly units: UnitSprite[];
  private readonly controls = document.createElement('aside');
  private readonly inputs: HTMLSelectElement[] = [];
  constructor(atlases: readonly UnitAtlas[]) {
    this.layer.addChild(new Graphics().roundRect(0, 0, 300, 160, 8).fill({ color: 0x201c24, alpha: 0.96 }));
    this.units = atlases.map((atlas, i) => {
      const unit = new UnitSprite(atlas);
      unit.position.set(50 + i * 100, 150); unit.scale.set(1.6);
      this.layer.addChild(unit);
      return unit;
    });
    this.controls.setAttribute('aria-label', 'Unit art preview');
    this.controls.style.cssText = 'position:fixed;left:8px;top:170px;z-index:50;background:#201c24;color:#eee;padding:6px;max-width:300px;font:14px system-ui;';
    const caption = document.createElement('div');
    caption.textContent = 'Hero · Archer · Golem'; this.controls.append(caption);
    const definitions: [string, string[]][] = [
      ['Facing', Array.from({ length: 16 }, (_, i) => `${i} (${i * 22.5}° from east)`)],
      ['Animation', ['Stand', 'Walk']], ['Team', ['Blue', 'Red', 'Green', 'Violet']],
      ['Armour', ['None', 'Iron', 'Bronze', 'Silver', 'Gold', 'Crystal']],
      ['Monster level', ['1', '2', '3', '4', '5']],
    ];
    for (const [name, values] of definitions) {
      const label = document.createElement('label'); label.textContent = name;
      label.style.cssText = 'display:inline-flex;flex-direction:column;margin:2px';
      const select = document.createElement('select'); select.setAttribute('aria-label', name);
      select.style.cssText = 'min-height:44px;min-width:84px;font:14px system-ui';
      values.forEach((text, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = text; select.append(option); });
      label.append(select); this.controls.append(label); this.inputs.push(select);
    }
    // Gameplay hotkeys must not fire while operating preview form controls.
    this.controls.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(this.controls);
    // Keep models clear of the DOM command bar and the preview form on the left.
    this.layer.position.set(318, 100);
  }

  draw(tick: number): void {
    const [dir, moving, team, armour, level] = this.inputs.map((s) => Number(s.value));
    for (const unit of this.units) unit.update(tick, !!moving, dir, team, armour, level + 1, false);
  }

  inspect() { return this.units.map((unit) => unit.inspect()); }
}
