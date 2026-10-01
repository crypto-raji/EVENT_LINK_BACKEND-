import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import app from '../index';
import { inMemoryStore } from '../db';

const server = app.listen(0);

before(async () => {
  await new Promise<void>((resolve) => server.once('listening', resolve));
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function login(body: Record<string, string>): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('login requires a password', async () => {
  const response = await login({ email: 'person@example.com' });
  assert.equal(response.status, 400);
});

test('login rejects incorrect and unknown credentials', async () => {
  inMemoryStore.users.set('person@example.com', {
    id: 'person-1',
    email: 'person@example.com',
    fullName: 'Test Person',
    passwordHash: 'correct password',
  });

  const wrongPassword = await login({ email: 'person@example.com', password: 'incorrect password' });
  const unknownUser = await login({ email: 'unknown@example.com', password: 'any password' });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.equal(inMemoryStore.users.has('unknown@example.com'), false);
});

test('login upgrades a valid legacy plaintext password hash', async () => {
  const user = {
    id: 'legacy-1',
    email: 'legacy@example.com',
    fullName: 'Legacy Person',
    passwordHash: 'legacy password',
  };
  inMemoryStore.users.set(user.email, user);

  const response = await login({ email: user.email, password: 'legacy password' });
  const body = await response.json() as { token?: string };

  assert.equal(response.status, 200);
  assert.ok(body.token);
  assert.match(user.passwordHash, /^scrypt:/);
});
