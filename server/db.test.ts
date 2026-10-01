import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectDatabase } from './db';

async function withProductionDatabaseUri(uri: string | undefined, action: () => Promise<void>): Promise<void> {
  const previousEnvironment = process.env.NODE_ENV;
  const previousUri = process.env.MONGODB_URI;
  process.env.NODE_ENV = 'production';
  if (uri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = uri;
  try {
    await action();
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
  }
}

test('production startup rejects a missing MongoDB URI', async () => {
  await withProductionDatabaseUri(undefined, async () => {
    await assert.rejects(connectDatabase(), /MONGODB_URI is required in production/);
  });
});

test('production startup rejects a failed MongoDB connection', async () => {
  await withProductionDatabaseUri('invalid-mongodb-uri', async () => {
    await assert.rejects(connectDatabase(), /MongoDB connection failed/);
  });
});