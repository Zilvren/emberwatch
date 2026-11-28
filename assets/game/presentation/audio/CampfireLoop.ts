import { assetManager, resources } from 'cc';

/** Decode the bundled fireplace recording into the same Web Audio mix as the game. */
export async function loadCampfireLoop(context: AudioContext): Promise<AudioBuffer> {
    const clip = resources.getInfoWithPath('audio/campfire');
    if (!clip) throw new Error('Missing campfire recording');
    const url = assetManager.utils.getUrlWithUuid(clip.uuid, { isNative: true, nativeExt: '.wav' });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Campfire recording returned ${response.status}`);
    return context.decodeAudioData(await response.arrayBuffer());
}
