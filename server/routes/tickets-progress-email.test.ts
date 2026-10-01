import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProgressEmailRequest } from './tickets';

const ticket = {
  id: 'ticket-123',
  buyerEmail: 'owner@example.com',
  buyerName: 'Ticket Owner',
  eventTitle: 'Trusted Event',
  status: 'valid',
};

test('progress email only accepts stage and the owner ticket ID', () => {
  assert.equal(validateProgressEmailRequest({ stage: 'claim', ticketId: ticket.id }, 'owner@example.com', ticket), null);
  assert.match(
    validateProgressEmailRequest({ stage: 'claim', ticketId: ticket.id, email: 'attacker@example.com' }, 'owner@example.com', ticket)!,
    /Only stage and ticketId/,
  );
  assert.match(
    validateProgressEmailRequest({ stage: 'claim', ticketId: ticket.id }, 'attacker@example.com', ticket)!,
    /Ticket not found/,
  );
});

test('progress email stages must match trusted ticket state', () => {
  assert.match(
    validateProgressEmailRequest({ stage: 'checkin', ticketId: ticket.id }, 'owner@example.com', ticket)!,
    /not been checked in/,
  );
  assert.match(
    validateProgressEmailRequest({ stage: 'unsupported', ticketId: ticket.id }, 'owner@example.com', ticket)!,
    /valid progress email stage/,
  );
});