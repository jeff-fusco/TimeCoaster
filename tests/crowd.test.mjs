import assert from 'node:assert/strict';
import {
  VISIT_BASE_MIN,
  visitLengthMin,
  plazaPopulation,
  joinWillingness,
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

// plaza population = arrivals × visit length (Little's Law), capped by capacity.
{
  assert.equal(plazaPopulation({ arrivalRate: 10, visitMin: 20 }), 200, 'plaza = arrivals × visit');
  assert.equal(plazaPopulation({ arrivalRate: 10, visitMin: 20, capacity: 120 }), 120, 'capacity caps the plaza');
  assert.equal(plazaPopulation({ arrivalRate: 0, visitMin: 20 }), 0, 'no arrivals → empty plaza');
  // a destination park (more arrivals AND longer visits) grows the crowd faster
  // than a linear bump — both factors scale together
  assert.ok(
    plazaPopulation({ arrivalRate: 40, visitMin: 40 }) > 4 * plazaPopulation({ arrivalRate: 20, visitMin: 20 }) - 1e-9,
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

console.log('crowd tests passed');
