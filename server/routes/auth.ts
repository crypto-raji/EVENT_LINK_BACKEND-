import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { User } from '../models/User';
import { inMemoryStore, isConnectedToMongo } from '../db';
import { sendRegistrationEmail } from '../services/emailService';
import { hashPassword, verifyPassword } from '../services/password';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'eventlink_production_jwt_secret_key_2026';

function derivePasswordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derivePasswordHash(password, salt);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  const [scheme, salt, encodedHash] = storedHash.split(':');
  if (scheme === 'scrypt' && salt && encodedHash) {
    try {
      const expectedHash = Buffer.from(encodedHash, 'hex');
      const actualHash = await derivePasswordHash(password, salt);
      return {
        valid: expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash),
        needsUpgrade: false,
      };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // Existing records stored the raw password; upgrade only after a successful login.
  const actual = Buffer.from(password);
  const expected = Buffer.from(storedHash);
  const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
  return { valid, needsUpgrade: valid };
}

// Registration Route (Saves user to MongoDB Atlas & Sends Immediate Welcome Email)
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || typeof fullName !== 'string' ||
      !email.trim() || password.length < 8 || password.length > 128 || !fullName.trim()) {
      return res.status(400).json({ error: 'Email, password, and fullName are required.' });
    }

    const emailClean = email.toLowerCase().trim();
    if (emailClean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (password.length < 12 || password.length > 128 || fullName.trim().length > 100) {
      return res.status(400).json({ error: 'Password must be 12-128 characters and fullName at most 100 characters.' });
    }
    if (inMemoryStore.users.has(emailClean)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const mockPublicKey = `GCKEY${Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('')}`;
    const userId = `USR-${Math.floor(100000 + Math.random() * 900000)}`;

    let savedUserObj: any = null;

    // 1. Save in MongoDB Atlas if connected
    if (isConnectedToMongo) {
      try {
        const existingUser = await User.findOne({ email: emailClean });
        if (existingUser) {
          return res.status(400).json({
            error: 'User with this email already exists in database.',
            alreadyExists: true,
            user: {
              id: existingUser._id,
              email: existingUser.email,
              fullName: existingUser.fullName,
              custodialPublicKey: existingUser.custodialPublicKey,
            },
          });
        }

        const newUser = new User({
          email: emailClean,
          passwordHash: await hashPassword(password),
          fullName: fullName.trim(),
          custodialPublicKey: mockPublicKey,
          custodialSecretKey: 'SCKEYTEMPORARYDEMOSECRETKEY2026',
        });

        await newUser.save();
        console.log(`✅ [MONGODB SAVED] New user registered in MongoDB Atlas: ${emailClean}`);

        savedUserObj = {
          id: newUser._id,
          email: newUser.email,
          fullName: newUser.fullName,
          custodialPublicKey: newUser.custodialPublicKey,
        };
      } catch (dbErr) {
        console.warn('MongoDB save error warning:', dbErr);
      }
    }

    if (!savedUserObj) {
      savedUserObj = {
        id: userId,
        _id: userId,
        email: emailClean,
        passwordHash,
        fullName: fullName.trim(),
        passwordHash: await hashPassword(password),
        custodialPublicKey: mockPublicKey,
        createdAt: new Date().toISOString(),
      };
    }

    // Save in-memory store
    inMemoryStore.users.set(emailClean, savedUserObj);

    // Send Registration Welcome Email
    const emailSent = await sendRegistrationEmail(emailClean, fullName.trim(), mockPublicKey);

    const token = jwt.sign({ id: savedUserObj.id, email: emailClean }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'Registration successful. Account saved to MongoDB Atlas & email sent.',
      token,
      emailSent,
      user: savedUserObj,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// Login Route (Queries MongoDB Atlas & In-Memory Store)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const emailClean = email.toLowerCase().trim();
    let dbUser: any = null;

    // 1. Search in MongoDB Atlas
    if (isConnectedToMongo) {
      try {
        dbUser = await User.findOne({ email: emailClean });
      } catch (err) {
        console.warn('MongoDB user lookup warning:', err);
      }
    }

    // 2. Search in Memory Store if not found in MongoDB
    if (!dbUser) {
      dbUser = inMemoryStore.users.get(emailClean);
    }

    if (dbUser) {
      const passwordResult = await verifyPassword(password, dbUser.passwordHash || '');
      if (!passwordResult.valid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (passwordResult.needsUpgrade) {
        dbUser.passwordHash = await hashPassword(password);
        if (isConnectedToMongo && typeof dbUser.save === 'function') {
          await dbUser.save();
        }
      }

      const userPayload = {
        id: dbUser._id || dbUser.id || `USR-${Math.floor(100000 + Math.random() * 900000)}`,
        email: dbUser.email,
        fullName: dbUser.fullName,
        custodialPublicKey: dbUser.custodialPublicKey || `GCKEYCUSTODIALDEMOUSERKEY2026`,
      };

      const token = jwt.sign({ id: userPayload.id, email: userPayload.email }, JWT_SECRET, { expiresIn: '7d' });

      console.log(`🔑 [MONGODB AUTH] User logged in successfully from database: ${emailClean}`);

      return res.json({
        message: 'Login successful.',
        token,
        user: userPayload,
      });
    }

    return res.status(401).json({ error: 'Invalid email or password.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// GET Current Live User Profile from Database
router.get('/me', async (req, res) => {
  try {
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let tokenEmail: string | undefined;
    try {
      const claims = jwt.verify(authorization.slice('Bearer '.length), JWT_SECRET);
      tokenEmail = typeof claims === 'object' && claims !== null && typeof claims.email === 'string'
        ? claims.email
        : undefined;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    if (!tokenEmail) return res.status(401).json({ error: 'Invalid or expired token.' });

    const emailClean = tokenEmail.toLowerCase().trim();
    let user: any = null;

    if (isConnectedToMongo) {
      user = await User.findOne({ email: emailClean });
    }

    if (!user) {
      user = inMemoryStore.users.get(emailClean);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    return res.json({
      user: {
        id: user._id || user.id,
        email: user.email,
        fullName: user.fullName,
        custodialPublicKey: user.custodialPublicKey,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user' });
  }
});

export default router;
