/** App input kinds are independent of concrete provider names, including historical saved names. */
export function logicalInputNames(inputs) {
  return [...new Set(inputs.filter(name => name && name !== 'none').map(name => name === 'mouse' || name === 'keyboard' ? name : 'hand'))];
}
