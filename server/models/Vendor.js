import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      required: true,
      trim: true
    },
    ownerName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    passwordHash: {
      type: String,
      select: false,
      required: true
    },
    storeType: {
      type: String,
      enum: ['FARMER', 'HOME_CHEF', 'KIRANA', 'DAIRY', 'BAKERY'],
      required: true
    },
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
      }
    ],
    description: {
      type: String,
      default: ''
    },
    logo: {
      type: String,
      default: ''
    },
    banner: {
      type: String,
      default: ''
    },
    address: {
      line1: { type: String, default: '' },
      city: { type: String, default: 'Ludhiana' },
      state: { type: String, default: 'Punjab' },
      pincode: { type: String, default: '141001' },
      location: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number],
          default: [75.8573, 30.9010] // [lng, lat]
        }
      }
    },
    isOpen: {
      type: Boolean,
      default: true // vendor toggle
    },
    isApproved: {
      type: Boolean,
      default: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    avgPrepTimeMins: {
      type: Number,
      default: 25
    },
    deliveryRadiusKm: {
      type: Number,
      default: 7
    },
    minOrderValue: {
      type: Number,
      default: 99
    },
    rating: {
      type: Number,
      default: 4.8
    },
    totalOrders: {
      type: Number,
      default: 0
    },
    expoPushTokens: [
      {
        type: String
      }
    ],
    bank: {
      accountLast4: { type: String, default: '4321' },
      ifsc: { type: String, default: 'SBIN0001234' },
      payoutDay: { type: String, default: 'WEDNESDAY' }
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

vendorSchema.index({ 'address.location': '2dsphere' });
vendorSchema.index({ isOpen: 1, rating: -1 });

export default mongoose.model('Vendor', vendorSchema);
