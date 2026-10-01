import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEventPayload } from './events';

const validEvent = {
  title: 'Community Meetup',
  date: 'September 12, 2026',
  imageUrl: 'https://example.com/event.jpg',
  tiers: [{ name: 'General', priceUSD: 10, totalAvailable: 50, remaining: 25, perks: ['Entry'] }],
};

test('accepts a well-formed event with a bounded tier', () => {
  assert.equal(validateEventPayload(validEvent), null);
});

test('rejects invalid dates, oversized text, and unknown event fields', () => {
  assert.match(validateEventPayload({ ...validEvent, date: 'not-a-date' })!, /valid event date/);
  assert.match(validateEventPayload({ ...validEvent, title: 'x'.repeat(151) })!, /title must be a string/);
  assert.match(validateEventPayload({ ...validEvent, internalFlag: true })!, /Unknown event field/);
});

test('rejects unsafe image URLs and invalid tier prices or capacities', () => {
  assert.match(validateEventPayload({ ...validEvent, imageUrl: 'javascript:alert(1)' })!, /HTTP or HTTPS/);
  assert.match(validateEventPayload({ ...validEvent, tiers: [{ id: 42, name: 'General' }] })!, /tiers\[0\]\.id must be a string/);
  assert.match(validateEventPayload({ ...validEvent, tiers: [{ name: 'General', priceUSD: -1 }] })!, /non-negative number/);
  assert.match(validateEventPayload({ ...validEvent, tiers: [{ name: 'General', totalAvailable: 2, remaining: 3 }] })!, /cannot exceed/);
});