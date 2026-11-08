// A skipped selected gate is not a successful required aggregate. Drafts emit no aggregate.
export function requiredProblems(needs, event) {
  const problems = [];
  const expect = (name, result) => { if (needs[name]?.result !== result) problems.push(`${name}: expected ${result}, got ${needs[name]?.result ?? 'missing'}`); };
  expect('readiness', 'success');
  if (needs.readiness?.outputs?.ready !== 'true') problems.push('candidate is not ready');
  for (const name of ['changes', 'names', 'openspec']) expect(name, 'success');
  if (!['true', 'false'].includes(needs.changes?.outputs?.node)) problems.push('node selection is missing');
  expect('delivery', event === 'pull_request' ? 'success' : 'skipped');
  expect('node', needs.changes?.outputs?.node === 'true' ? 'success' : 'skipped');
  expect('native', ['schedule', 'workflow_dispatch'].includes(event) ? 'success' : 'skipped');
  return problems;
}
if (process.env.NEEDS) {
  const problems = requiredProblems(JSON.parse(process.env.NEEDS), process.env.EVENT);
  if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
}
