// Isolated second process: actual pinned registration/acquisition, not parent-authored ownership records.
const context = await import(process.argv[2]), liveness = await import(process.argv[3]);
process.on('message', async ({ id, operation, identity, options, target, delayMs }) => {
  try {
    let result;
    if (operation === 'register') result = await context.registerSessionRepositoryRuntime(identity, options.runtimeId,
      { pid: process.pid, startIdentity: liveness.PID_LIVENESS_IDENTITY }, options);
    else if (operation === 'attach' || operation === 'attach-after-delay') {
      if (operation === 'attach-after-delay') { if (delayMs !== 11_500) throw Error('Invalid isolated delay'); await new Promise(resolve => setTimeout(resolve, delayMs)); }
      result = await context.setSessionRepositoryContext(identity, target, options);
    }
    else if (operation === 'detach') result = await context.clearSessionRepositoryContext(identity, options);
    else throw Error('Unknown isolated owner operation');
    process.send({ id, result });
  } catch (error) { process.send({ id, error: { message: error.message, code: error.code } }); }
});
process.stdin.resume(); process.stdin.on('end', () => process.exit(0));
process.send({ ready: true });
