import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Rider from '../models/Rider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/sfarmart';

const DEMO_RIDERS = [
  {
    name: 'Gurmukh Singh',
    phone: '9876543220',
    password: 'demo123',
    vehicleType: 'bike',
    vehicleNumber: 'PB-10-AB-1234',
    status: 'ONLINE_IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [75.8573, 30.9010] // Ludhiana Center
    },
    rating: 4.95,
    completedDeliveries: 148,
    todayEarningsPaise: 13000, // ₹130 (2 deliveries)
    totalEarningsPaise: 962000, // ₹9,620
    kyc: {
      aadhaarVerified: true,
      drivingLicenseVerified: true,
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    },
    bankDetails: {
      accountNumberHash: '**** **** 8821',
      ifsc: 'SBIN0001234'
    }
  },
  {
    name: 'Harpreet Singh',
    phone: '9876543221',
    password: 'demo123',
    vehicleType: 'bike',
    vehicleNumber: 'PB-10-CD-5678',
    status: 'ONLINE_IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [75.8540, 30.8980] // Model Town Ludhiana
    },
    rating: 4.88,
    completedDeliveries: 92,
    todayEarningsPaise: 6500, // ₹65 (1 delivery)
    totalEarningsPaise: 598000,
    kyc: {
      aadhaarVerified: true,
      drivingLicenseVerified: true,
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
    },
    bankDetails: {
      accountNumberHash: '**** **** 4310',
      ifsc: 'HDFC0000456'
    }
  },
  {
    name: 'Manjinder Singh',
    phone: '9876543222',
    password: 'demo123',
    vehicleType: 'cycle',
    vehicleNumber: 'PB-10-EF-9012',
    status: 'ONLINE_IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [75.8600, 30.9050] // Sarabha Nagar Ludhiana
    },
    rating: 4.92,
    completedDeliveries: 64,
    todayEarningsPaise: 0,
    totalEarningsPaise: 416000,
    kyc: {
      aadhaarVerified: true,
      drivingLicenseVerified: true,
      photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'
    },
    bankDetails: {
      accountNumberHash: '**** **** 9012',
      ifsc: 'PUNB0007890'
    }
  }
];

export async function seedRiders() {
  try {
    console.log('🌱 Seeding Demo Delivery Riders...');
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }

    for (const r of DEMO_RIDERS) {
      const passwordHash = await bcrypt.hash(r.password, 10);
      await Rider.findOneAndUpdate(
        { phone: r.phone },
        {
          $set: {
            name: r.name,
            passwordHash,
            vehicleType: r.vehicleType,
            vehicleNumber: r.vehicleNumber,
            status: r.status,
            currentLocation: r.currentLocation,
            rating: r.rating,
            completedDeliveries: r.completedDeliveries,
            todayEarningsPaise: r.todayEarningsPaise,
            totalEarningsPaise: r.totalEarningsPaise,
            kyc: r.kyc,
            bankDetails: r.bankDetails,
            locationUpdatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      console.log(`✅ Seeded Rider: ${r.name} (${r.phone} / ${r.password}) — ${r.vehicleNumber}`);
    }
    console.log('🎉 Demo Riders Seeding Complete!');
  } catch (err) {
    console.error('🚨 Error seeding riders:', err);
  }
}

// Run standalone if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedRiders().then(() => {
    process.exit(0);
  });
}
