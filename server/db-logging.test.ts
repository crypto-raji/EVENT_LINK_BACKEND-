import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMongoTargetIdentifier } from './db';

test('MongoDB log target omits URI credentials and query parameters', () => {
  const target = getMongoTargetIdentifier(
    'mongodb+srv://event-user:top-secret@cluster.example.com/eventlink?retryWrites=true',
  );

  assert.equal(target, 'cluster.example.com/eventlink');
  assert.doesNotMatch(target, /event-user|top-secret|retryWrites/);
});

test('MongoDB log target safely handles malformed URIs', () => {
  assert.equal(getMongoTargetIdentifier('not-a-mongodb-uri'), 'configured MongoDB target');
});