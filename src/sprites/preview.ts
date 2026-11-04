import { Container, Graphics } from 'pixi.js';
import { UnitAtlas, UnitSprite } from './units';
import type { AnimationPose } from './combat-animation';

const CLIPS = ['stand', 'walk', 'attack', 'cast', 'hurt', 'die'] as const;
const COUNTS = [4, 8, 4, 4, 2, 4];
const PERIODS = [10, 3, 2, 2, 3, 3];

/** Opt-in art inspection inside the game (?art=1). Uses the actual shared GPU
 * sources and UnitSprite path. Changes presentation only, never simulation state.
 */
export class ArtPreview {
  readonly layer = new Container();
  private readonly units: UnitSprite[];
  private readonly controls = document.createElement('aside');
  private readonly inputs: HTMLSelectElement[] = [];
  private readonly status = document.createElement('div');
  private readonly pose: AnimationPose = { clip: 'stand', frame: 0, age: 0, finished: false, unresolved: false };
  private restart = true;
  private started = 0;
  private lastStatus = '';
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
      ['Animation', ['Stand', 'Walk', 'Attack', 'Cast', 'Hurt', 'Die']], ['Team', ['Blue', 'Red', 'Green', 'Violet']],
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
    this.inputs[1].addEventListener('change', () => { this.restart = true; });
    const replay = document.createElement('button');
    replay.textContent = 'Replay animation';
    replay.style.cssText = 'min-height:44px;min-width:44px';
    replay.onclick = () => { this.restart = true; };
    this.controls.append(replay, this.status);
    this.status.setAttribute('role', 'status');
    this.status.style.cssText = 'max-width:290px;font-size:12px';
    // Gameplay hotkeys must not fire while operating preview form controls.
    this.controls.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(this.controls);
    // Keep models clear of the DOM command bar and the preview form on the left.
    this.layer.position.set(318, 100);
  }

  draw(tick: number): void {
    const [dir, anim, team, armour, level] = this.inputs.map((s) => Number(s.value));
    if (this.restart) { this.started = tick; this.restart = false; }
    const age = Math.max(0, tick - this.started);
    this.pose.clip = CLIPS[anim]; this.pose.age = age;
    this.pose.finished = anim >= 2 && age >= COUNTS[anim] * PERIODS[anim];
    this.pose.frame = anim < 2 ? Math.floor(age / PERIODS[anim]) % COUNTS[anim]
      : Math.min(COUNTS[anim] - 1, Math.floor(age / PERIODS[anim]));
    for (const unit of this.units) unit.update(tick, anim === 1, dir, team, armour, level + 1, false, this.pose);
    const fallback = this.units.some((unit) => !unit.atlas.hasClip(CLIPS[anim]));
    const status = `${CLIPS[anim]}${this.pose.finished ? ' · finished' : ''}${fallback ? ' · missing clip: locomotion fallback' : ''}`;
    if (status !== this.lastStatus) { this.status.textContent = status; this.lastStatus = status; }
  }

  inspect() { return this.units.map((unit) => unit.inspect()); }
}
