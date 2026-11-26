import { parseRecordingCsv, type PoseFrame } from './csv.ts';
import { importClip, LIMITS } from './format.ts';
import { importDepthClip, isDepthClip, decodeDepthFrame, type DepthClip } from './depth-format.ts';
import { importPair } from '../multiview/recording.ts';
import type { LiveFrame } from '../contracts.ts';
export interface ArchiveFrame { pose: PoseFrame; png?: Blob; packet?: Awaited<ReturnType<typeof decodeDepthFrame>>; metadata: unknown }
export interface ArchiveTrack { label: string; times: number[]; frame(index: number): Promise<ArchiveFrame> }
export interface RecordingArchive { kind: string; tracks: ArchiveTrack[]; original: Blob }
const pose = (observation: LiveFrame | null, timeMs: number): PoseFrame => ({ timeMs, space: 'hand-relative', hands: (observation?.hands ?? []).map(hand => ({ id: hand.id, handedness: hand.handedness?.categoryName ?? null, joints: hand.relative ?? [] })).filter(hand => hand.joints.length === 21) });
function depthTrack(clip: DepthClip, label: string): ArchiveTrack {
  const start = clip.frames[0].meta.receivedPageMs;
  return { label, times: clip.frames.map(frame => frame.meta.receivedPageMs - start), async frame(index) {
    const frame = clip.frames[index]; if (!frame) throw new Error('Frame not found.');
    // Decode original pixels/observations only. No reconstruction, re-inference or fusion.
    return { pose: pose(frame.meta.observation, frame.meta.receivedPageMs - start), packet: await decodeDepthFrame(frame), metadata: frame.meta };
  } };
}
export async function openRecordingArchive(file: Blob): Promise<RecordingArchive> {
  if (file.size < 1 || file.size > LIMITS.bytes) throw new Error('Recording exceeds its size limit.');
  const prefix = await file.slice(0, 64).text();
  if (prefix.startsWith('# xrbuild-hand-tracking-csv v1')) {
    if (file.size > 16 * 1024 * 1024) throw new Error('CSV recording exceeds 16 MiB.');
    const parsed = parseRecordingCsv(await file.text());
    return { kind: 'Pose CSV', original: file, tracks: [{ label: 'Original poses', times: parsed.frames.map(frame => frame.timeMs), async frame(index) {
      const frame = parsed.frames[index]; if (!frame) throw new Error('Frame not found.'); return { pose: frame, metadata: parsed.meta };
    } }] };
  }
  if (prefix.startsWith('XRBPAIR1')) {
    const pair = await importPair(file);
    return { kind: 'Paired RGB-D · independent streams', original: file, tracks: [depthTrack(pair.a, 'Camera A'), depthTrack(pair.b, 'Camera B')] };
  }
  if (await isDepthClip(file)) {
    const clip = await importDepthClip(file); return { kind: 'Recorded RGB-D', original: file, tracks: [depthTrack(clip, 'Original stream')] };
  }
  const clip = await importClip(file);
  return { kind: 'Recorded RGB', original: file, tracks: [{ label: 'Original stream', times: clip.frames.map(frame => frame.meta.relativeMs), async frame(index) {
    const frame = clip.frames[index]; if (!frame) throw new Error('Frame not found.');
    return { pose: pose(frame.meta.observation, frame.meta.relativeMs), png: frame.png, metadata: frame.meta };
  } }] };
}
