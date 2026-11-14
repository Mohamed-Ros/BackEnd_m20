const Order = require('../modules/orders/order.model');
const CloudinaryService = require('../cloudinary/cloudinary.service');
const logger = require('../utils/helpers/logger');

/**
 * Extracts Cloudinary public ID from a full Cloudinary URL.
 * Handles both versioned and unversioned URLs.
 * Example: https://res.cloudinary.com/demo/image/upload/v1234567890/elan/receipts/abc.png -> elan/receipts/abc
 * 
 * @param {string} url - Full Cloudinary URL
 * @returns {string|null} - Extracted public ID or null
 */
const extractCloudinaryPublicId = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('cloudinary.com')) return null;

  try {
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return null;

    let pathAfterUpload = url.substring(uploadIndex + 8);
    // Remove optional version segment like v1234567890/
    pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, '');
    // Remove file extension
    const lastDotIndex = pathAfterUpload.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      pathAfterUpload = pathAfterUpload.substring(0, lastDotIndex);
    }
    return decodeURIComponent(pathAfterUpload);
  } catch (err) {
    logger.error(`[CLEANUP JOB] Failed to parse Cloudinary URL: ${url}`, err);
    return null;
  }
};

/**
 * Automated Cleanup Job for Customer Payment Proof Images:
 * Deletes customer transfer/payment proof images 30 days after admin confirmation.
 * Retains complete Order records, amounts, verifiedAt, customer data, and audit history.
 * 
 * Note: Purchase supplier invoice attachments (Purchase.attachmentUrl) are intentionally
 * EXCLUDED from this deletion and remain permanently preserved.
 */
const cleanupExpiredPaymentProofs = async () => {
  try {
    const retentionDays = parseInt(process.env.PAYMENT_PROOF_RETENTION_DAYS, 10) || 30;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    logger.info(`[CLEANUP JOB] Scanning for payment proofs verified before ${cutoffDate.toISOString()} (${retentionDays} days retention)...`);

    // Find orders where:
    // 1. Payment status is 'paid'
    // 2. Verified by admin at least retentionDays ago
    // 3. Payment proof URL still exists
    // 4. Exclude disputed orders (to preserve evidence)
    const eligibleOrders = await Order.find({
      paymentStatus: 'paid',
      orderStatus: { $nin: ['disputed'] },
      isDisputed: { $ne: true },
      verifiedAt: { $lte: cutoffDate, $ne: null },
      paymentProofUrl: { $ne: null, $exists: true, $nin: ['', null] }
    });

    if (eligibleOrders.length === 0) {
      logger.info('[CLEANUP JOB] No expired payment proof images found to delete.');
      return { deletedCount: 0 };
    }

    logger.info(`[CLEANUP JOB] Found ${eligibleOrders.length} order(s) with expired payment proofs.`);

    let deletedCount = 0;

    for (const order of eligibleOrders) {
      const proofUrl = order.paymentProofUrl;

      // 1. If stored in Cloudinary, delete remote asset
      const publicId = extractCloudinaryPublicId(proofUrl);
      if (publicId) {
        try {
          await CloudinaryService.deleteImage(publicId);
          logger.info(`[CLEANUP JOB] Deleted Cloudinary payment proof asset: ${publicId} (Order #${order.orderNumber})`);
        } catch (cloudErr) {
          logger.warn(`[CLEANUP JOB] Could not delete Cloudinary asset for Order #${order.orderNumber}: ${cloudErr.message}`);
        }
      }

      // 2. Clear payment proof from order while keeping entire order record intact
      order.paymentProofUrl = null;
      const autoNote = `[Auto-Cleanup] Payment proof image automatically deleted after ${retentionDays} days of admin confirmation.`;
      order.adminNotes = order.adminNotes ? `${order.adminNotes} | ${autoNote}` : autoNote;

      await order.save();
      deletedCount++;
    }

    logger.info(`[CLEANUP JOB] Successfully cleaned up ${deletedCount} expired payment proof image(s). Order records retained.`);
    return { deletedCount };
  } catch (error) {
    logger.error('[CLEANUP JOB] Error during payment proof cleanup job:', error);
    return { error: error.message };
  }
};

/**
 * Initializes the recurring daily payment proof cleanup job.
 */
const startPaymentProofCleanupJob = () => {
  // Run once shortly after server startup (after 10 seconds to allow clean DB connection)
  setTimeout(() => {
    cleanupExpiredPaymentProofs().catch((err) => {
      logger.error('[CLEANUP JOB] Initial payment proof cleanup run failed:', err);
    });
  }, 10000);

  // Run recurring job every 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    cleanupExpiredPaymentProofs().catch((err) => {
      logger.error('[CLEANUP JOB] Scheduled payment proof cleanup run failed:', err);
    });
  }, TWENTY_FOUR_HOURS);

  logger.info('[CLEANUP JOB] Payment proof 30-day retention cleanup job scheduled (runs every 24 hours).');
};

module.exports = {
  cleanupExpiredPaymentProofs,
  startPaymentProofCleanupJob,
  extractCloudinaryPublicId
};
