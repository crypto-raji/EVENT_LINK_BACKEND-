import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Networks } from '@stellar/stellar-sdk';
import { resolveStellarNetworkConfig } from './stellar';

test('Stellar network configuration pairs Testnet endpoint and passphrase', () => {
  assert.deepEqual(resolveStellarNetworkConfig('testnet'), {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
  });
});

test('Stellar network configuration pairs Public endpoint and passphrase', () => {
  assert.deepEqual(resolveStellarNetworkConfig('public'), {
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: Networks.PUBLIC,
  });
});

test('Stellar network configuration rejects unknown networks', () => {
  assert.throws(() => resolveStellarNetworkConfig('custom'), /STELLAR_NETWORK must be either/);
});