import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home' },
    name: String,
    phone: String,
    line1: { type: String, required: true },
    city: { type: String, default: 'Ludhiana' },
    state: { type: String, default: 'Punjab' },
    pincode: { type: String, default: '141001' },
    isDefault: { type: Boolean, default: false }
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^[6-9]\d{9}$/
    },
    name: {
      type: String,
      trim: true,
      maxlength: 60,
      default: ''
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      unique: true
    },
    passwordHash: {
      type: String,
      select: false
    },
    role: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR', 'FARMER', 'VILLAGE_HUB', 'GROWTH_PARTNER', 'ADMIN'],
      default: 'CUSTOMER',
      index: true
    },
    isPhoneVerified: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'BLOCKED', 'DELETED'],
      default: 'ACTIVE',
      index: true
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    addresses: [addressSchema],
    defaultAddressId: {
      type: mongoose.Schema.Types.ObjectId
    },
    fcmTokens: [
      {
        token: String,
        platform: String,
        updatedAt: { type: Date, default: Date.now }
      }
    ],
    lastLoginAt: Date,
    deletedAt: Date,
    orderRevision: {
      type: Number,
      default: 0
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
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

userSchema.virtual('isActive').get(function () {
  return this.status === 'ACTIVE';
});

userSchema.methods.toRupees = function () {
  return Number((this.walletBalance / 100).toFixed(2));
};

export default mongoose.model('User', userSchema);
