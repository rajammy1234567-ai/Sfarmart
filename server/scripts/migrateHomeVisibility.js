// migrateHomeVisibility.js
// Migration script to set homeVisibility for specific canonical slugs.
// Default mode is preview (dry‑run). Use --apply to perform writes.
// Does NOT execute automatically; run with `node migrateHomeVisibility.js`.

import mongoose from 'mongoose';
import Category from '../models/Category.js';
import { validateStagingUri, sanitizeErrorMessage } from './stagingFixtures.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// --- Configuration ---
const TARGETS = [
  // homeVisibility = true
  { slug: 'fruits-vegetables', visibility: true },
  { slug: 'dairy-milk', visibility: true },
  { slug: 'atta-rice-dal', visibility: true },
  { slug: 'oil-ghee-masala', visibility: true },
  { slug: 'home-thali', visibility: true },
  { slug: 'sweets-bakery', visibility: true },
  { slug: 'snacks-namkeen', visibility: true },
  { slug: 'beverages', visibility: true },
  // homeVisibility = false (explicit overrides)
  { slug: 'organic-hydroponics', visibility: false },
  { slug: 'staging-produce-sfix_1790844015081_zwtr8', visibility: false }
];

async function main() {
  const args = process.argv.slice(2);
  const uri = process.env.STAGING_SETUP_MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    // Throw to be caught by outer handler; CLI will set exit code.
    throw new Error('[ERROR] Missing database credentials: set STAGING_SETUP_MONGO_URI or MONGODB_URI');
  }
  const apply = args.includes('--apply');
  const dryRun = !apply;

  console.log(`[MIGRATE] Starting ${dryRun ? 'preview (dry‑run)' : 'live'} migration`);

  // Validate URI before any DB interaction
  let validatedUri;
  try {
    validatedUri = validateStagingUri(uri);
  } catch (e) {
    throw new Error('[ERROR] URI validation failed: ' + sanitizeErrorMessage(e.message));
  }

  let session = null;
  try {
    // Connect (both preview and apply need a connection for look‑ups)
    await mongoose.connect(validatedUri, { autoCreate: false, autoIndex: false });

    if (dryRun) {
      // --------- Preview mode (read‑only) ---------
      const updates = [];
      for (const t of TARGETS) {
        const doc = await Category.findOne({ slug: t.slug }).lean();
        if (!doc) {
          throw new Error(`[ERROR] Slug not found during preview: ${t.slug}`);
        }
        if (doc.homeVisibility !== t.visibility) {
          updates.push({ slug: t.slug, from: doc.homeVisibility, to: t.visibility });
        }
      }
      if (updates.length === 0) {
        console.log('[DONE] No updates required – all targets already match desired state.');
        return;
      }
      console.log(`[PREVIEW] The following ${updates.length} category(ies) would be updated:`);
      updates.forEach(u => console.log(`  • ${u.slug}: homeVisibility ${u.from} → ${u.to}`));
      console.log('[DRY‑RUN] Exiting without applying changes.');
      return;
    }

    // --------- Apply mode (transactional) ---------
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      for (const t of TARGETS) {
        // Find the document inside the transaction to support retry semantics
        const doc = await Category.findOne({ slug: t.slug }).session(session).lean();
        if (!doc) {
          throw new Error(`[ERROR] Slug not found during apply: ${t.slug}`);
        }
        if (doc.homeVisibility === t.visibility) {
          // Already at desired state – no update needed
          continue;
        }
        const res = await Category.updateOne(
          { _id: doc._id, slug: t.slug },
          { $set: { homeVisibility: t.visibility } },
          { session }
        );
        if (res.matchedCount !== 1) {
          throw new Error(`[ERROR] Unexpected matchedCount for ${t.slug}`);
        }
        // Note: modifiedCount may be 0 if value already matches; that's acceptable.
      }
    });
    console.log('[SUCCESS] Migration applied atomically.');
  } catch (e) {
    console.error('[ERROR] Migration failed:', sanitizeErrorMessage(e.message));
    // Re‑throw to propagate error to CLI handler.
    throw e;
  } finally {
    // Cleanup order: end session first, then disconnect
    if (session) {
      try {
        await session.endSession();
      } catch (e) {
        console.error('[WARN] Session end error:', e.message);
      }
    }
    try {
      await mongoose.disconnect();
    } catch (e) {
      console.error('[WARN] Disconnect error:', e.message);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main()
    .catch(err => {
      console.error('[FATAL]', sanitizeErrorMessage(err?.message || String(err)));
      // Set exit code without forcing process.exit, allowing proper cleanup.
      process.exitCode = 1;
    });
}
