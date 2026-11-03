import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: './server/.env' });

const sourceUri = process.env.MONGODB_URI;
if (!sourceUri) {
  console.error('[ERROR] MONGODB_URI not found in server/.env');
  process.exit(1);
}

const backupDir = path.resolve('server', 'backups', 'bson_full_backup');
const mediaDir = path.join(backupDir, 'extracted_media');
fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(mediaDir, { recursive: true });

const { BSON } = mongoose.mongo;

async function runBsonBackup() {
  console.log('Connecting to source database for BSON binary backup...');
  await mongoose.connect(sourceUri);
  const db = mongoose.connection.db;
  console.log(`[PASS] Connected to: "${mongoose.connection.name}" on "${mongoose.connection.host}"`);

  const collections = await db.listCollections().toArray();
  const manifest = {
    timestamp: new Date().toISOString(),
    sourceDatabase: mongoose.connection.name,
    collections: {},
    mediaFiles: []
  };

  for (const colInfo of collections) {
    const colName = colInfo.name;
    const col = db.collection(colName);
    const count = await col.countDocuments();
    const cursor = col.find({}, { raw: false });

    const bsonFilePath = path.join(backupDir, `${colName}.bson`);
    const writeStream = fs.createWriteStream(bsonFilePath);

    let docCount = 0;
    let byteTotal = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const bsonBuffer = BSON.serialize(doc);
      writeStream.write(bsonBuffer);
      byteTotal += bsonBuffer.length;
      docCount++;
    }

    await new Promise(resolve => writeStream.end(resolve));

    manifest.collections[colName] = {
      documents: docCount,
      bsonBytes: byteTotal,
      file: `${colName}.bson`
    };

    console.log(`[BSON DUMP] ${colName.padEnd(25)} : ${String(docCount).padStart(5)} docs, ${String(byteTotal).padStart(9)} bytes`);
  }

  // Extract and verify GridFS binary media files
  for (const bucket of ['shop_images', 'product_images']) {
    const filesCol = db.collection(`${bucket}.files`);
    const chunksCol = db.collection(`${bucket}.chunks`);
    const files = await filesCol.find({}).toArray();

    for (const f of files) {
      const chunks = await chunksCol.find({ files_id: f._id }).sort({ n: 1 }).toArray();
      const buffers = chunks.map(c => {
        // Handle MongoDB Binary type or Buffer
        return c.data.buffer ? Buffer.from(c.data.buffer) : Buffer.from(c.data);
      });
      const fileBuffer = Buffer.concat(buffers);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

      const ext = f.filename ? path.extname(f.filename) : '.bin';
      const outFileName = `${bucket}_${f._id}${ext}`;
      fs.writeFileSync(path.join(mediaDir, outFileName), fileBuffer);

      manifest.mediaFiles.push({
        bucket,
        fileId: f._id.toString(),
        filename: f.filename,
        storedLength: f.length,
        actualLength: fileBuffer.length,
        sha256,
        md5,
        savedAs: outFileName
      });

      console.log(`[MEDIA EXTRACT] Bucket: ${bucket} | ID: ${f._id} | Name: "${f.filename}" | Size: ${fileBuffer.length} bytes | SHA256: ${sha256.slice(0, 16)}...`);
    }
  }

  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n[SUCCESS] Full BSON + GridFS Binary Backup complete at: ${backupDir}`);
  await mongoose.disconnect();
}

runBsonBackup().catch(err => {
  console.error('[ERROR] BSON backup failed:', err);
  process.exit(1);
});

