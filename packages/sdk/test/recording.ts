// Reader for .hands recordings written by xrb-host --record-hands (native/host/src/hand_recording.h).
import { readFileSync } from 'node:fs';
import { decodeMessage, MSG_HANDS, type HandsMessage } from '../src/protocol.ts';

export function readHandsRecording(path: string): HandsMessage[] {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8).toString('latin1') !== 'WBHANDS1') throw new Error(`${path}: not a .hands file`);
  const out: HandsMessage[] = [];
  let i = 8;
  while (i + 4 <= buf.length) {
    const len = buf.readUInt32LE(i);
    const bytes = buf.subarray(i + 4, i + 4 + len);
    i += 4 + len;
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const m = decodeMessage(ab);
    if (m && m.type === MSG_HANDS) out.push(m as HandsMessage);
  }
  return out;
}
