export interface ReplayableHarness<TCmd, TSnap> {
  step(cmds: readonly TCmd[]): void;
  hash(): number;
  snapshot(): TSnap;
  restore(snap: TSnap): void;
}

export interface ReplayLoggedEntry<TCmd> {
  tick: number;
  cmd: TCmd;
}

export interface ReplayVerifyResult {
  matches: boolean;
  snapshotMatches: boolean;
  hashA: number;
  hashB: number;
  snapshotHash: number;
  mismatchTick: number | null;
}

/**
 * Deterministic Command-Log Replay & Snapshot/Restore Verifier (E15).
 * Runs two fresh harnesses with identical command logs and verifies per-tick hash equality,
 * plus mid-run snapshot/restore hash invariance at `snapshotTick`.
 */
export function verifyDeterministicReplay<TCmd, TSnap>(
  createHarness: () => ReplayableHarness<TCmd, TSnap>,
  log: readonly ReplayLoggedEntry<TCmd>[],
  totalTicks: number,
  snapshotTick = Math.max(1, Math.floor(totalTicks / 2)),
): ReplayVerifyResult {
  const sorted = [...log].sort((a, b) => a.tick - b.tick);
  const simA = createHarness();
  const simB = createHarness();

  let snapSim: ReplayableHarness<TCmd, TSnap> | null = null;
  let k = 0;
  let mismatchTick: number | null = null;

  for (let t = 1; t <= totalTicks; t++) {
    const cmds: TCmd[] = [];
    while (k < sorted.length && sorted[k].tick === t) {
      cmds.push(sorted[k++].cmd);
    }
    simA.step(cmds);
    simB.step(cmds);
    snapSim?.step(cmds);

    if (mismatchTick === null && simA.hash() !== simB.hash()) {
      mismatchTick = t;
    }

    if (t === snapshotTick) {
      const snap = simA.snapshot();
      snapSim = createHarness();
      snapSim.restore(snap);
    }
  }

  const hashA = simA.hash();
  const hashB = simB.hash();
  const snapshotHash = snapSim ? snapSim.hash() : hashA;

  return {
    matches: mismatchTick === null && hashA === hashB,
    snapshotMatches: snapshotHash === hashA,
    hashA,
    hashB,
    snapshotHash,
    mismatchTick,
  };
}
