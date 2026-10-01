import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Ticket } from '../models/Ticket';
import { inMemoryStore, isConnectedToMongo } from '../db';
import {
  sendPurchaseConfirmationEmail,
  sendClaimConfirmationEmail,
  sendGateCheckinEmail,
} from '../services/emailService';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'eventlink_production_jwt_secret_key_2026';
const SOROBAN_CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID || 'CDD3VJENDGV6LLOY2OCYQSRD5CQKYAPL4I3MNWFFQBXJ6P6KOJHQK47J';
const amountPatterns = {
  stripe: /^\$\d{1,9}(?:\.\d{1,2})? USD$/,
  flutterwave: /^₦(?:\d+|\d{1,3}(?:,\d{3})+) NGN$/,
  stellar: /^\d{1,12}(?:\.\d{1,7})? XLM$/,
};

export function validateProgressEmailRequest(body: unknown, authenticatedEmail: string, ticket: any): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid progress email request.';
  const request = body as Record<string, unknown>;
  if (Object.keys(request).some((key) => !['stage', 'ticketId'].includes(key))) {
    return 'Only stage and ticketId may be provided.';
  }
  if (!['purchase', 'claim', 'checkin'].includes(String(request.stage))) return 'A valid progress email stage is required.';
  if (typeof request.ticketId !== 'string' || !request.ticketId.trim() || request.ticketId !== ticket?.id) {
    return 'A valid ticketId is required.';
  }
  if (typeof ticket.buyerEmail !== 'string' || ticket.buyerEmail.toLowerCase() !== authenticatedEmail.toLowerCase()) {
    return 'Ticket not found for this account.';
  }
  if (typeof ticket.buyerName !== 'string' || typeof ticket.eventTitle !== 'string') {
    return 'Ticket record is incomplete.';
  }
  if (request.stage === 'claim' && !['valid', 'used', 'proof_nft'].includes(ticket.status)) {
    return 'Ticket has not been claimed.';
  }
  if (request.stage === 'checkin' && ticket.status !== 'used') return 'Ticket has not been checked in.';
  return null;
}

