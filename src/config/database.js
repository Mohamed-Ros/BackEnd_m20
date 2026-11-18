const mongoose = require('mongoose');
const env = require('./env');

/**
 * Connect to MongoDB database using Mongoose.
 * Prevents application from starting if database connection fails.
 */
const connectDB = async () => {
  const primaryUri = env.mongoUri;
  const localUri = 'mongodb://127.0.0.1:27017/elan_fragrance';

  try {
    console.log('[DATABASE] Attempting connection to primary MongoDB...');
    const conn = await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000
    });
    console.log('[DATABASE] MongoDB connected successfully to primary database.');
    return conn;
  } catch (primaryError) {
    console.warn(`[DATABASE] Primary MongoDB connection error: ${primaryError.message}`);

    // Local failover is a dev convenience only. In production it would silently write to the wrong database.
    if (!env.isProduction && primaryUri !== localUri) {
      console.log('[DATABASE] Failing over to local MongoDB on 127.0.0.1:27017...');
      try {
        const localConn = await mongoose.connect(localUri, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000
        });
        console.log('[DATABASE] MongoDB connected successfully to LOCAL fallback database.');
        return localConn;
      } catch (localError) {
        console.error('[DATABASE] Both primary and local MongoDB failed.');
        throw primaryError;
      }
    } else {
      throw primaryError;
    }
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[DATABASE] MongoDB disconnected.');
});

mongoose.connection.on('error', (err) => {
  console.error('[DATABASE] MongoDB connection error:', err.message);
});

module.exports = connectDB;
