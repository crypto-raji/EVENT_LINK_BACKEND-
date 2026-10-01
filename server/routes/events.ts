import { Router, Request, Response } from 'express';
import { inMemoryStore, isConnectedToMongo } from '../db';
import { EventModel } from '../models/Event';

const router = Router();

const eventTextLimits: Record<string, number> = {
  title: 120,
  tagline: 500,
  category: 100,
  date: 100,
  time: 50,
  location: 200,
  venueName: 200,
  imageUrl: 2048,
  organizerName: 120,
  organizerStellarAddress: 100,
};

function validateEventPayload(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Event payload must be an object.';
  }

  const event = value as Record<string, unknown>;
  const allowedFields = new Set([...Object.keys(eventTextLimits), 'royaltyPercentage', 'isFeatured', 'tiers']);
  if (Object.keys(event).some((field) => !allowedFields.has(field))) {
    return 'Event payload contains unsupported fields.';
  }

  for (const [field, maxLength] of Object.entries(eventTextLimits)) {
    const fieldValue = event[field];
    if (field === 'title' || field === 'date') {
      if (typeof fieldValue !== 'string' || !fieldValue.trim() || fieldValue.trim().length > maxLength) {
        return `${field} must be a non-empty string no longer than ${maxLength} characters.`;
      }
    } else if (fieldValue !== undefined && (typeof fieldValue !== 'string' || fieldValue.length > maxLength)) {
      return `${field} must be a string no longer than ${maxLength} characters.`;
    }
  }

  if (Number.isNaN(Date.parse((event.date as string).trim()))) {
    return 'date must be a valid date.';
  }

  if (event.imageUrl !== undefined) {
    try {
      const imageUrl = new URL(event.imageUrl as string);
      if (!['http:', 'https:'].includes(imageUrl.protocol)) return 'imageUrl must use HTTP or HTTPS.';
    } catch {
      return 'imageUrl must be a valid URL.';
    }
  }

  if (event.royaltyPercentage !== undefined &&
      (typeof event.royaltyPercentage !== 'number' || !Number.isFinite(event.royaltyPercentage) ||
       event.royaltyPercentage < 0 || event.royaltyPercentage > 100)) {
    return 'royaltyPercentage must be a number between 0 and 100.';
  }
  if (event.isFeatured !== undefined && typeof event.isFeatured !== 'boolean') {
    return 'isFeatured must be a boolean.';
  }

  if (event.tiers !== undefined) {
    if (!Array.isArray(event.tiers) || event.tiers.length > 100) return 'tiers must be an array of at most 100 items.';
    for (const tier of event.tiers) {
      if (!tier || typeof tier !== 'object' || Array.isArray(tier)) return 'Each tier must be an object.';
      const tierData = tier as Record<string, unknown>;
      const allowedTierFields = new Set(['id', 'name', 'priceUSD', 'priceNGN', 'priceXLM', 'perks', 'totalAvailable', 'remaining']);
      if (Object.keys(tierData).some((field) => !allowedTierFields.has(field))) return 'Tier contains unsupported fields.';
      if (typeof tierData.name !== 'string' || !tierData.name.trim() || tierData.name.length > 100) {
        return 'Each tier must have a name between 1 and 100 characters.';
      }
      if (tierData.id !== undefined && (typeof tierData.id !== 'string' || tierData.id.length > 100)) {
        return 'Tier id must be a string no longer than 100 characters.';
      }

      const priceFields = ['priceUSD', 'priceNGN', 'priceXLM'];
      const definedPrices = priceFields.filter((field) => tierData[field] !== undefined);
      if (definedPrices.length === 0) return 'Each tier must include at least one price.';
      for (const field of definedPrices) {
        const price = tierData[field];
        if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 1_000_000_000_000) {
          return `${field} must be a finite non-negative number.`;
        }
      }

      if (tierData.perks !== undefined &&
          (!Array.isArray(tierData.perks) || tierData.perks.length > 50 ||
           tierData.perks.some((perk) => typeof perk !== 'string' || perk.length > 200))) {
        return 'Tier perks must be an array of at most 50 strings, each no longer than 200 characters.';
      }

      for (const field of ['totalAvailable', 'remaining']) {
        const capacity = tierData[field];
        if (capacity !== undefined &&
            (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 0 || capacity > 1_000_000_000)) {
          return `Tier ${field} must be a non-negative integer.`;
        }
      }
      if (typeof tierData.totalAvailable === 'number' && typeof tierData.remaining === 'number' &&
          tierData.remaining > tierData.totalAvailable) {
        return 'Tier remaining capacity cannot exceed totalAvailable.';
      }
    }
  }

  return null;
}

