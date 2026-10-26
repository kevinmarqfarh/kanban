import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const exports = {}
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/recipeTimers.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports)
const { recipeStepTimers, timerClock, timerDuration } = exports
const seconds = text => recipeStepTimers(text).map(value => value.seconds)
assert.deepEqual(seconds('Sjud i 20 minuter.'), [1200])
assert.deepEqual(seconds('Grädda 25–30 minuter i 200 grader.'), [1500, 1800])
assert.deepEqual(seconds('Låt stå 1 timme och 30 minuter.'), [5400])
assert.deepEqual(seconds('Vispa 1 min 30 sekunder.'), [90])
assert.deepEqual(seconds('Låt jäsa 1,5 timmar.'), [5400])
assert.deepEqual(seconds('Vila en kvart, sedan en halvtimme.'), [900, 1800])
assert.deepEqual(seconds('Vila ½ timme.'), [1800])
assert.deepEqual(seconds('Stek 5 minuter. Koka 5 minuter.'), [300])
assert.deepEqual(seconds('4 portioner, 200 g mjöl, 2 dl vatten. Ugn 180 °C.'), [])
assert.deepEqual(seconds('Vila tills degen har jäst.'), [])
assert.deepEqual(seconds('Koka 0 minuter. Vila 48 timmar.'), [])
assert.equal(timerClock(1), '00:01')
assert.equal(timerClock(59999), '01:00')
assert.equal(timerClock(5400000), '01:30:00')
assert.equal(timerClock(-1), '00:00')
assert.equal(timerDuration(5400), '1 h 30 min')
assert.equal(timerDuration(90), '1 min 30 s')
console.log('PASS explicit cooking durations, ranges, hours, decimals, fractions, no inferred timings and countdown formatting')
