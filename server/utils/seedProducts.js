import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const productsToSeed = [
  // 1. Newly Uploaded Partner Products (Chef Sunita Sharma / Partner ID: default_vendor)
  {
    productId: 'v-item-4',
    name: 'Special Amritsari Chole Kulche Thali',
    category: 'homerestro',
    service: 'homerestro',
    price: 140,
    unit: 'thali',
    rating: 5.0,
    reviewsCount: 42,
    farmer: 'Chef Sunita Sharma (Sunita Home Restro & Sweets)',
    partnerId: 'default_vendor',
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500&auto=format&fit=crop&q=80',
    description: 'Authentic Amritsari Chole slow-cooked with roasted spices, served with 2 soft butter kulchas, pickled onions & green chutney.',
    discount: 'NEW PARTNER LAUNCH',
    stock: 20,
    inStock: true
  },
  {
    productId: 'v-item-5',
    name: 'Desi Ghee Moong Dal Halwa',
    category: 'sweets',
    service: 'bakery_sweets',
    price: 180,
    unit: '250g',
    rating: 4.9,
    reviewsCount: 31,
    farmer: 'Chef Sunita Sharma (Sunita Home Restro & Sweets)',
    partnerId: 'default_vendor',
    image: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=500&auto=format&fit=crop&q=80',
    description: 'Rich, aromatic winter delicacy prepared with slow-roasted yellow lentils, pure A2 desi cow ghee, cashews & saffron.',
    discount: 'NEW PARTNER LAUNCH',
    stock: 15,
    inStock: true
  },
  {
    productId: 'v-item-6',
    name: 'Farm Fresh Organic Yellow Capsicum',
    category: 'veggies',
    service: 'farm_harvest',
    price: 60,
    unit: '500g',
    rating: 4.8,
    reviewsCount: 24,
    farmer: 'Chef Sunita Sharma (Sunita Home Restro & Sweets)',
    partnerId: 'default_vendor',
    image: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=500&auto=format&fit=crop&q=80',
    description: 'Crispy, sweet, vitamin-rich greenhouse grown organic yellow bell peppers freshly harvested today.',
    discount: 'NEW PARTNER LAUNCH',
    stock: 35,
    inStock: true
  },

  // 2. Existing Partner Store Core Products
  {
    productId: 'v-item-1',
    name: 'Special Punjabi Rajma Thali',
    category: 'homerestro',
    service: 'homerestro',
    price: 130,
    unit: 'thali',
    rating: 4.9,
    reviewsCount: 95,
    farmer: 'Chef Sunita Sharma (Sunita Home Restro & Sweets)',
    partnerId: 'default_vendor',
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80',
    description: 'Rich Punjabi Rajma cooked in pure ghee, served with Basmati rice, 2 Tandoori Rotis & Raita.',
    discount: 'BEST HOME THALI',
    stock: 25,
    inStock: true
  },
  {
    productId: 'v-item-2',
    name: 'Organic Gur Besan Ladoo',
    category: 'sweets',
    service: 'bakery_sweets',
    price: 240,
    unit: '500g',
    rating: 5.0,
    reviewsCount: 64,
    farmer: 'Chef Sunita Sharma (Sunita Home Restro & Sweets)',
    partnerId: 'default_vendor',
    image: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=500&auto=format&fit=crop&q=80',
    description: 'Traditional Besan Ladoo prepared using organic jaggery (Gur) and pure Desi Ghee.',
    discount: 'NO REFINED SUGAR',
    stock: 15,
    inStock: true
  },
  {
    productId: 'v-item-3',
    name: 'Pure Desi Cow Ghee (A2 Bilona)',
    category: 'dairy',
    service: 'farmart_mart',
    price: 650,
    unit: '500g',
    rating: 4.9,
    reviewsCount: 289,
    farmer: 'Chef Sunita Sharma (Sunita Home Restro & Sweets)',
    partnerId: 'default_vendor',
    image: 'https://images.unsplash.com/photo-1589927986089-35812388d1f4?w=500&auto=format&fit=crop&q=80',
    description: 'Traditionally churned Bilona method A2 cow ghee with authentic aroma and granular texture.',
    discount: 'TOP SELLER',
    stock: 8,
    inStock: true
  },

  // 3. Direct Farm Harvest & Groceries
  {
    productId: 'p1',
    name: 'Farm Fresh Organic Red Tomatoes',
    category: 'veggies',
    service: 'farm_harvest',
    price: 38,
    unit: 'kg',
    rating: 4.8,
    reviewsCount: 142,
    farmer: 'Sukhwinder Singh (Tarn Taran Farm)',
    partnerId: 'farmer_sukhwinder',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=500&auto=format&fit=crop&q=80',
    description: 'Naturally ripened, pesticides-free farm fresh tomatoes harvested daily at dawn.',
    discount: '15% OFF',
    stock: 50,
    inStock: true
  },
  {
    productId: 'p4',
    name: 'Kinnow Mandarin Fresh Fruits',
    category: 'fruits',
    service: 'farm_harvest',
    price: 75,
    unit: 'kg',
    rating: 4.7,
    reviewsCount: 88,
    farmer: 'Gurpreet Orchards (Abohar)',
    partnerId: 'farmer_gurpreet',
    image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=500&auto=format&fit=crop&q=80',
    description: 'Juicy, vitamin-C rich Kinnow freshly picked from Abohar orchards.',
    discount: 'FARM FRESH',
    stock: 40,
    inStock: true
  },
  {
    productId: 'p9',
    name: 'Crisp Punjab Green Spinach (Palak)',
    category: 'veggies',
    service: 'farm_harvest',
    price: 25,
    unit: 'bunch (250g)',
    rating: 4.9,
    reviewsCount: 76,
    farmer: 'Harpreet Organics (Amritsar)',
    partnerId: 'farmer_harpreet',
    image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500&auto=format&fit=crop&q=80',
    description: 'Tender green iron-rich spinach leaves harvested fresh without synthetic chemicals.',
    discount: 'MORNING HARVEST',
    stock: 30,
    inStock: true
  },
  {
    productId: 'p10',
    name: 'Royal Shimla Red Apples',
    category: 'fruits',
    service: 'farm_harvest',
    price: 160,
    unit: 'kg',
    rating: 4.9,
    reviewsCount: 110,
    farmer: 'Himachal Farm Producer Co-Op',
    partnerId: 'fpo_himachal',
    image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=500&auto=format&fit=crop&q=80',
    description: 'Sweet, crunchy high-altitude Shimla apples directly sourced from mountain orchards.',
    discount: 'PREMIUM',
    stock: 25,
    inStock: true
  },
  {
    productId: 'p8',
    name: 'Organic Whole Sharbati Wheat Atta',
    category: 'grocery',
    service: 'farmart_mart',
    price: 290,
    unit: '5kg',
    rating: 4.9,
    reviewsCount: 154,
    farmer: 'Village Hub Farmers Network',
    partnerId: 'hub_ludhiana',
    image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=500&auto=format&fit=crop&q=80',
    description: 'Chakki fresh stone-ground MP Sharbati wheat flour packed with natural bran fibers.',
    discount: 'CHAKKI FRESH',
    stock: 45,
    inStock: true
  },
  {
    productId: 'p11',
    name: 'Cold-Pressed Kachi Ghani Mustard Oil',
    category: 'grocery',
    service: 'farmart_mart',
    price: 195,
    unit: '1 Liter',
    rating: 4.8,
    reviewsCount: 98,
    farmer: 'Farmart Agro Mills',
    partnerId: 'hub_ludhiana',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80',
    description: 'Pure wood-pressed mustard oil with pungent natural aroma and zero chemical refining.',
    discount: '100% PURE',
    stock: 35,
    inStock: true
  },
  {
    productId: 'p12',
    name: 'Aromatic Aged Royal Basmati Rice',
    category: 'grocery',
    service: 'farmart_mart',
    price: 480,
    unit: '5kg',
    rating: 4.9,
    reviewsCount: 210,
    farmer: 'Gurdaspur Paddy Growers',
    partnerId: 'hub_gurdaspur',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80',
    description: 'Extra long grain 2-year aged Basmati rice with heavenly fragrance.',
    discount: 'AGED GRAIN',
    stock: 40,
    inStock: true
  }
];

async function seedDatabase() {
  console.log('Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    console.log('Upserting products into MongoDB Atlas collection...');
    let inserted = 0;
    let updated = 0;

    for (const item of productsToSeed) {
      const result = await Product.findOneAndUpdate(
        { productId: item.productId },
        { $set: item },
        { upsert: true, new: true }
      );
      if (result) {
        inserted++;
      }
    }

    const totalInDB = await Product.countDocuments();
    console.log(`🎉 SUCCESS: ${inserted} products successfully synced to MongoDB Atlas!`);
    console.log(`📦 Total Products in MongoDB Atlas: ${totalInDB}`);

    const partnerCount = await Product.countDocuments({ partnerId: 'default_vendor' });
    console.log(`🏪 Products for Partner (default_vendor): ${partnerCount}`);

    await mongoose.disconnect();
    console.log('Disconnected cleanly from MongoDB Atlas.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding MongoDB Atlas:', error);
    process.exit(1);
  }
}

seedDatabase();
