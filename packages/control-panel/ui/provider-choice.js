/** Present bounded panel aliases while keeping native provider IDs in saved project manifests. */
export function exposedProviderInputs(inputs,providers=[]){
  const exposed=new Map(providers.filter(provider=>provider.runtimeName).map(provider=>[provider.runtimeName,provider.name]));
  return inputs.map(name=>exposed.get(name)??name);
}

export function runtimeProviderInputs(inputs,providers=[]){
  const runtime=new Map(providers.filter(provider=>provider.runtimeName).map(provider=>[provider.name,provider.runtimeName]));
  return inputs.map(name=>runtime.get(name)??name);
}
