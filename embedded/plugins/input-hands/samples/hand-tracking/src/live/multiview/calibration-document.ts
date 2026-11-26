import { importSpatialCalibration, type SpatialCalibration } from './calibration.ts';
import { json, parse } from '../recording/format.ts';
/** Read scalar files or extract only the spatial result from a legacy setup envelope. */
export async function importCalibrationDocument(file: Blob): Promise<SpatialCalibration> {
  const value = await parse(file) as Record<string, unknown>;
  if (value?.format !== 'xrbuild-two-view-setup') return importSpatialCalibration(file);
  if (value.version !== 1 || value.privateEvaluationOnly !== true || value.exposureSyncVerified !== false || !value.spatial) throw new Error('Unsupported calibration setup envelope.');
  // Timing/options are intentionally not imported or applied. This is not a setup/fusion validator.
  return importSpatialCalibration(json(value.spatial));
}
