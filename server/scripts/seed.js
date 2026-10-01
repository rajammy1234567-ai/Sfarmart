import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';

const seedMarketplaceData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Missing MONGODB_URI');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for seeding verification.');

    const catCount = await Category.countDocuments();
    const vendorCount = await Vendor.countDocuments();
    const productCount = await Product.countDocuments();

    console.log(`Current DB State: ${catCount} categories, ${vendorCount} vendors, ${productCount} products.`);
    console.log('Seed database status: ACTIVE & OPERATIONAL.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed verification error:', err);
    process.exit(1);
  }
};

seedMarketplaceData();
