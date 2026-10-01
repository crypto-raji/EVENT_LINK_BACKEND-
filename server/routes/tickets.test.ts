import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeTicketRecords } from './tickets';

test('ticket list merge prefers Mongo records for duplicate IDs and keeps unique records', () => {
  const memoryOnly = { id: 'memory-only', status: 'claimable' };
  const mongoOnly = { id: 'mongo-only', status: 'valid' };

  const merged = mergeTicketRecords(
    [memoryOnly, { id: 'shared', status: 'claimable' }],
    [mongoOnly, { id: 'shared', status: 'valid' }],
  );

  assert.equal(merged.length, 3);
  assert.deepEqual(merged.find((ticket) => ticket.id === 'shared'), { id: 'shared', status: 'valid' });
  assert.ok(merged.includes(memoryOnly));
  assert.ok(merged.includes(mongoOnly));
});

test('ticket list merge converts Mongo documents to plain records', () => {
  const document = {
    id: 'mongo-ticket',
    toObject: () => ({ id: 'mongo-ticket', status: 'valid' }),
  };

  assert.deepEqual(mergeTicketRecords([], [document]), [{ id: 'mongo-ticket', status: 'valid' }]);
});
