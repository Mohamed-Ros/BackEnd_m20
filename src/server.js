const env = require('./config/env');
const app = require('./app');
const connectDB = require('./config/database');
const logger = require('./utils/helpers/logger');
const EmailService = require('./utils/email/emailService');
const { startPaymentProofCleanupJob } = require('./jobs/cleanupPaymentProofs');

// Handle Uncaught Exceptions
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Shutting down server...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

/**
 * Bootstrap Server with Database Connection Guard
 */
const startServer = async () => {
  try {
    // Database Connection Guard: Server will NOT accept requests if DB connection fails
    await connectDB();

    // Start 30-day automated payment proof retention cleanup job
    startPaymentProofCleanupJob();

    const server = app.listen(env.port, () => {
      logger.info(`[SERVER] M20 Backend server running in ${env.env} mode on port ${env.port}`);
      // Non-blocking startup SMTP verification so misconfigurations surface immediately
      EmailService.verifyConnection().catch(() => {});
    });

    // Graceful shutdown for process managers (PM2, Docker, Render, Railway)
    const shutdown = (signal) => {
      logger.info(`[SERVER] ${signal} received, shutting down gracefully...`);
      server.close(async () => {
        try {
          await require('mongoose').connection.close();
        } finally {
          process.exit(0);
        }
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle Unhandled Promise Rejections
    process.on('unhandledRejection', (err) => {
      console.error('[UNHANDLED REJECTION] Shutting down gracefully...');
      console.error(err.name, err.message);
      server.close(() => {
        process.exit(1);
      });
    });
  } catch (error) {
    console.error('[DATABASE] Application startup aborted due to database connection failure.');
    process.exit(1);
  }
};

startServer();
