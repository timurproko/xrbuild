import { importSpatialCalibration,type SpatialCalibration } from './calibration.ts';
import { importTiming,type TemporalCalibration } from './temporal.ts';
import { FUSION_DEFAULTS,validateFusionOptions,type FusionOptions } from './fusion.ts';
import { json,parse } from '../recording/format.ts';
import { immutable } from '../recording/depth-format.ts';
export interface FusionSetup {format:'xrbuild-two-view-setup';version:1;privateEvaluationOnly:true;exposureSyncVerified:false;spatial:SpatialCalibration;timing:TemporalCalibration|null;options:FusionOptions}
export function exportFusionSetup(spatial:SpatialCalibration,timing:TemporalCalibration|null,options:FusionOptions):Blob {validateFusionOptions(options);if(timing&&(timing.input.sources.a.profileHash!==spatial.sourceHashes.a||timing.input.sources.b.profileHash!==spatial.sourceHashes.b))throw new Error('Fusion setup source/profile mismatch');return json({format:'xrbuild-two-view-setup',version:1,privateEvaluationOnly:true,exposureSyncVerified:false,spatial,timing,options});}
export async function importFusionSetup(file:Blob):Promise<FusionSetup>{
  const v=await parse(file) as FusionSetup;if(v?.format!=='xrbuild-two-view-setup'||v.version!==1||v.privateEvaluationOnly!==true||v.exposureSyncVerified!==false)throw new Error('Unsupported fusion setup declarations');
  const spatial=await importSpatialCalibration(json(v.spatial)),timing=v.timing===null?null:await importTiming(json(v.timing));validateFusionOptions(v.options);
  if(timing&&(timing.input.sources.a.profileHash!==spatial.sourceHashes.a||timing.input.sources.b.profileHash!==spatial.sourceHashes.b))throw new Error('Fusion setup source/profile mismatch');
  const options=Object.fromEntries(Object.keys(FUSION_DEFAULTS).map(k=>[k,v.options[k as keyof FusionOptions]])) as unknown as FusionOptions;
  return immutable({format:'xrbuild-two-view-setup',version:1,privateEvaluationOnly:true,exposureSyncVerified:false,spatial,timing,options});
}
