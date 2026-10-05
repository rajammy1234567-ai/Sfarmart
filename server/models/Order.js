import crypto from 'node:crypto';
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    orderId: {
      type: String,
      default: function() {
        return this.orderNumber;
      }
    },
    clientOrderId: {
      type: String
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        name: { type: String, required: true },
        image: { type: String, default: '' },
        unit: { type: String, default: 'unit' },
        price: { type: Number, required: true },
        qty: { type: Number, required: true, min: 1 },
        lineTotal: { type: Number, required: true }
      }
    ],
    pricing: {
      itemsTotal: { type: Number, required: true, default: 0 },
      deliveryFee: { type: Number, default: 0 },
      taxes: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      grandTotal: { type: Number, required: true, default: 0 }
    },
    payment: {
      method: {
        type: String,
        enum: ['COD', 'RAZORPAY', 'ONLINE_UPI', 'UPI', 'CARD', 'WALLET'],
        required: true
      },
      status: {
        type: String,
        enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
        default: 'PENDING'
      },
      razorpayOrderId: String,
      razorpayPaymentId: String,
      razorpaySignature: String,
      verified: { type: Boolean, default: false },
      paymentId: { type: String },
      capturedAt: { type: Date },
      errorDescription: { type: String },
      creationClaimId: String,
      creationClaimExpiresAt: Date,
      creationState: {
        type: String,
        enum: ['IDLE', 'CLAIMED', 'DISPATCHING', 'LINKED', 'RECONCILIATION_REQUIRED'],
        default: 'IDLE'
      },
      unconfirmedRazorpayOrderId: String
    },
    address: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      city: { type: String, default: 'Ludhiana' },
      pincode: { type: String, default: '141001' },
      lat: Number,
      lng: Number
    },
    status: {
      type: String,
      enum: [
        'NEW_ORDER',
        'ACCEPTED',
        'PREPARING',
        'READY_FOR_RIDER',
        'RIDER_ASSIGNED',
        'RIDER_ARRIVED_STORE',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'REJECTED'
      ],
      default: 'NEW_ORDER',
      index: true
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        at: { type: Date, default: Date.now },
        by: { type: String, default: 'SYSTEM' }
      }
    ],
    rejectionReason: {
      type: String,
      default: ''
    },
    pickupOtp: {
      type: String,
      default: () => crypto.randomInt(1000, 10000).toString()
    },
    deliveryOtp: {
      type: String,
      default: () => crypto.randomInt(1000, 10000).toString()
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
      default: null,
      index: true
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
      default: null
    },
    riderAssignedAt: {
      type: Date,
      default: null
    },
    riderAcceptedAt: {
      type: Date,
      default: null
    },
    currentOffer: {
      rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', default: null },
      expiresAt: { type: Date, default: null },
      offerId: { type: String, default: null },
      offeredAt: { type: Date, default: null }
    },
    riderLocation: { lat: Number, lng: Number, speed: Number, heading: Number, accuracy: Number, at: Date },
    deliveryRoute: [
      {
        lat: Number,
        lng: Number,
        at: { type: Date, default: Date.now }
      }
    ],
    placedAt: {
      type: Date,
      default: Date.now
    },
    isStagingFixture: {
      type: Boolean,
      default: false
    },
    fixtureRunId: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

orderSchema.index({ vendor: 1, status: 1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index(
  { customer: 1, clientOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientOrderId: { $type: 'string' } }
  }
);

export default mongoose.model('Order', orderSchema);
