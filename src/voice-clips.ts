import voiceClips from './data/voice-clips.json' with { type: 'json' };

export const VOICE_CLIP_IDS: readonly string[] = voiceClips.VOICE_CLIP_IDS;
export const MAP_VOICE_INDEX: Readonly<Record<string, string>> = voiceClips.MAP_VOICE_INDEX;
export const BARK_VOICE_INDEX: Readonly<Record<string, string>> = voiceClips.BARK_VOICE_INDEX;
export const TEXT_VOICE_INDEX: Readonly<Record<string, string>> = voiceClips.TEXT_VOICE_INDEX;
