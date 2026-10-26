export const GROUP_COUNT = 9;
const DOUBLE_PRESS_MS = 350;

/** Control groups 1..9: remembered sets of unit ids. Pure state, no DOM. */
export class ControlGroups {
  private readonly groups: number[][] = Array.from({ length: GROUP_COUNT + 1 }, () => []);
  private lastPress: number[] = Array(GROUP_COUNT + 1).fill(-Infinity);

  /** Replace group `n` (1..9) with these ids. An empty selection clears the group. */
  set(n: number, ids: Iterable<number>): void {
    this.groups[n] = [...new Set(ids)].sort((a, b) => a - b);
  }

  /** Add ids to group `n`, keeping what is already in it. */
  add(n: number, ids: Iterable<number>): void {
    this.groups[n] = [...new Set([...this.groups[n], ...ids])].sort((a, b) => a - b);
  }

  get(n: number): readonly number[] {
    return this.groups[n];
  }

  size(n: number): number {
    return this.groups[n].length;
  }

  /**
   * A press of the group key or button: the first press recalls the group (select it),
   * a second press within 350 ms centres the camera on it.
   */
  press(n: number, now: number): 'recall' | 'center' {
    const again = now - this.lastPress[n] <= DOUBLE_PRESS_MS;
    this.lastPress[n] = again ? -Infinity : now;
    return again ? 'center' : 'recall';
  }
}
