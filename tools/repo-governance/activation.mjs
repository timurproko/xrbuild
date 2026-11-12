// Read-only capability inspection and explicitly scoped activation. Never handles secret values.
const requiredPermission = 'Repository administration permission is required';
const PRIVILEGED_ROLES = ['promotion', 'probe', 'refresh'];
// One decision owns both write planning and readback; CI-only must never enable privileged automation.
const workflowEnabled = (role, mode) => role === 'ci' || mode === 'activate' && PRIVILEGED_ROLES.includes(role);
const query = (api, path) => {
  try { return { state: 'available', value: api('GET', path) }; }
  catch (error) {
    let message = String(error.message ?? '');
    try { message = JSON.parse(String(error.stdout)).message ?? message; } catch {}
    const state = /upgrade.*(?:pro|plan)|not available.*plan/i.test(message) ? 'unsupported'
      : /401|bad credentials|requires authentication/i.test(message) ? 'unauthenticated'
      : /403|forbidden|resource not accessible/i.test(message) ? 'forbidden'
      : /404|not found/i.test(message) ? 'missing' : 'unknown';
    return { state };
  }
};
const problem = (code, message) => ({ code, message });

export function inspectActivation({ api, repo, config, mode = 'activate' }) {
  const repository = query(api, `repos/${repo}`), problems = [];
  if (repository.state !== 'available') return { status: 'blocked', repo, mode, problems: [problem('repository-unavailable', 'Cannot verify the repository')], state: {} };
  const info = repository.value;
  if (info.full_name !== repo || info.default_branch !== 'main') problems.push(problem('repository-identity', 'Repository identity or default branch does not match'));
  if (!info.permissions?.admin) problems.push(problem('administration-required', requiredPermission));
  if (!config.rulesets?.length || config.rulesets.some(rule => rule.enforcement !== 'active' || rule.bypass_actors?.length !== 0)) problems.push(problem('unsafe-protection-policy', 'Active protection must declare no administrator or bot bypass'));
  const protection = config.rulesets?.find(rule => rule.name === 'protect-main');
  const rules = protection?.rules ?? [];
  if (protection?.target !== 'branch' || !['~DEFAULT_BRANCH', 'refs/heads/main'].some(ref => JSON.stringify(protection?.conditions?.ref_name?.include) === JSON.stringify([ref]))
    || protection?.conditions?.ref_name?.exclude?.length !== 0
    || JSON.stringify(rules.find(rule => rule.type === 'pull_request')?.parameters?.allowed_merge_methods) !== JSON.stringify(['squash'])) problems.push(problem('protection-target-policy', 'Protection must cover main without exclusions and require squash PR integration'));
  if (!['deletion', 'non_fast_forward', 'required_linear_history', 'pull_request', 'required_status_checks'].every(type => rules.some(rule => rule.type === type))
    || !rules.find(rule => rule.type === 'required_status_checks')?.parameters?.required_status_checks?.some(check => check.context === 'CI required' && check.integration_id === 15368)) problems.push(problem('required-protection-policy', 'PR-only updates and the expected CI required producer must be declared'));
  const rulesets = query(api, `repos/${repo}/rulesets`);
  if (rulesets.state !== 'available') {
    const classic = query(api, `repos/${repo}/branches/main/protection`);
    problems.push(problem(rulesets.state === 'unsupported' && classic.state === 'unsupported' ? 'protection-plan-required' : 'protection-unverified',
      rulesets.state === 'unsupported' ? 'The account cannot enforce this private protection policy; the owner must supply a supported plan. Visibility and billing are never changed.' : 'Protection capability could not be verified'));
  }
  const permissions = query(api, `repos/${repo}/actions/permissions/workflow`);
  if (permissions.state !== 'available') problems.push(problem('workflow-permissions-unverified', 'Workflow token defaults could not be verified'));
  const actions = query(api, `repos/${repo}/actions/permissions`);
  const workflows = query(api, `repos/${repo}/actions/workflows?per_page=100`);
  const variables = query(api, `repos/${repo}/actions/variables?per_page=100`);
  const secrets = query(api, `repos/${repo}/actions/secrets?per_page=100`);
  const automation = config.automation, bot = automation?.bot;
  const botConfigured = !!bot && variables.state === 'available' && secrets.state === 'available'
    && /^[1-9]\d*$/.test(String(variables.value.variables?.find(item => item.name === bot.app_id_variable)?.value ?? ''))
    && !!secrets.value.secrets?.some(item => item.name === bot.private_key_secret);
  const pending = [];
  if (!botConfigured) pending.push(problem('bot-configuration-required', 'Configure the declared bot App variable and key secret securely; names alone do not verify installation permissions'));
  if (actions.state !== 'available') pending.push(problem('actions-unverified', 'Repository Actions permissions could not be verified'));
  if (workflows.state !== 'available') pending.push(problem('workflows-unverified', 'Workflow inventory could not be verified'));
  const inventory = workflows.value?.workflows ?? [], declared = automation?.workflows ?? {};
  if (!Object.values(declared).includes('ci') || Object.values(declared).some(role => !['ci', ...PRIVILEGED_ROLES, 'disabled'].includes(role))) pending.push(problem('workflow-policy-missing', 'Reviewed workflow roles must be explicitly declared'));
  if (workflows.state === 'available' && (workflows.value.total_count > 100 || inventory.some(workflow => workflow.state === 'active' && !Object.hasOwn(declared, workflow.path)))) pending.push(problem('unreviewed-workflows', 'An active workflow is outside the reviewed allowlist; no workflow is disabled implicitly'));
  const trusted = [];
  for (const [file, role] of Object.entries(declared)) {
    if (role === 'disabled' || ['activate-ci', 'protect'].includes(mode) && role !== 'ci') continue;
    const result = query(api, `repos/${repo}/contents/${file}?ref=main`);
    if (result.state !== 'available' || result.value.type !== 'file') trusted.push(file);
  }
  for (const file of mode === 'activate-ci' || mode === 'protect' ? [] : automation?.trusted_files ?? []) {
    if (query(api, `repos/${repo}/contents/${file}?ref=main`).state !== 'available') trusted.push(file);
  }
  if (trusted.length) pending.push(problem('trusted-policy-bootstrap', 'Required trusted policy is absent from main; use the maintainer-reviewed bootstrap PR, never candidate policy with privileged credentials'));
  const activationProblems = mode === 'protect' ? pending.filter(item => item.code === 'trusted-policy-bootstrap') : pending.filter(item => mode !== 'activate-ci' || item.code !== 'bot-configuration-required');
  return { status: problems.length || activationProblems.length ? 'blocked' : 'available', repo, mode, problems: [...problems, ...activationProblems], pending,
    botConfigured, state: { repository: info, rulesets: rulesets.value ?? [], permissions: permissions.value, actions: actions.value, workflows: inventory }, trustedMissing: trusted };
}

