import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const riderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    vehicleType: {
      type: String,
      enum: ['bike', 'cycle', 'on_foot'],
      default: 'bike'
    },
    vehicleNumber: {
      type: String,
      default: 'PB-10-AB-1234'
    },
    status: {
      type: String,
      enum: ['OFFLINE', 'ONLINE_IDLE', 'ON_DELIVERY'],
      default: 'OFFLINE',
      index: true
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined
      }
    },
    locationUpdatedAt: {
      type: Date,
      default: null
    },
    locationAccuracy: { type: Number, default: null },
    activeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    },
    rating: {
      type: Number,
      default: 4.9
    },
    completedDeliveries: {
      type: Number,
      default: 0
    },
    kyc: {
      aadhaarVerified: { type: Boolean, default: true },
      drivingLicenseVerified: { type: Boolean, default: true },
      photoUrl: {
        type: String,
        default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
      }
    },
    bankDetails: {
      accountNumberHash: { type: String, default: '**** **** 8821' },
      ifsc: { type: String, default: 'SBIN0001234' }
    },
    todayEarningsPaise: {
      type: Number,
      default: 0
    },
    totalEarningsPaise: {
      type: Number,
      default: 0
    },
    deviceId: {
      type: String,
      default: ''
    },
    expoPushTokens: [
      {
        token: { type: String, required: true },
        platform: { type: String, default: 'android' },
        deviceId: { type: String, default: null },
        updatedAt: { type: Date, default: Date.now }
      }
    ],
    refreshTokenHash: {
      type: String,
      default: ''
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

// 2dsphere index for ultra-fast geospatial nearest-rider queries
riderSchema.index({ currentLocation: '2dsphere' });
riderSchema.index({ status: 1, locationUpdatedAt: -1 });

// Helper to compare passwords
riderSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// Safe JSON serialization (strip passwordHash and refresh tokens)
riderSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokenHash;
  return obj;
};

export default mongoose.model('Rider', riderSchema);
