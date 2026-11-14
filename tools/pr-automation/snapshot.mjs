// Shared delivery-controller snapshot/hold checks. No controller gains integration authority from this module.
export const HOLD_LABEL = 'delivery-hold';
export const labelsOf = pr => (pr?.labels ?? []).map(label => typeof label === 'string' ? label : label?.name);
export const held = pr => !Array.isArray(pr?.labels) || labelsOf(pr).some(label => typeof label !== 'string' || !label)
  || labelsOf(pr).some(label => label.toLowerCase() === HOLD_LABEL);

export function samePullSnapshot(before, after, { draft = before?.draft, head = before?.head?.sha } = {}) {
  return Boolean(before && after && !held(before) && !held(after)
    && before.node_id === after.node_id && before.number === after.number && after.state === 'open' && after.draft === draft
    && before.body === after.body && before.base?.sha === after.base?.sha && before.base?.ref === after.base?.ref
    && before.base?.repo?.full_name === after.base?.repo?.full_name && after.head?.sha === head
    && before.head?.ref === after.head?.ref && before.head?.repo?.full_name === after.head?.repo?.full_name);
}
