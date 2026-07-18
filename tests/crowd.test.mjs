import assert from 'node:assert/strict';
import {
  VISIT_BASE_MIN,
  visitLengthMin,
  plazaPopulation,
  joinWillingness,
  stepCrowdFlows,
} from '../src/systems/crowd.js';

// visit length: a bare park keeps guests the base minutes; appeal extends it,
// bounded so it can't run away.
{
  assert.equal(visitLengthMin({ excitement: 0 }), VISIT_BASE_MIN, 'a bare park → base visit');
  const dull = visitLengthMin({ excitement: 20 });
  const thrilling = visitLengthMin({ excitement: 400 });
  assert.ok(thrilling > dull, 'a more exciting park keeps guests longer');
  assert.ok(visitLengthMin({ excitement: 1e9 }) <= 90.0001, 'visit length is bounded');
  // dining, comfort and cleanliness all extend the stay (the destination levers)
  assert.ok(visitLengthMin({ excitement: 50, diningLvl: 10 }) > visitLengthMin({ excitement: 50 }), 'a Food Court keeps guests around');
  assert.ok(visitLengthMin({ excitement: 50, comfortLvl: 10 }) > visitLengthMin({ excitement: 50 }), 'comfort keeps guests around');
  assert.ok(visitLengthMin({ excitement: 50, cleanMult: 1.3 }) > visitLengthMin({ excitement: 50 }), 'a clean park keeps guests around');
}

// plaza population = arrivals/min × visit length (Little's Law), capped by capacity.
{
  assert.equal(plazaPopulation({ arrivalPerMin: 10, visitMin: 20 }), 200, 'plaza = arrivals × visit');
  assert.equal(plazaPopulation({ arrivalPerMin: 10, visitMin: 20, capacity: 120 }), 120, 'capacity caps the plaza');
  assert.equal(plazaPopulation({ arrivalPerMin: 0, visitMin: 20 }), 0, 'no arrivals → empty plaza');
  // a destination park (more arrivals AND longer visits) grows the crowd faster
  // than a linear bump — both factors scale together
  assert.ok(
    plazaPopulation({ arrivalPerMin: 40, visitMin: 40 }) > 4 * plazaPopulation({ arrivalPerMin: 20, visitMin: 20 }) - 1e-9,
    'doubling arrivals and visit length quadruples the plaza',
  );
}

// join willingness: a strong ride pulls people into the line; a long wait makes
// them balk (and go shop instead). Always in [0,1].
{
  assert.ok(joinWillingness({ appeal: 1, waitMin: 0 }) > joinWillingness({ appeal: 1, waitMin: 30 }), 'a long wait deters joining');
  assert.ok(joinWillingness({ appeal: 1, waitMin: 5 }) > joinWillingness({ appeal: 0.3, waitMin: 5 }), 'a stronger ride draws more into the line');
  const w = joinWillingness({ appeal: 5, waitMin: 0 });
  assert.ok(w >= 0 && w <= 1, 'willingness stays in [0,1]');
}

// stepCrowdFlows: the live integrator. Arrivals land in the plaza, a
// willingness-gated flow files into the queue, and the plaza drains as visits
// end. Conservation: whoever leaves the plaza either joined the line or went home.
{
  // one tick: arrivals in, some join, none lost
  const t1 = stepCrowdFlows({ plaza: 100, queue: 0, dt: 1, arrivalPerSec: 2, visitMin: 20, joinWill: 1, queueCap: 500, plazaCap: 1e6 });
  assert.ok(t1.join > 0, 'guests file into the line');
  assert.ok(t1.plaza + t1.queue > 100, 'arrivals grow the total crowd');
  assert.ok(t1.queue === t1.join, 'the queue grew by exactly the join flow');

  // integrate to steady state: the plaza settles near arrivals/sec × visit-seconds
  let p = 0, q = 0;
  for (let i = 0; i < 20000; i++) {
    const r = stepCrowdFlows({ plaza: p, queue: q, dt: 0.5, arrivalPerSec: 1, visitMin: 5, joinWill: 0.5, queueCap: 40, plazaCap: 1e6 });
    p = r.plaza; q = Math.min(40, r.queue);   // boarding caps the line for this toy model
  }
  assert.ok(q >= 39.5, 'a willing crowd pins the queue at capacity');
  assert.ok(p > 50 && p < 300, `plaza settles to a sane population (got ${p.toFixed(0)})`);

  // no willingness → nobody joins; the plaza still cycles guests through
  const t2 = stepCrowdFlows({ plaza: 50, queue: 0, dt: 1, arrivalPerSec: 1, visitMin: 10, joinWill: 0, queueCap: 500, plazaCap: 1e6 });
  assert.equal(t2.join, 0, 'zero willingness → zero joins');
  assert.ok(t2.plaza > 50, 'guests keep arriving even if nobody rides');

  // a full queue rejects joiners (they stay in the plaza shopping)
  const t3 = stepCrowdFlows({ plaza: 50, queue: 30, dt: 1, arrivalPerSec: 1, visitMin: 10, joinWill: 1, queueCap: 30, plazaCap: 1e6 });
  assert.equal(t3.join, 0, 'a full line turns guests back to the plaza');

  // the plaza capacity clamps the crowd
  const t4 = stepCrowdFlows({ plaza: 999, queue: 0, dt: 1, arrivalPerSec: 50, visitMin: 30, joinWill: 0, queueCap: 0, plazaCap: 1000 });
  assert.ok(t4.plaza <= 1000, 'plaza capacity binds');
}

console.log('crowd tests passed');
