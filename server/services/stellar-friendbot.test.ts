import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFriendbotEnabled } from './stellar';

test('Friendbot is disabled unless explicitly opted into outside production', () => {
  assert.equal(isFriendbotEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(isFriendbotEnabled({ NODE_ENV: 'development', STELLAR_USE_FRIENDBOT: 'true' }), true);
});

test('Friendbot cannot be enabled in production', () => {
  assert.equal(isFriendbotEnabled({ NODE_ENV: 'production', STELLAR_USE_FRIENDBOT: 'true' }), false);
});