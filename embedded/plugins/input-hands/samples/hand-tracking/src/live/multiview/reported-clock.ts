import type {ClockSource} from './temporal.ts';
import type {SpatialCalibration} from './calibration.ts';
/** Diagnostic pairing in the SDK's shared host SYSTEM TIME namespace.
 * This is not a measured inter-camera offset or exposure-time uncertainty bound.
 * No synthetic common events or fabricated TemporalCalibration are created.
 */
export interface ReportedClockPreview {format:'sdk-system-time-preview';sources:{a:ClockSource;b:ClockSource};exposureSyncVerified:false;temporalUncertaintyMs:null}
export function reportedClockPreview(spatial:SpatialCalibration,sources:{a:ClockSource;b:ClockSource}):ReportedClockPreview {
  if(!spatial.spatialQualified||!spatial.input.evidence.automaticMarker||sources.a.domain!=='System Time'||sources.b.domain!=='System Time'||sources.a.serial===sources.b.serial||sources.a.serial!==spatial.input.sources.a.serial||sources.b.serial!==spatial.input.sources.b.serial||sources.a.profileHash!==spatial.sourceHashes.a||sources.b.profileHash!==spatial.sourceHashes.b||![sources.a,sources.b].every(s=>/^[-a-zA-Z0-9_]{1,128}$/.test(s.runId)))throw new Error('Automatic fusion needs current, profile-matched native SDK System Time streams');
  return {format:'sdk-system-time-preview',sources:{a:{...sources.a},b:{...sources.b}},exposureSyncVerified:false,temporalUncertaintyMs:null};
}
