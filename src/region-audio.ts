import type { Region } from './mapdoc';

export interface RegionAudioTarget {
  music: string;
  ambience: string;
}

export interface CrossfadeGains {
  prevGain: number;
  nextGain: number;
  switched: boolean;
}

/** Resolve active music and ambience cue names for a region with biome fallbacks. */
export function resolveRegionAudio(
  region: Region | undefined,
  defaultMusic = 'mus_act1_march',
  defaultAmbience = 'amb_forest_wind',
): RegionAudioTarget {
  return {
    music: region?.music || defaultMusic,
    ambience: region?.ambience || defaultAmbience,
  };
}

/** Equal-power crossfade gains for progress in [0, 1]. */
export function computeAudioCrossfade(
  prevTrack: string,
  nextTrack: string,
  progress01: number,
): CrossfadeGains {
  if (prevTrack === nextTrack) {
    return { prevGain: 1, nextGain: 1, switched: false };
  }
  const t = Math.max(0, Math.min(1, progress01));
  const angle = t * (Math.PI / 2);
  return {
    prevGain: Number(Math.cos(angle).toFixed(4)),
    nextGain: Number(Math.sin(angle).toFixed(4)),
    switched: true,
  };
}
