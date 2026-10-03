import mongoose from 'mongoose';

const pushReceiptSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    token: {
      type: String,
      required: true
    },
    recipientRole: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR', 'RIDER', 'UNKNOWN'],
      default: 'UNKNOWN'
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    attempt: {
      type: Number,
      default: 1
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    nextCheckAt: {
      type: Date,
      default: () => new Date(Date.now() + 30000),
      index: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'CLEANUP_PENDING'],
      default: 'PENDING',
      index: true
    },
    cleanupStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'COMPLETED'],
      default: 'NONE',
      index: true
    },
    leaseToken: {
      type: String,
      default: null,
      index: true
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true
    },
    lastError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Auto-expire receipts after 7 days
pushReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const PushReceipt = mongoose.models.PushReceipt || mongoose.model('PushReceipt', pushReceiptSchema);

export default PushReceipt;
