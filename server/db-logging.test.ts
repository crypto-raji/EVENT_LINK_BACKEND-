import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectDatabase, getMongoTargetIdentifier } from './db';

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

test('MongoDB connection warnings do not include driver error details', async () => {
  const previousUri = process.env.MONGODB_URI;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  process.env.MONGODB_URI = 'mongodb://event-user:top-secret@/eventlink';
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    await connectDatabase();
  } finally {
    console.warn = originalWarn;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
  }

  assert.doesNotMatch(JSON.stringify(warnings), /event-user|top-secret/);
});