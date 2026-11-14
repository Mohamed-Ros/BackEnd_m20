const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const MASTER_ADMIN_EMAIL = 'm20.fragrances.26@gmail.com';

async function cleanTestData() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[ERROR] MONGO_URI is not defined.');
    process.exit(1);
  }

  try {
    console.log('[CLEANUP] Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    console.log('[CLEANUP] Starting approved cleanup of test data...');

    // 1. Delete all test orders
    const deletedOrders = await db.collection('orders').deleteMany({});
    console.log(`[CLEANUP] Deleted ${deletedOrders.deletedCount} test orders.`);

    // 2. Delete test stock movements
    const deletedStock = await db.collection('stockmovements').deleteMany({});
    console.log(`[CLEANUP] Deleted ${deletedStock.deletedCount} test stock movements.`);

    // 3. Delete test production batches
    const deletedBatches = await db.collection('productionbatches').deleteMany({});
    console.log(`[CLEANUP] Deleted ${deletedBatches.deletedCount} test production batches.`);

    // 4. Delete test users (keep ONLY Master Admin)
    const deletedUsers = await db.collection('users').deleteMany({
      email: { $ne: MASTER_ADMIN_EMAIL.toLowerCase() }
    });
    console.log(`[CLEANUP] Deleted ${deletedUsers.deletedCount} test users.`);

    // 5. Update Master Admin profile to ensure M20 naming
    await db.collection('users').updateOne(
      { email: MASTER_ADMIN_EMAIL.toLowerCase() },
      {
        $set: {
          name: 'M20 Master Admin',
          userId: 'M20-ADMIN-01',
          role: 'superadmin',
          isEmailVerified: true,
          totalOrders: 0,
          totalSpent: 0
        }
      }
    );
    console.log('[CLEANUP] Verified Master Admin account format and M20-ADMIN-01 ID.');

    // 6. Reset cash accounts balances & clear test transactions
    await db.collection('cashaccounts').updateMany(
      {},
      {
        $set: {
          balance: 0,
          transactions: []
        }
      }
    );
    // Update InstaPay identifier if it had old name
    await db.collection('cashaccounts').updateOne(
      { name: 'InstaPay' },
      {
        $set: {
          accountIdentifier: 'm20.perfumes@instapay'
        }
      }
    );
    console.log('[CLEANUP] Reset all cash accounts balances to 0 and cleared test transactions.');

    // 7. Update settings for M20 naming
    await db.collection('settings').updateMany(
      {},
      {
        $set: {
          storeName: 'M20',
          'payments.instaPay.account': 'm20.perfumes@instapay',
          'payments.instaPay.instructions': 'يرجى تحويل المبلغ عبر إنستاباي على العنوان: m20.perfumes@instapay وإرفاق لقطة شاشة للتأكيد.'
        }
      }
    );
    console.log('[CLEANUP] Updated settings to M20 branding and m20.perfumes@instapay.');

    // 8. Update offers description to replace ÉLAN with M20
    const offers = await db.collection('offers').find({}).toArray();
    for (const offer of offers) {
      if (offer.description && offer.description.includes('ÉLAN')) {
        const updatedDesc = offer.description.replace(/ÉLAN/g, 'M20');
        await db.collection('offers').updateOne({ _id: offer._id }, { $set: { description: updatedDesc } });
      }
    }
    console.log('[CLEANUP] Updated offer descriptions to M20.');

    // 9. Update product slug and SKU for M20 Signature Noir
    await db.collection('products').updateOne(
      { name: 'M20 Signature Noir' },
      {
        $set: {
          slug: 'm20-signature-noir',
          'variants.0.SKU': 'M20-SIGNA-30ML',
          'variants.1.SKU': 'M20-SIGNA-50ML',
          'variants.2.SKU': 'M20-SIGNA-100ML'
        }
      }
    );
    await db.collection('products').updateOne(
      { name: 'SOLEIL BLANC' },
      {
        $set: {
          'variants.0.SKU': 'M20-SOLEIL-30ML',
          'variants.1.SKU': 'M20-SOLEIL-50ML',
          'variants.2.SKU': 'M20-SOLEIL-100ML'
        }
      }
    );
    console.log('[CLEANUP] Updated product slugs and SKUs to M20 standards.');

    console.log('[CLEANUP] All test data successfully cleaned and M20 brand alignment completed.');
    process.exit(0);
  } catch (err) {
    console.error('[CLEANUP ERROR]', err);
    process.exit(1);
  }
}

cleanTestData();
