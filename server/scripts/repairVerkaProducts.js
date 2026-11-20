// repairVerkaProducts.js
// Safe repair utility to update invalid local device image paths for Verka products (and other affected products)
// Preserves exact IDs, prices, units, stock, category mappings, and vendor relationships.
import 'dotenv/config';
import mongoose from 'mongoose';
import { isInvalidClientImagePath } from '../controllers/productController.js';
import { storeProductImage } from '../services/imageStorageService.js';

// Exact product-and-pack matched durable high-resolution images for Verka products
export const VERKA_REPAIR_MAP = {
  '6afc4394a91676d829dcf0b2': {
    name: 'Verka Desi Ghee',
    unit: '5 ltr',
    packType: '5 Ltr Tin',
    source: 'Verified Product Packaging CDN (IndiaMART)',
    image: 'https://5.imimg.com/data5/SELLER/Default/2024/2/385074738/MT/DN/RQ/45089664/5-l-verka-pure-ghee-500x500.jpg'
  },
  '6afc42c2a91676d829dcf096': {
    name: 'Verka Cow Ghee',
    unit: '200 ml',
    packType: '200 ml Pouch/Jar',
    source: 'Verified Product Packaging CDN (Blinkit/Grofers)',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=1080/da/cms-assets/cms/product/2fc98f41-7394-4e64-bbd3-0b93a49c24d5.png?bg_token=color.background.quaternary'
  },
  '6afc3893a91676d829dcef22': {
    name: 'Verka Cow Ghee',
    unit: '1 ltr',
    packType: '1 Ltr Ceka Pack',
    source: 'Verified Product Packaging CDN (IndiaMART)',
    image: 'https://5.imimg.com/data5/SELLER/Default/2025/6/523138476/CA/DD/KZ/61625738/verka-pure-cow-ghee-500x500.png'
  },
  '6afc361aa91676d829dceeb3': {
    name: 'Verka Desi Ghee',
    unit: '1 ltr',
    packType: '1 Ltr Ceka Pack',
    source: 'Verified Product Packaging CDN (BigBasket)',
    image: 'https://www.bbassets.com/media/uploads/p/l/40096999_7-verka-ghee.jpg'
  },
  '6afc3108a91676d829dcedba': {
    name: 'Verka Desi Ghee',
    unit: '500 ml',
    packType: '500 ml Ceka Pack',
    source: 'Verified Product Packaging CDN (BigBasket)',
    image: 'https://www.bbassets.com/media/uploads/p/l/40103517_7-verka-ghee.jpg'
  }
};

export async function verifyImageUrl(url) {
  if (!url || typeof url !== 'string') return { ok: false, reason: 'URL is empty or not a string' };
  if (isInvalidClientImagePath(url)) return { ok: false, reason: 'URL is a local device/cache path' };

  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const contentType = res.headers.get('content-type') || '';
    const isImage = contentType.startsWith('image/');
    return {
      ok: res.ok && isImage,
      status: res.status,
      contentType,
      reason: res.ok && isImage ? 'OK' : `HTTP ${res.status}, Content-Type: ${contentType}`
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export async function repairProducts({ mongoUri, customImageMap = {}, execute = false }) {
  if (!mongoUri) {
    throw new Error('Missing mongoUri.');
  }

  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log(`[PASS] Connected to "${mongoose.connection.name}" on host "${mongoose.connection.host}"`);

  const productsCol = mongoose.connection.db.collection('products');
  const allProducts = await productsCol.find({}).toArray();
  console.log(`Total products in database: ${allProducts.length}`);

  const invalidProducts = allProducts.filter(p => isInvalidClientImagePath(p.image));
  console.log(`Products with invalid local device image paths: ${invalidProducts.length}`);

  const verkaToRepair = allProducts.filter(p => (p.name || '').toLowerCase().includes('verka'));
  console.log(`Verka products found: ${verkaToRepair.length}`);

  const results = [];

  for (const product of verkaToRepair) {
    const idStr = String(product._id);
    const custom = customImageMap[idStr];
    const defaultEntry = VERKA_REPAIR_MAP[idStr];
    const targetImage = custom || defaultEntry?.image || defaultEntry?.fallbackImage || 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80';

    console.log(`\nInspecting Product [${idStr}] "${product.name}" (${product.unit}):`);
    console.log(`  Current image : "${product.image}"`);
    console.log(`  Proposed image: "${targetImage}"`);

    // Verify target URL
    const check = await verifyImageUrl(targetImage);
    console.log(`  URL Verification: ${check.ok ? '✅ PASS' : '❌ FAIL'} (${check.reason})`);

    if (!check.ok) {
      console.warn(`  [SKIP] Refusing to set unverified or non-image URL: ${targetImage}`);
      results.push({ id: idStr, name: product.name, status: 'SKIPPED_UNVERIFIED_IMAGE', error: check.reason });
      continue;
    }

    if (execute) {
      let finalImagePath = targetImage;
      try {
        console.log(`  Downloading image bytes from: ${targetImage}`);
        const imgRes = await fetch(targetImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!imgRes.ok) {
          throw new Error(`Download failed: HTTP ${imgRes.status}`);
        }
        const arrayBuf = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        console.log(`  Storing image (${Math.round(buffer.length / 1024)} KB) into MongoDB GridFS durable storage...`);
        const stored = await storeProductImage({
          buffer,
          originalName: `${product.name.replace(/\s+/g, '_')}_${product.unit}.jpg`,
          mimeType: check.contentType,
          vendorId: product.vendor
        });
        finalImagePath = stored.path;
        console.log(`  Durable GridFS URL generated: ${finalImagePath}`);
      } catch (storeErr) {
        console.warn(`  [WARN] GridFS storage failed (${storeErr.message}), falling back to direct durable CDN reference.`);
      }

      await productsCol.updateOne(
        { _id: product._id },
        {
          $set: {
            image: finalImagePath,
            updatedAt: new Date()
          }
        }
      );
      console.log(`  [UPDATED] Successfully repaired product image in MongoDB.`);
      results.push({ id: idStr, name: product.name, status: 'REPAIRED', durableImage: finalImagePath });
    } else {
      console.log(`  [DRY-RUN] Would download bytes and store in durable GridFS media storage. Run with execute=true to persist.`);
      results.push({ id: idStr, name: product.name, status: 'DRY_RUN_ELIGIBLE', proposedSource: targetImage });
    }
  }

  await mongoose.disconnect();
  return results;
}

if (process.argv[1] && process.argv[1].endsWith('repairVerkaProducts.js')) {
  const uri = process.env.PROD_SETUP_MONGO_URI || process.env.MONGODB_URI;
  const execute = process.argv.includes('--execute');
  repairProducts({ mongoUri: uri, execute })
    .then(r => {
      console.log('\n--- Summary ---');
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[FATAL]', err.message);
      process.exit(1);
    });
}
