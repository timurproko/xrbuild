import { handProfile, type HandProfile } from '../../sdk/src/hand-profile.ts';
export type HandPolicy = 'off' | 'native' | 'webxr';
/** Bounded deployment metadata, not executable plugin code or an ABI change. Only checked output copies are stamped. */
export function handPolicyDocument(html: string, policy: HandPolicy, profile?: HandProfile, frozen = true): string {
  if (!['off', 'native', 'webxr'].includes(policy)) throw new Error('Invalid hand source policy');
  const clean = html.replace(/<!--xrb-hand-policy--><script>[\s\S]*?<\/script><!--\/xrb-hand-policy-->/g, '');
  const metadata = profile ? `globalThis.__XRB_HAND_PROFILE__=${JSON.stringify(handProfile(profile))};globalThis.__XRB_HAND_PROFILE_FROZEN__=${frozen};` : '';
  const bootstrap = `<!--xrb-hand-policy--><script>globalThis.__XRB_HAND_POLICY__=${JSON.stringify(policy)};${metadata}</script><!--/xrb-hand-policy-->`;
  return /<head(?:\s[^>]*)?>/i.test(clean) ? clean.replace(/<head(?:\s[^>]*)?>/i, head => head + bootstrap) : bootstrap + clean;
}
