import { test } from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';

test('User Model Email Normalization & Partial Index Behavior Suite', async (t) => {
  await t.test('1. Creating a User with empty string email sets email to undefined', () => {
    const user = new User({
      phone: '9876543210',
      email: ''
    });
    assert.equal(user.email, undefined, 'Blank email must be set to undefined');
  });

  await t.test('2. Creating a User with whitespace email sets email to undefined', () => {
    const user = new User({
      phone: '9876543210',
      email: '   \t  \n  '
    });
    assert.equal(user.email, undefined, 'Whitespace email must be set to undefined');
  });

  await t.test('3. Creating a User without email property leaves email undefined', () => {
    const user = new User({
      phone: '9876543210'
    });
    assert.equal(user.email, undefined, 'Omitted email must remain undefined');
  });

  await t.test('4. Creating a User with valid email trims and lowercases it', () => {
    const user = new User({
      phone: '9876543210',
      email: '  Rajesh.Kumar@Example.COM  '
    });
    assert.equal(user.email, 'rajesh.kumar@example.com', 'Valid email must be trimmed and lowercased');
  });

  await t.test('5. Updating User email to empty string unsets email to undefined', () => {
    const user = new User({
      phone: '9876543210',
      email: 'rajesh@example.com'
    });
    assert.equal(user.email, 'rajesh@example.com');
    user.email = '';
    assert.equal(user.email, undefined, 'Setting email to empty string must unset to undefined');
  });

  await t.test('6. Validating a User document executes pre-validate hook without throwing', async () => {
    const user = new User({
      phone: '9876543210',
      email: ''
    });
    await assert.doesNotReject(async () => {
      await user.validate();
    });
    assert.equal(user.email, undefined, 'Validation must complete and email must be undefined');
  });
});
