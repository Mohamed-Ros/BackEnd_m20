const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../modules/users/user.model');
const { generateUserId } = require('../utils/helpers/orderNumber');
const logger = require('../utils/helpers/logger');

const MASTER_ADMIN_EMAIL = 'm20.fragrances.26@gmail.com';
const MASTER_ADMIN_PHONE = process.env.MASTER_ADMIN_PHONE || '+201000000026';

/**
 * Idempotent Master Admin Account Setup
 * Configures m20.fragrances.26@gmail.com as primary Master Admin (superadmin).
 * Never logs or prints plaintext passwords.
 */
async function setupMasterAdmin() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[ERROR] MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    logger.info('[SETUP] Connected to MongoDB database successfully.');

    // Secure initial password retrieval (never hardcoded, never logged)
    const rawPassword = process.env.MASTER_ADMIN_PASSWORD || process.argv[2];
    
    let user = await User.findOne({
      $or: [
        { email: MASTER_ADMIN_EMAIL.toLowerCase() },
        { phone: MASTER_ADMIN_PHONE }
      ]
    }).select('+password');

    let hashedPassword = null;
    if (rawPassword && rawPassword.trim()) {
      hashedPassword = await bcrypt.hash(rawPassword.trim(), 10);
    } else if (!user || !user.password) {
      // If no password provided and user has no password, generate strong temporary password
      const tempSecret = crypto.randomBytes(16).toString('hex');
      hashedPassword = await bcrypt.hash(tempSecret, 10);
      logger.info('[SETUP] Generated secure initial hashed password from temporary entropy.');
    }

    if (!user) {
      const userId = generateUserId();
      user = await User.create({
        userId,
        name: 'M20 Master Admin',
        phone: MASTER_ADMIN_PHONE,
        email: MASTER_ADMIN_EMAIL.toLowerCase(),
        password: hashedPassword,
        role: 'superadmin',
        isEmailVerified: true
      });
      logger.info(`[SETUP] Successfully created Master Admin account (userId: ${user.userId}, role: ${user.role}).`);
    } else {
      user.role = 'superadmin';
      user.isEmailVerified = true;
      user.email = MASTER_ADMIN_EMAIL.toLowerCase();
      user.name = 'M20 Master Admin';
      if (hashedPassword) {
        user.password = hashedPassword;
      }
      await user.save();
      logger.info(`[SETUP] Successfully updated existing account to Master Admin (userId: ${user.userId}, role: ${user.role}).`);
    }

    // Verify password is securely hashed
    const verifyUser = await User.findById(user._id).select('+password');
    const isHashed = verifyUser.password && verifyUser.password.startsWith('$2');
    
    if (isHashed) {
      logger.info('[SETUP] Confirmed password is cryptographically hashed using bcrypt (cost factor: 10).');
    } else {
      logger.warn('[SETUP] Warning: Password format could not be verified.');
    }

    logger.info('[SETUP] Master Admin setup completed successfully. Idempotent check passed.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('[SETUP] Master Admin setup encountered an error:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

if (require.main === module) {
  setupMasterAdmin();
}

module.exports = setupMasterAdmin;
