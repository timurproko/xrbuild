/** App input kinds are independent of concrete provider names. */
export function logicalInputNames(inputs) {
  return [...new Set(inputs.filter(name => name && name !== 'none').map(name => name === 'mouse' || name === 'keyboard' ? name : 'hand'))];
}

/** Legacy alias helpers for non-editor consumers. */
export function exposedProviderInputs(inputs,providers=[]){
  const exposed=new Map(providers.filter(provider=>provider.runtimeName).map(provider=>[provider.runtimeName,provider.name]));
  return inputs.map(name=>exposed.get(name)??name);
}

export function runtimeProviderInputs(inputs,providers=[]){
  const runtime=new Map(providers.filter(provider=>provider.runtimeName).map(provider=>[provider.name,provider.runtimeName]));
  return inputs.map(name=>runtime.get(name)??name);
}
