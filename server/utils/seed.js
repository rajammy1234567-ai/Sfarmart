import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Order from '../models/Order.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/freemart';

const CATEGORIES_DATA = [
  {
    name: 'Fresh Fruits & Vegetables',
    slug: 'fruits-vegetables',
    icon: '🥦',
    image: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=500&auto=format&fit=crop&q=60',
    type: 'GROCERY',
    sortOrder: 1,
    subCategories: [
      { name: 'Fresh Vegetables', slug: 'fresh-vegetables' },
      { name: 'Fresh Fruits', slug: 'fresh-fruits' },
      { name: 'Exotic & Organic', slug: 'organic' }
    ]
  },
  {
    name: 'Dairy, Bread & Eggs',
    slug: 'dairy-milk',
    icon: '🥛',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=60',
    type: 'GROCERY',
    sortOrder: 2,
    subCategories: [
      { name: 'Milk & Butter', slug: 'milk-butter' },
      { name: 'Paneer & Curd', slug: 'paneer-curd' },
      { name: 'Bread & Pav', slug: 'bread' }
    ]
  },
  {
    name: 'Atta, Rice & Dal',
    slug: 'atta-rice-dal',
    icon: '🌾',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60',
    type: 'GROCERY',
    sortOrder: 3,
    subCategories: [
      { name: 'Atta & Flours', slug: 'atta-flours' },
      { name: 'Rice & Grains', slug: 'rice' },
      { name: 'Dals & Pulses', slug: 'dals' }
    ]
  },
  {
    name: 'Oil, Ghee & Masala',
    slug: 'oil-ghee-masala',
    icon: '🫙',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=60',
    type: 'GROCERY',
    sortOrder: 4,
    subCategories: [
      { name: 'Cooking Oils', slug: 'oils' },
      { name: 'Desi Ghee', slug: 'ghee' },
      { name: 'Spices & Masalas', slug: 'spices' }
    ]
  },
  {
    name: 'Ghar Ka Khana / Home Thali',
    slug: 'home-thali',
    icon: '🍛',
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60',
    type: 'FOOD',
    sortOrder: 5,
    subCategories: [
      { name: 'Punjabi Thali', slug: 'thali' },
      { name: 'Parathas & Rolls', slug: 'parathas' },
      { name: 'Sabzi & Curries', slug: 'curries' }
    ]
  },
  {
    name: 'Mithai & Bakery',
    slug: 'sweets-bakery',
    icon: '🍰',
    image: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=500&auto=format&fit=crop&q=60',
    type: 'FOOD',
    sortOrder: 6,
    subCategories: [
      { name: 'Desi Mithai', slug: 'desi-mithai' },
      { name: 'Cakes & Pastries', slug: 'cakes' },
      { name: 'Cookies & Rusk', slug: 'cookies' }
    ]
  },
  {
    name: 'Snacks & Munchies',
    slug: 'snacks-namkeen',
    icon: '🍿',
    image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281223?w=500&auto=format&fit=crop&q=60',
    type: 'GROCERY',
    sortOrder: 7,
    subCategories: [
      { name: 'Namkeen & Mixtures', slug: 'namkeen' },
      { name: 'Chips & Crisps', slug: 'chips' },
      { name: 'Healthy Snacks', slug: 'healthy-snacks' }
    ]
  },
  {
    name: 'Cold Drinks & Juices',
    slug: 'beverages',
    icon: '🧃',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60',
    type: 'GROCERY',
    sortOrder: 8,
    subCategories: [
      { name: 'Fresh Juices', slug: 'fresh-juices' },
      { name: 'Soft Drinks', slug: 'soft-drinks' },
      { name: 'Lassi & Buttermilk', slug: 'lassi' }
    ]
  }
];

