import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
});

const qrSchema = new mongoose.Schema({
  qrId: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['pending', 'activated'], default: 'pending', required: true },
  activationCodeHash: { type: String, required: true },
  activationCodeEncrypted: { type: String, default: null },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRBatch', default: null, index: true },
  redirectUrl: { type: String, default: null },
  activatedAt: { type: Date, default: null },
}, { timestamps: true });

const qrBatchSchema = new mongoose.Schema({
  batchNumber: { type: Number, required: true, unique: true },
  count: { type: Number, required: true },
}, { timestamps: true });

const batchCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 0 },
});

export const Admin = mongoose.model('Admin', adminSchema);
export const QRCode = mongoose.model('QRCode', qrSchema);
export const QRBatch = mongoose.model('QRBatch', qrBatchSchema);
export const BatchCounter = mongoose.model('BatchCounter', batchCounterSchema);
