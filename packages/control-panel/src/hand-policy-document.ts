export type HandPolicy = 'off' | 'native' | 'webxr';
/** Bounded deployment metadata, not executable plugin code or an ABI change. Only checked output copies are stamped. */
export function handPolicyDocument(html: string, policy: HandPolicy): string {
  if (!['off', 'native', 'webxr'].includes(policy)) throw new Error('Invalid hand source policy');
  const clean = html.replace(/<!--xrb-hand-policy--><script>globalThis\.__XRB_HAND_POLICY__="(?:off|native|webxr)";<\/script><!--\/xrb-hand-policy-->/g, '');
  const bootstrap = `<!--xrb-hand-policy--><script>globalThis.__XRB_HAND_POLICY__=${JSON.stringify(policy)};</script><!--/xrb-hand-policy-->`;
  return /<head(?:\s[^>]*)?>/i.test(clean) ? clean.replace(/<head(?:\s[^>]*)?>/i, head => head + bootstrap) : bootstrap + clean;
}
