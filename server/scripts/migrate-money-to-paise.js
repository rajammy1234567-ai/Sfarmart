import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment');
  process.exit(1);
}

const migrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now }
});

const Migration = mongoose.model('Migration', migrationSchema);

async function runMigration() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if migration has already been executed
    const existing = await Migration.findOne({ name: 'migrate-money-to-paise' });
    if (existing) {
      console.log('ℹ️ Migration "migrate-money-to-paise" has ALREADY been applied at:', existing.appliedAt);
      await mongoose.disconnect();
      return;
    }

    console.log('⚙️ Running migration: converting User walletBalance from rupees to integer paise...');

    // Convert users with rupee wallet balance (e.g., 250) to integer paise (25000)
    // Guard: only convert balances that look like rupees (< 5000)
    const User = (await import('../models/User.js')).default;
    const users = await User.find({ walletBalance: { $gt: 0, $lt: 5000 } });

    let updatedCount = 0;
    for (const user of users) {
      const oldBalance = user.walletBalance;
      const paiseBalance = Math.round(oldBalance * 100);
      user.walletBalance = paiseBalance;
      await user.save();
      updatedCount++;
      console.log(`  👤 User ${user.phone}: converted ₹${oldBalance} -> ${paiseBalance} paise`);
    }

    // Record migration in DB
    await Migration.create({ name: 'migrate-money-to-paise' });
    console.log(`🎉 Migration completed successfully! Updated ${updatedCount} users.`);

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