const INITIAL_EVENTS = [
  {
    id: 'evt-001',
    title: 'DRIPS Soroban Web3 Hack Summit 2026',
    tagline: 'Building the next generation of decentralized infrastructure on Stellar Soroban.',
    category: 'Tech & Crypto',
    date: 'August 18-20, 2026',
    time: '09:00 AM WAT',
    location: 'Lagos, Nigeria',
    venueName: 'Landmark Event Centre, Victoria Island',
    imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    organizerName: 'DRIPS Protocol Foundation',
    organizerStellarAddress: 'GCSOROBANORGANIZER2026EVENTLINKMINTKEYSTELLAR101',
    royaltyPercentage: 5,
    isFeatured: true,
    tiers: [
      {
        id: 'tier-01',
        name: 'General Access',
        priceUSD: 25,
        priceNGN: 37500,
        priceXLM: 180,
        perks: ['Full Conference Access', 'Swag Bag', 'On-Chain POAP NFT', 'Networking Lounge'],
        totalAvailable: 500,
        remaining: 142,
      },
      {
        id: 'tier-02',
        name: 'VIP Builder Pass',
        priceUSD: 85,
        priceNGN: 127500,
        priceXLM: 600,
        perks: ['VIP Front Row Seats', 'Exclusive Founder & VC Dinner', '1-on-1 Grant Mentorship', 'Custom Stellar NFT Badge'],
        totalAvailable: 100,
        remaining: 18,
      },
    ],
  },
  {
    id: 'evt-002',
    title: 'Afrobeats On-Chain Fest 2026',
    tagline: 'The world’s first Web3 music festival powered by Stellar smart ticket passes.',
    category: 'Music & Concerts',
    date: 'September 12, 2026',
    time: '05:00 PM WAT',
    location: 'Lagos, Nigeria',
    venueName: 'Eko Atlantic Concert Arena',
    imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    organizerName: 'AfroSound Web3 Labs',
    organizerStellarAddress: 'GAFROBEATSMUSICEVENTLINKORGANIZERSTELLAR2026',
    royaltyPercentage: 7.5,
    isFeatured: true,
    tiers: [
      {
        id: 'tier-03',
        name: 'Early Bird Regular',
        priceUSD: 15,
        priceNGN: 22500,
        priceXLM: 110,
        perks: ['General Admission Entry', 'Festival Wristband', 'Collectible Soroban Badge'],
        totalAvailable: 1000,
        remaining: 412,
      },
    ],
  },
];

// Seed initial events into memory
INITIAL_EVENTS.forEach((evt) => {
  inMemoryStore.events.set(evt.id, evt);
});

export async function persistEvent(event: any, saveToDatabase?: () => Promise<unknown>): Promise<void> {
  if (saveToDatabase) await saveToDatabase();
  inMemoryStore.events.set(event.id, event);
}

/**
 * GET /api/events - Retrieve all events live from database
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const memoryList = Array.from(inMemoryStore.events.values());

    if (isConnectedToMongo) {
      const dbEvents = await EventModel.find().sort({ createdAt: -1 });
      const combinedMap = new Map();
      memoryList.forEach((e) => combinedMap.set(e.id, e));
      dbEvents.forEach((e) => combinedMap.set(e.id, e.toObject()));
      return res.json(Array.from(combinedMap.values()));
    }

    return res.json(memoryList);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch events' });
  }
});

/**
 * POST /api/events - Create new event & save persistently to database
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const validationError = validateEventPayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const eventData = req.body;

    const eventId = eventData.id || `evt-${Math.floor(100000 + Math.random() * 900000)}`;
    const fullEvent = {
      ...eventData,
      id: eventId,
      createdAt: new Date().toISOString(),
    };

    if (isConnectedToMongo) {
      try {
        const newEventObj = new EventModel(fullEvent);
        await newEventObj.save();
      } catch (dbErr) {
        console.warn('MongoDB event save warning:', dbErr);
        return res.status(503).json({ error: 'Event persistence is unavailable. Please retry.' });
      }
    }

    inMemoryStore.events.set(eventId, fullEvent);
    console.log(`[DB EVENT SAVED] Created event "${fullEvent.title}" (ID: ${eventId})`);

    return res.status(201).json({
      message: 'Event created successfully.',
      event: fullEvent,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to save event' });
  }
});

export default router;
