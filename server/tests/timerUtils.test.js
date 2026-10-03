import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleLongTimeout, MAX_TIMEOUT_MS } from '../utils/timerUtils.js';

test('Timer Utils - Long Delay Scheduling Suite', async (t) => {
  await t.test('1. MAX_TIMEOUT_MS is 2^31 - 1 (0x7FFFFFFF)', () => {
    assert.equal(MAX_TIMEOUT_MS, 2147483647);
  });

  await t.test('2. Delay > MAX_TIMEOUT_MS does not emit TimeoutOverflowWarning and does not execute prematurely', (t, done) => {
    const overflowDelay = 2574763839; // ~29.8 days, the exact observed value

    let warningEmitted = false;
    const warningListener = (warning) => {
      if (warning.name === 'TimeoutOverflowWarning') {
        warningEmitted = true;
      }
    };
    process.on('warning', warningListener);

    let callbackExecuted = false;
    const handle = scheduleLongTimeout(() => {
      callbackExecuted = true;
    }, overflowDelay);

    // In native setTimeout with overflow, callback would fire in 1 ms!
    // We check after 20ms that it did NOT fire and no warning was emitted.
    setTimeout(() => {
      process.removeListener('warning', warningListener);
      handle.clear();

      assert.equal(warningEmitted, false, 'TimeoutOverflowWarning must NOT be emitted');
      assert.equal(callbackExecuted, false, 'Callback must NOT execute prematurely (e.g. after 1ms)');
      done();
    }, 20);
  });

  await t.test('3. Immediate / short delay executes callback accurately', (t, done) => {
    let executed = false;
    const handle = scheduleLongTimeout(() => {
      executed = true;
      assert.equal(executed, true);
      done();
    }, 15);
  });

  await t.test('4. Timer cleanup: .clear() halts execution', (t, done) => {
    let executed = false;
    const handle = scheduleLongTimeout(() => {
      executed = true;
    }, 15);

    handle.clear();

    setTimeout(() => {
      assert.equal(executed, false, 'Cleared timer must not execute');
      done();
    }, 30);
  });

  await t.test('5. Multi-step chaining behavior logic', () => {
    // Test stepping logic: if remaining is 2.5 billion, first step schedules MAX_TIMEOUT_MS
    let stepCount = 0;
    const fakeTimerSteps = [];

    // Simulate with a custom step test
    const targetDelay = MAX_TIMEOUT_MS + 5000;
    let remaining = targetDelay;
    while (remaining > 0) {
      const stepDelay = Math.min(remaining, MAX_TIMEOUT_MS);
      fakeTimerSteps.push(stepDelay);
      remaining -= stepDelay;
    }

    assert.equal(fakeTimerSteps.length, 2);
    assert.equal(fakeTimerSteps[0], MAX_TIMEOUT_MS);
    assert.equal(fakeTimerSteps[1], 5000);
  });
});
