// The only test processor. No model, device, download or product installation.
import { meshPacket, readMeshPacket, encodeMeshResult } from '../../../sdk/src/hand-mesh-protocol.ts';
let bytes = Buffer.alloc(0), settings = {}, start;
process.stdin.on('end', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
process.stdout.on('error', () => process.exit(0));
const ack = (m, type) => ({ type, version: m.version, ...(m.version === 2 ? { runId: m.runId, owner: m.owner, id: m.id, settingsVersion: m.settingsVersion,
  settingsGeneration: m.settingsGeneration, settings: m.settings, ...(type === 'ready' ? { capabilities: m.capabilities } : {}) } : {}) });
process.stdin.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk]);
  while (bytes.length >= 12) {
    const size = 12 + bytes.readUInt32LE(4) + bytes.readUInt32LE(8); if (bytes.length < size) break;
    const { meta: m } = readMeshPacket(bytes.subarray(0, size)); bytes = bytes.subarray(size);
    if (m.type === 'stop') process.exit(0);
    if (m.type === 'start' || m.type === 'configure') {
      settings = m.settings; if (m.type === 'start') start = m;
      const reply = ack(m, m.type === 'start' ? 'ready' : 'configured');
      if (settings.mode === 'bad-ack') reply.runId = 'foreign';
      if (m.type === 'configure' && settings.mode === 'stale-ack') process.stdout.write(meshPacket({ ...reply, settingsGeneration: m.settingsGeneration - 1 }));
      const progress = m.version === 2 && settings.progress ? setInterval(() => process.stdout.write(meshPacket({ ...ack(m, 'preparing'), progress: .5, step: 'models' })), 100) : null;
      if (settings.mode === 'no-ack' || settings.mode === 'endless-progress') continue;
      if (settings.mode === 'early-ready') reply.settingsGeneration = 0;
      setTimeout(() => {
        if (progress) clearInterval(progress);
        process.stdout.write(meshPacket(settings.mode === 'reject' ? { ...ack(m, 'failed'), reason: 'preparation-failed' } : reply));
      }, m.type === 'configure' ? settings.ackDelay ?? 0 : settings.startDelay ?? 0);
      continue;
    }
    if (m.type !== 'frame') process.exit(2);
    if (settings.mode === 'crash') process.exit(7);
    if (start?.version === 2 && !start.capabilities.includes('final-pose-observations-v1') && m.hands.some(h => h.observations !== undefined)) process.exit(8);
    const values = { ...settings }; // Work snapshots never relabel old frames after configuration.
    setTimeout(() => {
      const count = values.vertices ?? 3;
      const meshes = m.hands.map(h => {
        const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) { positions.set(h.keypoints[i % 21], i * 3); normals[i * 3 + 2] = 1; }
        const triangles = count === 2859 ? 5692 : 1;
        const indices = new Uint32Array(triangles * 3); for (let i = 0; i < indices.length; i++) indices[i] = i % count;
        return { id: h.id, topology: `fixture-${count}`, positions, normals, indices };
      });
      const result = { type: 'result', epoch: m.epoch, sequence: m.sequence, revision: m.revision, meshes,
        ...(m.version === 2 ? { version: 2, runId: m.runId, settingsGeneration: m.settingsGeneration } : {}) };
      if (values.mode === 'wrong-epoch') result.epoch = 'retired';
      const packet = encodeMeshResult(result); if (values.mode === 'malformed') packet[0] = 0;
      process.stdout.write(packet);
    }, values.delay ?? 0);
  }
});
