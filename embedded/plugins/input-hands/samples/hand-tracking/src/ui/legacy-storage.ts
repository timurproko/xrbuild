/** One-time migration of settings saved before the Hand Tracking Input rename. */
const legacy={
  capture:'handlab.capture-preferences.v1',calibration:'handlab.fusion-calibrations.v1',
  recordingLimit:'handlab.recording-limit.v2',recordingAutoCapture:'handlab.recording-auto-capture.v1',
  tab:(state:string)=>`handlab.tab.${state}.v1`,
};
export type StorageLike=Pick<Storage,'getItem'|'setItem'>&Partial<Pick<Storage,'removeItem'>>;
export function migratedStorage(storage:StorageLike,key:string,oldKey:string):string|null{
  const current=storage.getItem(key);if(current!==null)return current;
  const value=storage.getItem(oldKey);if(value!==null){storage.setItem(key,value);storage.removeItem?.(oldKey);}return value;
}
export const legacyStorage=legacy;
