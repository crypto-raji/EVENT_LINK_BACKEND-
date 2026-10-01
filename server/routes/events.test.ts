import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inMemoryStore } from '../db';
import { persistEvent } from './events';

test('failed durable event persistence does not add an event to memory', async () => {
  const event = { id: 'event-persistence-failure-test' };

  await assert.rejects(
    persistEvent(event, async () => {
      throw new Error('database unavailable');
    }),
  );

  assert.equal(inMemoryStore.events.has(event.id), false);
});

test('event is added to memory after successful durable persistence', async () => {
  const event = { id: 'event-persistence-success-test' };
  let persisted = false;

  await persistEvent(event, async () => {
    persisted = true;
  });

  assert.equal(persisted, true);
  assert.equal(inMemoryStore.events.get(event.id), event);
  inMemoryStore.events.delete(event.id);
});