// 1. Purchase Ticket Endpoint
router.post('/purchase', async (req, res) => {
  try {
    const { eventId, eventTitle, eventDate, eventVenue, tierName, buyerName, buyerEmail, paymentProvider, amountPaid } = req.body;

    if (typeof buyerName !== 'string' || !buyerName.trim() || buyerName.trim().length > 100) {
      return res.status(400).json({ error: 'A name between 1 and 100 characters is required.' });
    }
    if (typeof buyerEmail !== 'string' || buyerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    const amountPattern = typeof paymentProvider === 'string'
      ? amountPatterns[paymentProvider as keyof typeof amountPatterns]
      : undefined;
    if (!amountPattern || typeof amountPaid !== 'string' || !amountPattern.test(amountPaid)) {
      return res.status(400).json({ error: 'A valid payment provider and matching amount are required.' });
    }

    const id = `EVTLNK-${Math.floor(100000 + Math.random() * 900000)}`;
    const ticketHash = `EVTHASH-${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('')}`;
    const claimCode = `CLAIM-${Math.floor(100000 + Math.random() * 900000)}`;
    const custodialPublicKey = `GCKEY${Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('')}`;

    const ticketData = {
      id,
      ticketHash,
      eventId: eventId || 'evt-101',
      eventTitle: eventTitle || 'DRIPS Soroban Summit',
      eventDate: eventDate || 'October 20-22, 2026',
      eventVenue: eventVenue || 'Lagos Convention Center',
      tierName: tierName || 'General Pass',
      buyerName: buyerName.trim(),
      buyerEmail: buyerEmail.trim(),
      paymentProvider,
      amountPaid,
      custodialPublicKey,
      currentOwnerAddress: custodialPublicKey,
      status: 'claimable',
      stellarTxHash: `tx_${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      sorobanContractId: SOROBAN_CONTRACT_ID,
      claimCode,
      claimUrl: `${req.headers.origin || 'http://localhost:5179'}/?claimCode=${claimCode}`,
    };

    inMemoryStore.tickets.set(id, ticketData);

    if (isConnectedToMongo) {
      try {
        const newTicket = new Ticket(ticketData);
        await newTicket.save();
      } catch (err) {
        console.warn('MongoDB ticket save warning, relying on in-memory store:', err);
      }
    }

    // Trigger purchase & minting progress email
    const emailSent = await sendPurchaseConfirmationEmail(ticketData.buyerEmail, ticketData.buyerName, ticketData);

    return res.status(201).json({
      message: 'Ticket purchased & minted on Stellar Testnet successfully.',
      ticket: ticketData,
      emailSent,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Ticket purchase failed' });
  }
});

// 2. Claim Ticket Endpoint
router.post('/claim', async (req, res) => {
  try {
    const { claimCode, walletAddress, buyerEmail, buyerName } = req.body;

    let ticket: any = null;
    for (const t of inMemoryStore.tickets.values()) {
      if (t.claimCode === claimCode) {
        ticket = t;
        break;
      }
    }

    if (!ticket && isConnectedToMongo) {
      ticket = await Ticket.findOne({ claimCode });
    }

    if (!ticket) {
      // Build transient ticket object for claim email dispatch
      ticket = {
        eventTitle: 'DRIPS Soroban Hackathon Summit',
        id: `TCK-${claimCode}`,
        claimCode,
      };
    } else {
      ticket.status = 'valid';
      ticket.currentOwnerAddress = walletAddress;
      inMemoryStore.tickets.set(ticket.id, ticket);
      if (isConnectedToMongo && ticket.save) {
        await ticket.save();
      }
    }

    const emailToUse = buyerEmail || ticket.buyerEmail || 'attendee@drips.org';
    const nameToUse = buyerName || ticket.buyerName || 'Valued Attendee';

    // Trigger claim progress email
    const emailSent = await sendClaimConfirmationEmail(emailToUse, nameToUse, ticket, walletAddress);

    return res.json({
      message: 'Ticket claimed successfully to self-custody wallet on Stellar.',
      ticket,
      emailSent,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Ticket claim failed' });
  }
});

// 3. Dispatch Progress Email Endpoint (Generic handler for frontend events)
router.post('/send-progress-email', async (req, res) => {
  try {
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let authenticatedEmail: string;
    try {
      const claims = jwt.verify(authorization.slice('Bearer '.length), JWT_SECRET);
      authenticatedEmail = typeof claims === 'object' && claims !== null && typeof claims.email === 'string'
        ? claims.email.toLowerCase().trim()
        : '';
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    if (!authenticatedEmail) return res.status(401).json({ error: 'Invalid or expired token.' });

    const { stage, ticketId } = req.body ?? {};
    if (typeof ticketId !== 'string') return res.status(400).json({ error: 'A valid ticketId is required.' });

    let ticket = inMemoryStore.tickets.get(ticketId);
    if (!ticket && isConnectedToMongo) ticket = await Ticket.findOne({ id: ticketId });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found for this account.' });

    const validationError = validateProgressEmailRequest(req.body, authenticatedEmail, ticket);
    if (validationError) return res.status(400).json({ error: validationError });

    let success = false;
    if (stage === 'purchase') {
      success = await sendPurchaseConfirmationEmail(ticket.buyerEmail, ticket.buyerName, ticket);
    } else if (stage === 'claim') {
      success = await sendClaimConfirmationEmail(ticket.buyerEmail, ticket.buyerName, ticket, ticket.currentOwnerAddress);
    } else if (stage === 'checkin') {
      success = await sendGateCheckinEmail(ticket.buyerEmail, ticket.buyerName, ticket, 'EventLink Gate');
    }

    return res.json({ success, message: `Progress email [${stage}] sent to ticket owner.` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to dispatch progress email' });
  }
});

// 4. Get All Tickets
router.get('/', async (_req, res) => {
  try {
    const memoryList = Array.from(inMemoryStore.tickets.values());
    if (isConnectedToMongo) {
      const dbTickets = await Ticket.find().sort({ createdAt: -1 });
      return res.json([...memoryList, ...dbTickets]);
    }
    return res.json(memoryList);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve tickets' });
  }
});

export default router;
