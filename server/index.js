import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Admin, BatchCounter, QRBatch, QRCode } from './models.js';

const app = express();
const port = Number(process.env.PORT) || 3001;
const publicAppUrl = (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
const jwtSecret = process.env.JWT_SECRET;
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const activationCodeKey = createHash('sha256').update(jwtSecret || '').digest();
const maxBatchSize = 250;

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
if (!adminUsername) throw new Error('ADMIN_USERNAME is required.');
if (!adminPassword || adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function requireAdmin(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });

  try {
    req.admin = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

function normalizeDestination(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function encryptActivationCode(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', activationCodeKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptActivationCode(value) {
  const [encodedIv, encodedTag, encodedData] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', activationCodeKey, Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedData, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function incrementBatchCounter() {
  try {
    return await BatchCounter.findOneAndUpdate(
      { _id: 'qr-batch' },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const counter = await BatchCounter.findOneAndUpdate(
      { _id: 'qr-batch' },
      { $inc: { sequence: 1 } },
      { new: true },
    );
    if (!counter) throw error;
    return counter;
  }
}

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Enter your username and password.' });
    }

    const admin = await Admin.findOne({ username: username.trim() });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ error: 'Those sign-in details don’t match.' });
    }

    const token = jwt.sign({ sub: admin.id, username: admin.username }, jwtSecret, { expiresIn: '12h' });
    return res.json({ token, username: admin.username });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/qrs', requireAdmin, async (req, res, next) => {
  try {
    const records = await QRCode.find().sort({ createdAt: -1 }).lean();
    return res.json(records.map(({ qrId, status, redirectUrl, createdAt, activatedAt, activationCodeEncrypted }) => ({
      qrId,
      qrUrl: `${publicAppUrl}/q/${encodeURIComponent(qrId)}`,
      status,
      redirectUrl,
      createdAt,
      activatedAt,
      activationCode: activationCodeEncrypted ? decryptActivationCode(activationCodeEncrypted) : null,
    })));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/batches', requireAdmin, async (req, res, next) => {
  try {
    const batches = await QRBatch.find().sort({ batchNumber: -1 }).lean();
    const counts = await QRCode.aggregate([
      { $match: { batchId: { $in: batches.map((batch) => batch._id) } } },
      { $group: { _id: '$batchId', count: { $sum: 1 } } },
    ]);
    const countByBatchId = new Map(counts.map(({ _id, count }) => [_id.toString(), count]));
    return res.json(batches.map(({ _id, batchNumber, createdAt }) => ({
      id: _id.toString(),
      batchNumber,
      count: countByBatchId.get(_id.toString()) || 0,
      createdAt,
    })));
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/admin/batches/:batchId', requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.batchId)) {
      return res.status(404).json({ error: 'This QR batch could not be found.' });
    }
    const batch = await QRBatch.findById(req.params.batchId);
    if (!batch) return res.status(404).json({ error: 'This QR batch could not be found.' });

    const result = await QRCode.deleteMany({ batchId: batch._id });
    await QRBatch.deleteOne({ _id: batch._id });
    return res.json({
      id: batch.id,
      batchNumber: batch.batchNumber,
      deletedCodes: result.deletedCount,
      deleted: true,
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/batches', requireAdmin, async (req, res, next) => {
  try {
    const { count } = req.body ?? {};
    if (!Number.isInteger(count) || count < 1 || count > maxBatchSize) {
      return res.status(400).json({ error: `Enter a whole number from 1 to ${maxBatchSize}.` });
    }

    const counter = await incrementBatchCounter();
    const batchNumber = counter.sequence;
    const generatedCodes = await Promise.all(Array.from({ length: count }, async () => {
      const activationCode = String(randomInt(100000, 1000000));
      return {
        qrId: randomBytes(9).toString('base64url'),
        activationCode,
        activationCodeHash: await bcrypt.hash(activationCode, 10),
        activationCodeEncrypted: encryptActivationCode(activationCode),
      };
    }));

    let batch;
    try {
      batch = await QRBatch.create({ batchNumber, count });
      await QRCode.insertMany(generatedCodes.map(({ qrId, activationCodeHash, activationCodeEncrypted }) => ({
        qrId,
        activationCodeHash,
        activationCodeEncrypted,
        batchId: batch._id,
      })));
    } catch (error) {
      if (batch) {
        try {
          await QRCode.deleteMany({ batchId: batch._id });
          await QRBatch.deleteOne({ _id: batch._id });
        } catch (cleanupError) {
          console.error('Could not clean up an incomplete QR batch.', cleanupError);
        }
      }
      throw error;
    }

    return res.status(201).json({ id: batch.id, batchNumber, count });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/batches/:batchId/download', requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.batchId)) {
      return res.status(404).json({ error: 'This QR batch could not be found.' });
    }
    const batch = await QRBatch.findById(req.params.batchId).lean();
    if (!batch) return res.status(404).json({ error: 'This QR batch could not be found.' });

    const records = await QRCode.find({ batchId: batch._id })
      .sort({ createdAt: 1, _id: 1 })
      .select('qrId activationCodeEncrypted')
      .lean();
    if (records.length === 0) return res.status(409).json({ error: 'This batch has no QR codes to download.' });
    if (records.some((record) => !record.activationCodeEncrypted)) {
      return res.status(500).json({ error: 'An activation code is missing from this batch.' });
    }

    return res.json({
      batchNumber: batch.batchNumber,
      codes: records.map(({ qrId, activationCodeEncrypted }) => ({
        qrId,
        qrUrl: `${publicAppUrl}/q/${encodeURIComponent(qrId)}`,
        activationCode: decryptActivationCode(activationCodeEncrypted),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/qrs', requireAdmin, async (req, res, next) => {
  try {
    const activationCode = String(randomInt(100000, 1000000));
    const qrId = randomBytes(9).toString('base64url');
    const activationCodeHash = await bcrypt.hash(activationCode, 10);
    const record = await QRCode.create({
      qrId,
      activationCodeHash,
      activationCodeEncrypted: encryptActivationCode(activationCode),
    });

    return res.status(201).json({
      qrId: record.qrId,
      qrUrl: `${publicAppUrl}/q/${encodeURIComponent(record.qrId)}`,
      activationCode,
      status: record.status,
      createdAt: record.createdAt,
    });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/admin/qrs/:qrId', requireAdmin, async (req, res, next) => {
  try {
    const redirectUrl = normalizeDestination(req.body?.redirectUrl);
    if (!redirectUrl) {
      return res.status(400).json({ error: 'Enter a valid website address starting with http:// or https://.' });
    }

    const record = await QRCode.findOne({ qrId: req.params.qrId });
    if (!record) return res.status(404).json({ error: 'This QR code could not be found.' });
    if (record.status !== 'activated') {
      return res.status(409).json({ error: 'Activate this QR code before changing its destination.' });
    }

    record.redirectUrl = redirectUrl;
    await record.save();
    return res.json({
      qrId: record.qrId,
      status: record.status,
      redirectUrl: record.redirectUrl,
      activatedAt: record.activatedAt,
    });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/admin/qrs/:qrId', requireAdmin, async (req, res, next) => {
  try {
    const result = await QRCode.findOneAndDelete({ qrId: req.params.qrId });
    if (!result) return res.status(404).json({ error: 'This QR code could not be found.' });
    return res.json({ qrId: result.qrId, deleted: true });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/qrs/:qrId', async (req, res, next) => {
  try {
    const record = await QRCode.findOne({ qrId: req.params.qrId }).lean();
    if (!record) return res.status(404).json({ error: 'This QR code could not be found.' });
    return res.json({ status: record.status, redirectUrl: record.redirectUrl });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/qrs/:qrId/activate', activationLimiter, async (req, res, next) => {
  try {
    const { activationCode } = req.body ?? {};
    const redirectUrl = normalizeDestination(req.body?.redirectUrl);
    if (typeof activationCode !== 'string' || !/^\d{6}$/.test(activationCode)) {
      return res.status(400).json({ error: 'Enter the six-digit activation code.' });
    }
    if (!redirectUrl) {
      return res.status(400).json({ error: 'Enter a valid website address starting with http:// or https://.' });
    }

    const record = await QRCode.findOne({ qrId: req.params.qrId });
    if (!record) return res.status(404).json({ error: 'This QR code could not be found.' });
    if (record.status !== 'pending' || !record.activationCodeHash) {
      return res.status(409).json({ error: 'This QR code has already been activated.' });
    }
    if (!(await bcrypt.compare(activationCode, record.activationCodeHash))) {
      return res.status(400).json({ error: 'That activation code is not correct.' });
    }

    const result = await QRCode.updateOne(
      { _id: record._id, status: 'pending', activationCodeHash: record.activationCodeHash },
      { $set: { status: 'activated', redirectUrl, activatedAt: new Date() }, $unset: { activationCodeHash: 1 } },
    );
    if (result.modifiedCount !== 1) {
      return res.status(409).json({ error: 'This QR code has already been activated.' });
    }
    return res.json({ status: 'activated', redirectUrl });
  } catch (error) {
    return next(error);
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

const frontendPath = path.resolve(__dirname, '../dist');
const storefrontPath = path.resolve(__dirname, '../main-website');
app.use('/main-website', express.static(storefrontPath));
app.use(express.static(storefrontPath));
app.use(express.static(frontendPath));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  return res.sendFile(path.join(frontendPath, 'index.html'), (error) => {
    if (error) next();
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await mongoose.connect(process.env.MONGODB_URI);
const existingAdmin = await Admin.findOne({ username: adminUsername });
if (!existingAdmin) {
  await Admin.create({
    username: adminUsername,
    passwordHash: await bcrypt.hash(adminPassword, 12),
  });
  console.log(`Created initial admin account "${adminUsername}".`);
}

app.listen(port, () => console.log(`DynamicQR server listening on port ${port}.`));
