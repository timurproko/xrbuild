/** Synthetic geometry and realistic latency only. No provider, model, device or installation. */
import { meshPacket, readMeshPacket, encodeMeshResult } from '../../../sdk/src/hand-mesh-protocol.ts';
import { surfaceFor } from '../../../sdk/test/mesh-motion-bench.ts';
let bytes = Buffer.alloc(0), configuration: any = null;
process.stdin.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk]);
  while (bytes.length >= 12) {
    const size = 12 + bytes.readUInt32LE(4) + bytes.readUInt32LE(8); if (bytes.length < size) return;
    const { meta } = readMeshPacket(bytes.subarray(0, size)); bytes = bytes.subarray(size);
    if (meta.type === 'stop') process.exit(0);
    if (meta.type === 'start' || meta.type === 'configure') {
      configuration = meta;
      process.stdout.write(meshPacket({ type: meta.type === 'start' ? 'ready' : 'configured', version: 2, runId: meta.runId, owner: meta.owner, id: meta.id, settingsVersion: meta.settingsVersion, settingsGeneration: meta.settingsGeneration, settings: meta.settings, ...(meta.type === 'start' ? { capabilities: meta.capabilities } : {}) }));
    }
    if (meta.type === 'frame' && configuration) {
      const delay = meta.sequence % 100 === 0 ? 80 : [18, 20, 23, 26, 29, 33, 22][meta.sequence % 7];
      setTimeout(() => process.stdout.write(encodeMeshResult({ type: 'result', version: 2, runId: meta.runId, settingsGeneration: meta.settingsGeneration, epoch: meta.epoch, sequence: meta.sequence, revision: meta.revision, meshes: meta.hands.map(surfaceFor) })), delay);
    }
  }
});
process.stdin.on('end', () => process.exit(0));
