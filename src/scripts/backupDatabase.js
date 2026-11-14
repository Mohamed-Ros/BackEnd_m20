const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const logger = require('../utils/helpers/logger');

/**
 * Creates a full JSON snapshot backup of all collections in MongoDB Atlas.
 */
async function backupDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[BACKUP] MONGO_URI is missing from environment.');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    logger.info('[BACKUP] Connected to MongoDB Atlas for snapshot backup.');

    const db = client.db('elan_fragrance');
    const collections = await db.listCollections().toArray();

    const backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = path.join(backupDir, `atlas_backup_${timestamp}.json`);

    const fullBackup = {
      timestamp: new Date().toISOString(),
      database: 'elan_fragrance',
      collections: {}
    };

    let totalDocs = 0;

    for (const col of collections) {
      const name = col.name;
      const docs = await db.collection(name).find({}).toArray();
      fullBackup.collections[name] = docs;
      totalDocs += docs.length;
      logger.info(`[BACKUP] Captured collection: ${name} (${docs.length} records)`);
    }

    fs.writeFileSync(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf-8');
    logger.info(`[BACKUP] Full database backup successfully saved to: ${backupFilePath}`);
    logger.info(`[BACKUP] Total records backed up: ${totalDocs} across ${collections.length} collections.`);

    await client.close();
    return { backupFilePath, totalDocs, collectionsCount: collections.length };
  } catch (err) {
    logger.error('[BACKUP] Backup failed:', err.message);
    await client.close().catch(() => {});
    throw err;
  }
}

if (require.main === module) {
  backupDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = backupDatabase;