export async function seedDatabase() {
  try {
    console.log('Connecting to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@'));
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully.');

    // 1. Seed Categories (Upsert by slug)
    console.log('--- Seeding Categories ---');
    const categoryMap = {};
    for (const catData of CATEGORIES_DATA) {
      const cat = await Category.findOneAndUpdate(
        { slug: catData.slug },
        { ...catData, isActive: true },
        { upsert: true, new: true }
      );
      categoryMap[cat.slug] = cat;
      console.log(`Category seeded: ${cat.name} (${cat.slug}) -> ${cat._id}`);
    }

    const commonHash = await bcrypt.hash('demo123', 10);

    // 2. Seed Customer (Rajesh Kumar)
    console.log('--- Seeding Customer ---');
    const customer = await User.findOneAndUpdate(
      { phone: '9876543210' },
      {
        name: 'Rajesh Kumar',
        phone: '9876543210',
        passwordHash: commonHash,
        email: 'rajesh.kumar@example.com',
        role: 'CUSTOMER',
        walletBalance: 250,
        addresses: [
          {
            label: 'Home',
            name: 'Rajesh Kumar',
            phone: '9876543210',
            line1: 'Flat 302, Green Avenue, Model Town',
            city: 'Ludhiana',
            state: 'Punjab',
            pincode: '141001',
            isDefault: true
          },
          {
            label: 'Office',
            name: 'Rajesh Kumar',
            phone: '9876543210',
            line1: 'Plot 18, Ferozepur Road Industrial Area',
            city: 'Ludhiana',
            state: 'Punjab',
            pincode: '141012',
            isDefault: false
          }
        ],
        defaultAddressIndex: 0,
        isActive: true
      },
      { upsert: true, new: true }
    );
    console.log(`Customer ready: ${customer.name} (${customer.phone}) -> ${customer._id}`);

    // 3. Seed Vendors
    console.log('--- Seeding Vendors ---');
    const vendorsData = [
      {
        storeName: 'Sunita Home Restro & Sweets',
        ownerName: 'Sunita Sharma',
        phone: '9876543211',
        passwordHash: commonHash,
        storeType: 'HOME_CHEF',
        description: 'Ghar ka shuddh swad — Fresh hot meals, Thalis, Parathas & Desi Ghee Mithai prepared with motherly love.',
        categories: [categoryMap['home-thali']._id, categoryMap['sweets-bakery']._id],
        logo: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=200&auto=format&fit=crop&q=60',
        banner: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80',
        address: {
          line1: 'House 42, Model Town Extn',
          city: 'Ludhiana',
          state: 'Punjab',
          pincode: '141002',
          location: { type: 'Point', coordinates: [75.8573, 30.9010] }
        },
        isOpen: true,
        avgPrepTimeMins: 25,
        deliveryRadiusKm: 8,
        minOrderValue: 99,
        rating: 4.9,
        totalOrders: 142
      },
      {
        storeName: 'Sukhwinder Organic Farms',
        ownerName: 'Sukhwinder Singh',
        phone: '9876543212',
        passwordHash: commonHash,
        storeType: 'FARMER',
        description: 'Farm fresh pesticide-free vegetables, dairy & staples straight from fields within 4 hours of harvest.',
        categories: [
          categoryMap['fruits-vegetables']._id,
          categoryMap['dairy-milk']._id,
          categoryMap['atta-rice-dal']._id
        ],
        logo: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=200&auto=format&fit=crop&q=60',
        banner: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800&auto=format&fit=crop&q=80',
        address: {
          line1: 'Kisan Basti, Pakhowal Road',
          city: 'Ludhiana',
          state: 'Punjab',
          pincode: '141013',
          location: { type: 'Point', coordinates: [75.8450, 30.8800] }
        },
        isOpen: true,
        avgPrepTimeMins: 15,
        deliveryRadiusKm: 10,
        minOrderValue: 79,
        rating: 4.8,
        totalOrders: 230
      },
      {
        storeName: 'Gurpreet Fresh Orchards',
        ownerName: 'Gurpreet Kaur',
        phone: '9876543213',
        passwordHash: commonHash,
        storeType: 'FARMER',
        description: 'Handpicked Himalayan apples, Kinnows, seasonal fruits & cold-pressed natural juices.',
        categories: [
          categoryMap['fruits-vegetables']._id,
          categoryMap['beverages']._id,
          categoryMap['snacks-namkeen']._id
        ],
        logo: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&auto=format&fit=crop&q=60',
        banner: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800&auto=format&fit=crop&q=80',
        address: {
          line1: 'Shop 12, Ferozepur Road',
          city: 'Ludhiana',
          state: 'Punjab',
          pincode: '141001',
          location: { type: 'Point', coordinates: [75.8600, 30.9100] }
        },
        isOpen: true,
        avgPrepTimeMins: 20,
        deliveryRadiusKm: 7,
        minOrderValue: 99,
        rating: 4.7,
        totalOrders: 95
      }
    ];

    const vendorMap = {};
    for (const vData of vendorsData) {
      const vendor = await Vendor.findOneAndUpdate(
        { phone: vData.phone },
        vData,
        { upsert: true, new: true }
      );
      vendorMap[vData.phone] = vendor;
      console.log(`Vendor ready: ${vendor.storeName} (${vendor.phone}) -> ${vendor._id}`);
    }

    // 4. Seed Products
    console.log('--- Seeding Products ---');
    const sunita = vendorMap['9876543211'];
    const sukhwinder = vendorMap['9876543212'];
    const gurpreet = vendorMap['9876543213'];

    const PRODUCTS_DATA = [
      // Sunita's Products (Home Chef - Food & Sweets)
      {
        name: 'Special Punjabi Thali',
        description: '4 Butter Tawa Rotis, Dal Makhani, Shahi Paneer, Jeera Rice, Raita, Salad & Gulab Jamun',
        image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60',
        vendor: sunita._id,
        category: categoryMap['home-thali']._id,
        subCategory: 'thali',
        price: 180,
        mrp: 220,
        unit: '1 thali',
        stockQty: 30,
        inStock: true,
        isVeg: true,
        tags: ['thali', 'punjabi', 'lunch', 'dinner', 'paneer']
      },
      {
        name: 'Aloo Paratha with White Butter',
        description: '2 Crispy whole wheat parathas stuffed with spiced potatoes served with homemade Makhan and fresh curd',
        image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=500&auto=format&fit=crop&q=60',
        vendor: sunita._id,
        category: categoryMap['home-thali']._id,
        subCategory: 'parathas',
        price: 90,
        mrp: 110,
        unit: '2 pcs',
        stockQty: 40,
        inStock: true,
        isVeg: true,
        tags: ['paratha', 'breakfast', 'aloo']
      },
      {
        name: 'Paneer Butter Masala (Ghar Ka)',
        description: 'Cottage cheese cubes slow cooked in rich cashew and tomato gravy with mild home spices',
        image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop&q=60',
        vendor: sunita._id,
        category: categoryMap['home-thali']._id,
        subCategory: 'curries',
        price: 160,
        mrp: 190,
        unit: '300g',
        stockQty: 25,
        inStock: true,
        isVeg: true,
        tags: ['paneer', 'gravy', 'curry']
      },
      {
        name: 'Desi Ghee Gulab Jamun',
        description: 'Soft melt-in-mouth khoya dumplings fried in pure desi ghee and soaked in cardamom saffron syrup',
        image: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=500&auto=format&fit=crop&q=60',
        vendor: sunita._id,
        category: categoryMap['sweets-bakery']._id,
        subCategory: 'desi-mithai',
        price: 120,
        mrp: 150,
        unit: '4 pcs',
        stockQty: 50,
        inStock: true,
        isVeg: true,
        tags: ['sweet', 'mithai', 'gulab jamun', 'dessert']
      },
      {
        name: 'Kaju Katli Premium',
        description: 'Diamond-cut pure cashew fudge made without artificial essence or heavy sugar',
        image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop&q=60',
        vendor: sunita._id,
        category: categoryMap['sweets-bakery']._id,
        subCategory: 'desi-mithai',
        price: 280,
        mrp: 320,
        unit: '250g',
        stockQty: 20,
        inStock: true,
        isVeg: true,
        tags: ['kaju', 'mithai', 'cashew', 'premium']
      },

      // Sukhwinder's Products (Farmer - Veg, Dairy, Staples)
      {
        name: 'Farm Fresh Desi Tomatoes',
        description: 'Locally grown vine-ripened juicy desi red tomatoes, chemical spray free',
        image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=500&auto=format&fit=crop&q=60',
        vendor: sukhwinder._id,
        category: categoryMap['fruits-vegetables']._id,
        subCategory: 'fresh-vegetables',
        price: 35,
        mrp: 45,
        unit: '1 kg',
        stockQty: 60,
        inStock: true,
        isVeg: true,
        tags: ['tomato', 'tamatar', 'fresh', 'vegetable']
      },
      {
        name: 'Organic Mountain Potatoes',
        description: 'Pahar special low-sugar firm potatoes ideal for curries and fries',
        image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=500&auto=format&fit=crop&q=60',
        vendor: sukhwinder._id,
        category: categoryMap['fruits-vegetables']._id,
        subCategory: 'fresh-vegetables',
        price: 28,
        mrp: 35,
        unit: '1 kg',
        stockQty: 100,
        inStock: true,
        isVeg: true,
        tags: ['potato', 'aloo', 'vegetable']
      },
      {
        name: 'Fresh Green Cauliflower (Gobhi)',
        description: 'Crisp snow-white head with fresh green leaves picked this morning',
        image: 'https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?w=500&auto=format&fit=crop&q=60',
        vendor: sukhwinder._id,
        category: categoryMap['fruits-vegetables']._id,
        subCategory: 'fresh-vegetables',
        price: 40,
        mrp: 55,
        unit: '1 pc (approx 600g)',
        stockQty: 30,
        inStock: true,
        isVeg: true,
        tags: ['gobhi', 'cauliflower', 'vegetable']
      },
      {
        name: 'Pure A2 Buffalo Milk',
        description: 'Whole full-cream raw milk directly from grass-fed Murrah buffaloes, unadulterated',
        image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=60',
        vendor: sukhwinder._id,
        category: categoryMap['dairy-milk']._id,
        subCategory: 'milk-butter',
        price: 68,
        mrp: 72,
        unit: '1 Litre',
        stockQty: 45,
        inStock: true,
        isVeg: true,
        tags: ['milk', 'dairy', 'a2', 'fresh']
      },
      {
        name: 'Fresh Malai Paneer Block',
        description: 'Soft, creamy paneer freshly curdled with lemon without chemical hardeners',
        image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop&q=60',
        vendor: sukhwinder._id,
        category: categoryMap['dairy-milk']._id,
        subCategory: 'paneer-curd',
        price: 95,
        mrp: 110,
        unit: '250g',
        stockQty: 30,
        inStock: true,
        isVeg: true,
        tags: ['paneer', 'malai', 'dairy']
      },
      {
        name: 'Chakki Fresh Sharbati Atta',
        description: 'Slow cold-ground 100% MP Sharbati whole wheat flour rich in bran and natural fiber',
        image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60',
        vendor: sukhwinder._id,
        category: categoryMap['atta-rice-dal']._id,
        subCategory: 'atta-flours',
        price: 260,
        mrp: 310,
        unit: '5 kg',
        stockQty: 25,
        inStock: true,
        isVeg: true,
        tags: ['atta', 'wheat', 'chakki', 'flour']
      },
      {
        name: 'Desi Unpolished Toor Dal',
        description: 'Naturally sun-dried unpolished arhar/toor dal that cooks evenly and retains high protein',
        image: 'https://images.unsplash.com/photo-1585994192701-f25b2a0c7847?w=500&auto=format&fit=crop&q=60',
        vendor: sukhwinder._id,
        category: categoryMap['atta-rice-dal']._id,
        subCategory: 'dals',
        price: 145,
        mrp: 170,
        unit: '1 kg',
        stockQty: 35,
        inStock: true,
        isVeg: true,
        tags: ['dal', 'toor', 'arhar', 'pulses']
      },

      // Gurpreet's Products (Farmer/Orchards - Fruits, Beverages, Snacks)
      {
        name: 'Royal Delicious Shimla Apples',
        description: 'Crisp sweet red apples direct from Kinnaur orchard trees',
        image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=500&auto=format&fit=crop&q=60',
        vendor: gurpreet._id,
        category: categoryMap['fruits-vegetables']._id,
        subCategory: 'fresh-fruits',
        price: 160,
        mrp: 199,
        unit: '1 kg (4-5 pcs)',
        stockQty: 35,
        inStock: true,
        isVeg: true,
        tags: ['apple', 'fruits', 'shimla', 'sweet']
      },
      {
        name: 'Nagpur Sweet Kinnow / Orange',
        description: 'Fresh juicy Punjab-border kinnows packed with Vitamin C',
        image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=500&auto=format&fit=crop&q=60',
        vendor: gurpreet._id,
        category: categoryMap['fruits-vegetables']._id,
        subCategory: 'fresh-fruits',
        price: 75,
        mrp: 95,
        unit: '1 kg',
        stockQty: 50,
        inStock: true,
        isVeg: true,
        tags: ['orange', 'kinnow', 'citrus', 'fruits']
      },
      {
        name: 'Fresh Cold-Pressed Sugarcane Juice',
        description: 'Extracted fresh with ginger, mint & lemon without ice or added sugar',
        image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60',
        vendor: gurpreet._id,
        category: categoryMap['beverages']._id,
        subCategory: 'fresh-juices',
        price: 45,
        mrp: 60,
        unit: '300 ml',
        stockQty: 25,
        inStock: true,
        isVeg: true,
        tags: ['juice', 'sugarcane', 'ganne ka ras', 'cold-pressed']
      },
      {
        name: 'Alphonso Mango Pulp Juice',
        description: 'Thick creamy natural Alphonso mango nectar, chilled and refreshing',
        image: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=500&auto=format&fit=crop&q=60',
        vendor: gurpreet._id,
        category: categoryMap['beverages']._id,
        subCategory: 'fresh-juices',
        price: 65,
        mrp: 80,
        unit: '350 ml',
        stockQty: 30,
        inStock: true,
        isVeg: true,
        tags: ['mango', 'juice', 'alphonso', 'beverage']
      },
      {
        name: 'Roasted Salted Phool Makhana',
        description: 'Crispy fox nuts roasted in cold-pressed groundnut oil with rock salt & black pepper',
        image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281223?w=500&auto=format&fit=crop&q=60',
        vendor: gurpreet._id,
        category: categoryMap['snacks-namkeen']._id,
        subCategory: 'healthy-snacks',
        price: 130,
        mrp: 160,
        unit: '100g',
        stockQty: 40,
        inStock: true,
        isVeg: true,
        tags: ['makhana', 'snack', 'healthy', 'namkeen']
      }
    ];

    // Drop legacy index if exists
    try {
      await Product.collection.dropIndex('productId_1');
      console.log('Dropped legacy productId_1 index');
    } catch (e) {
      // ignore
    }

    // Remove legacy default_vendor or invalid products
    await Product.deleteMany({ vendor: { $nin: [sunita._id, sukhwinder._id, gurpreet._id] } });

    for (const pData of PRODUCTS_DATA) {
      await Product.findOneAndUpdate(
        { name: pData.name, vendor: pData.vendor },
        { ...pData, isActive: true },
        { upsert: true, new: true }
      );
      console.log(`Product seeded: ${pData.name} (Rs ${pData.price})`);
    }

    // Also clean any raw legacy products if any have raw string vendors
    try {
      await Product.collection.deleteMany({ vendor: 'default_vendor' });
    } catch (err) {
      // ignore
    }

    console.log('=== SEED COMPLETED SUCCESSFULLY ===');
    console.log(`Categories: 8 seeded`);
    console.log(`Vendors: 3 seeded (Sunita: 9876543211, Sukhwinder: 9876543212, Gurpreet: 9876543213)`);
    console.log(`Customer: 1 seeded (Rajesh: 9876543210)`);
    console.log(`Products: ${PRODUCTS_DATA.length} seeded`);
    
    return true;
  } catch (err) {
    console.error('Seed error:', err);
    throw err;
  }
}

// If executed directly
if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(() => {
      console.log('Seed script finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed script failed:', err);
      process.exit(1);
    });
}