/** Report only public capability metadata, never variable values, secrets or API response bodies. */
export function activationReport(inspected) {
  return { status: inspected.status, repo: inspected.repo, mode: inspected.mode, problems: inspected.problems, pending: inspected.pending,
    actionsEnabled: inspected.state.actions?.enabled === true, botSettingsPresent: inspected.botConfigured === true,
    enforcementVerified: false, note: 'Configured bot settings are not proof of App installation permissions or downstream CI events' };
}

export function runActivation(command, { api, repo, config, confirmed, out, planSettings, readSettings, checkSettings }) {
  const mode = command === 'preflight' ? 'activate' : command;
  const inspected = inspectActivation({ api, repo, config, mode });
  out(JSON.stringify(activationReport(inspected), null, 2));
  if (inspected.status !== 'available') return 2;
  if (command === 'preflight') return 0;
  const settings = readSettings(api, repo);
  const writes = planSettings(config, settings, repo);
  if (mode !== 'protect') {
    // Disable only explicitly reviewed workflows BEFORE enabling repository Actions.
    for (const [file, role] of Object.entries(config.automation.workflows)) {
      const enabled = workflowEnabled(role, mode);
      const workflow = inspected.state.workflows.find(item => item.path === file);
      if (!workflow) {
        if (enabled) { out('blocked: a required workflow has not been registered on main'); return 2; }
        continue;
      }
      if ((workflow.state === 'active') !== enabled) writes.push({ method: 'PUT', path: `repos/${repo}/actions/workflows/${workflow.id}/${enabled ? 'enable' : 'disable'}`, why: file });
    }
    if (inspected.state.actions?.enabled !== true) writes.push({ method: 'PUT', path: `repos/${repo}/actions/permissions`, body: { enabled: true }, why: 'enable reviewed Actions' });
  }
  for (const write of writes) out(`${write.method} ${write.path} (${write.why})`);
  if (!confirmed) { out('dry run: nothing written'); return 0; }
  let applied = 0;
  try {
    for (const write of writes) { api(write.method, write.path, write.body); applied++; }
    const after = inspectActivation({ api, repo, config, mode });
    const drift = checkSettings(config, readSettings(api, repo));
    const workflowDrift = mode !== 'protect' && Object.entries(config.automation.workflows).some(([file, role]) => {
      const enabled = workflowEnabled(role, mode);
      const workflow = after.state.workflows.find(item => item.path === file);
      return enabled ? workflow?.state !== 'active' : workflow?.state === 'active';
    });
    if (after.status !== 'available' || drift.length || workflowDrift || mode !== 'protect' && after.state.actions?.enabled !== true) throw new Error('readback mismatch');
    out(JSON.stringify({ ...activationReport(after), status: mode === 'activate' ? 'configured-not-certified' : 'partial', enforcementVerified: true, applied,
      note: mode === 'protect' ? 'Protection installed; automation remains a separate gate' : 'Live canary and exact-head CI events remain required; no PR was promoted or merged' }, null, 2));
    return 0;
  } catch {
    out(JSON.stringify({ status: 'partial-or-blocked', applied, note: 'Application/readback failed; preserve protection and inspect drift. No automatic rollback, visibility change or billing mutation.' }));
    return 2;
  }
}
