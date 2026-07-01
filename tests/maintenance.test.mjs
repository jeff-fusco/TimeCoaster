import assert from 'node:assert/strict';
import {
  createMaintenanceState,
  enqueueInstall,
  installSpeed,
  pendingCount,
  stepMaintenance,
} from '../src/systems/maintenance.js';

{
  const m = createMaintenanceState({ car: 1, train: 0 });
  assert.equal(m.installed.car, 1);
  assert.equal(m.installed.train, 0);
  assert.deepEqual(m.queue, []);
  assert.equal(m.current, null);
}

{
  const m = createMaintenanceState();
  enqueueInstall(m, 'car');
  enqueueInstall(m, 'car');
  assert.equal(pendingCount(m, 'car'), 2);
  assert.equal(stepMaintenance(m, 7.9, 0), 0);
  assert.equal(m.installed.car, 0);
  assert.equal(pendingCount(m, 'car'), 2);
  assert.equal(stepMaintenance(m, 0.2, 0), 1);
  assert.equal(m.installed.car, 1);
  assert.equal(pendingCount(m, 'car'), 1);
}

{
  const m = createMaintenanceState();
  enqueueInstall(m, 'train');
  const completed = [];
  assert.ok(installSpeed(3) > installSpeed(0));
  stepMaintenance(m, 12 / installSpeed(3) + 0.001, 3, type => completed.push(type));
  assert.deepEqual(completed, ['train']);
  assert.equal(m.installed.train, 1);
}

console.log('maintenance tests passed');
