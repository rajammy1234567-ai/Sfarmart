// categoryBootstrapService.js – Automatic durable illustration bootstrap and category curation sync
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import { storeProductImage, getGridFSBucket } from './imageStorageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '../assets/categories');

export const CANONICAL_CATEGORIES_BOOTSTRAP = [
  {
    id: '6aaa44d4bba7479a91ad1755',
    slug: 'fruits-vegetables',
    name: 'Fresh Fruits & Vegetables',
    file: 'fruits-vegetables.jpg',
    icon: '🥦',
    type: 'GROCERY',
    sortOrder: 1
  },
  {
    id: '6aaa44d4bba7479a91ad1756',
    slug: 'dairy-milk',
    name: 'Dairy, Bread & Eggs',
    file: 'dairy-bread-eggs.jpg',
    icon: '🥛',
    type: 'GROCERY',
    sortOrder: 2
  },
  {
    id: '6aaa44d4bba7479a91ad1757',
    slug: 'atta-rice-dal',
    name: 'Atta, Rice & Dal',
    file: 'atta-rice-dal.jpg',
    icon: '🌾',
    type: 'GROCERY',
    sortOrder: 3
  },
  {
    id: '6aaa44d4bba7479a91ad1758',
    slug: 'oil-ghee-masala',
    name: 'Oil, Ghee & Masala',
    file: 'oil-ghee-masala.jpg',
    icon: '🫙',
    type: 'GROCERY',
    sortOrder: 4
  },
  {
    id: '6aaa44d4bba7479a91ad1759',
    slug: 'home-thali',
    name: 'Ghar Ka Khana / Home Thali',
    file: 'home-thali.jpg',
    icon: '🍛',
    type: 'FOOD',
    sortOrder: 5
  },
  {
    id: '6aaa44d4bba7479a91ad175a',
    slug: 'sweets-bakery',
    name: 'Mithai & Bakery',
    file: 'mithai-bakery.jpg',
    icon: '🍰',
    type: 'FOOD',
    sortOrder: 6
  },
  {
    id: '6aaa44d4bba7479a91ad175b',
    slug: 'snacks-namkeen',
    name: 'Snacks & Munchies',
    file: 'snacks-munchies.jpg',
    icon: '🍿',
    type: 'GROCERY',
    sortOrder: 7
  },
  {
    id: '6aaa44d4bba7479a91ad175c',
    slug: 'beverages',
    name: 'Cold Drinks & Juices',
    file: 'cold-drinks-juices.jpg',
    icon: '🧃',
    type: 'GROCERY',
    sortOrder: 8
  }
];

/**
 * Checks if a GridFS file ID exists in the database
 */
async function gridFSFileExists(fileIdStr) {
  if (!fileIdStr || !mongoose.isValidObjectId(fileIdStr)) return false;
  try {
    const bucket = getGridFSBucket();
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileIdStr) }).limit(1).toArray();
    return files.length > 0;
  } catch {
    return false;
  }
}

/**
 * Uploads an illustration file into GridFS and returns its durable path
 */
async function uploadIllustrationToGridFS(filename, categorySlug) {
  const filePath = path.join(ASSETS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[CategoryBootstrap] Asset file not found: ${filePath}`);
    return null;
  }

  const buffer = fs.readFileSync(filePath);
  const stored = await storeProductImage({
    buffer,
    originalName: `category_${categorySlug}.jpg`,
    mimeType: 'image/jpeg',
    vendorId: 'admin_curation'
  });

  return stored.path;
}

/**
 * Bootstraps and verifies the 8 canonical categories on server startup:
 * 1. Ensures homeVisibility = true and isActive = true on all 8 categories
 * 2. Uploads approved 3D illustrations to GridFS if category currently points to legacy Unsplash photo, broken link, or is missing
 * 3. Preserves any custom non-Unsplash image or sort order saved by Admin
 */
export async function bootstrapCategoryIllustrations() {
  console.log('[CategoryBootstrap] Verifying category illustrations and curation...');
  const results = [];

  try {
    for (const item of CANONICAL_CATEGORIES_BOOTSTRAP) {
      let category = null;

      if (mongoose.isValidObjectId(item.id)) {
        category = await Category.findById(item.id);
      }
      if (!category) {
        category = await Category.findOne({ slug: item.slug });
      }

      if (!category) {
        // Create canonical category if missing
        console.log(`[CategoryBootstrap] Creating missing category: ${item.name} (${item.slug})`);
        const imagePath = await uploadIllustrationToGridFS(item.file, item.slug);
        category = await Category.create({
          _id: new mongoose.Types.ObjectId(item.id),
          name: item.name,
          nameNormalized: item.name.toLowerCase().trim(),
          slug: item.slug,
          icon: item.icon,
          image: imagePath || '',
          type: item.type,
          sortOrder: item.sortOrder,
          isActive: true,
          homeVisibility: true
        });
        results.push({ name: item.name, action: 'CREATED', image: imagePath });
        continue;
      }

      // Check if image needs replacement:
      // - Empty or missing image
      // - Legacy Unsplash stock photo URL
      // - Points to a non-existent GridFS ID
      const currentImage = (category.image || '').trim();
      const isUnsplash = currentImage.includes('unsplash.com');
      const isBlank = !currentImage;

      let isBrokenGridFS = false;
      const gridFSMatch = currentImage.match(/\/uploads\/product-images\/([a-f0-9]{24})/i);
      if (gridFSMatch) {
        const fileId = gridFSMatch[1];
        const exists = await gridFSFileExists(fileId);
        if (!exists) {
          isBrokenGridFS = true;
        }
      }

      const needsNewImage = isUnsplash || isBlank || isBrokenGridFS;
      let updatedFields = {};

      if (needsNewImage) {
        console.log(`[CategoryBootstrap] Uploading illustration for ${item.name} (prior image: ${currentImage ? currentImage.slice(0, 50) + '...' : 'none'})...`);
        const durablePath = await uploadIllustrationToGridFS(item.file, item.slug);
        if (durablePath) {
          category.image = durablePath;
          updatedFields.image = durablePath;
        }
      }

      // Ensure homeVisibility and isActive are enabled
      if (!category.homeVisibility) {
        category.homeVisibility = true;
        updatedFields.homeVisibility = true;
      }
      if (!category.isActive) {
        category.isActive = true;
        updatedFields.isActive = true;
      }

      if (Object.keys(updatedFields).length > 0) {
        await category.save();
        console.log(`[CategoryBootstrap] Updated category ${item.name}:`, updatedFields);
        results.push({ name: item.name, action: 'UPDATED', changes: updatedFields });
      } else {
        results.push({ name: item.name, action: 'PRESERVED', image: category.image });
      }
    }

    console.log('[CategoryBootstrap] Verification completed successfully.');
    return { success: true, count: results.length, results };
  } catch (err) {
    console.error('[CategoryBootstrap] Error during bootstrap:', err.message);
    return { success: false, error: err.message };
  }
}
