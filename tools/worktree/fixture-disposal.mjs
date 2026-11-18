// Test-owned disposable roots only. Native package observers/SQLite may hold Windows handles until process exit.
import fs from 'node:fs';
export function disposeFixture(directory) {
  try { fs.rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    if (!['EPERM', 'EBUSY'].includes(error.code)) throw error;
    // Never force/kill/retry through a live witness; retain synthetic evidence without masking the scenario result.
    console.error(`Test-owned fixture retained until native handles close (${error.code}): ${directory}`);
  }
}
