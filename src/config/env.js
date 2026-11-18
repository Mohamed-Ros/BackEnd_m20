const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const cleanEnvString = (val) => {
  if (val === undefined || val === null) return '';
  return String(val).trim().replace(/^(['"])(.*)\1$/, '$2').trim();
};

const normalizeEmailPassword = (rawPass, host, service) => {
  const cleaned = cleanEnvString(rawPass);
  if (!cleaned) return '';
  const isGmail =
    String(service || '').toLowerCase() === 'gmail' ||
    String(host || '').toLowerCase().includes('gmail.com');
  // Gmail App Passwords are displayed in 4-char space-separated groups; strip internal whitespace cleanly
  if (isGmail) {
    return cleaned.replace(/\s+/g, '');
  }
  return cleaned;
};

const smtpService = cleanEnvString(process.env.EMAIL_SERVICE || process.env.SMTP_SERVICE);
const smtpHost = cleanEnvString(process.env.SMTP_HOST || process.env.EMAIL_HOST) || 'smtp.gmail.com';
const smtpPort = parseInt(cleanEnvString(process.env.SMTP_PORT || process.env.EMAIL_PORT), 10) || 465;
const rawSecure = cleanEnvString(process.env.SMTP_SECURE || process.env.EMAIL_SECURE).toLowerCase();
const smtpSecure = rawSecure === 'true' ? true : rawSecure === 'false' ? false : smtpPort === 465;
const smtpUser = cleanEnvString(process.env.SMTP_USER || process.env.EMAIL_USER);
const smtpPass = normalizeEmailPassword(
  process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.EMAIL_PASS,
  smtpHost,
  smtpService
);

const fromEmailRaw = cleanEnvString(process.env.EMAIL_FROM);
const fromName = cleanEnvString(process.env.EMAIL_FROM_NAME) || 'M20 Maison';
const fromAddress = cleanEnvString(process.env.EMAIL_FROM_ADDRESS) || smtpUser;
const resolvedFrom = fromEmailRaw || (fromAddress ? `"${fromName}" <${fromAddress}>` : '');

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// Fail fast in production instead of running with unsafe defaults.
if (isProduction) {
  const missing = ['MONGO_URI', 'JWT_SECRET'].filter((k) => !cleanEnvString(process.env[k]));
  if (missing.length) {
    console.error(`[CONFIG] Missing required environment variables in production: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (cleanEnvString(process.env.JWT_SECRET).length < 32) {
    console.error('[CONFIG] JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }
  if (!cleanEnvString(process.env.CORS_ORIGIN) || cleanEnvString(process.env.CORS_ORIGIN) === '*') {
    console.warn('[CONFIG] CORS_ORIGIN is unset or "*" in production. Set it to your store and dashboard domains.');
  }
}

module.exports = {
  isProduction,
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/elan_fragrance',
  jwt: {
    secret: process.env.JWT_SECRET || (isProduction ? '' : 'elan_fallback_secret_key'),
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || ''
  },
  fawaterk: {
    apiKey: process.env.FAWATERK_API_KEY || '',
    baseUrl: process.env.FAWATERK_BASE_URL || 'https://staging.fawaterk.com/api/v2',
    webhookSecret: process.env.FAWATERK_WEBHOOK_SECRET || '',
    redirectUrl: process.env.FAWATERK_REDIRECT_URL || `${(process.env.STORE_URL || (isProduction ? 'https://m20fragrance.store' : 'http://localhost:5173')).replace(/\/+$/, '')}/checkout/success`
  },
  email: {
    service: smtpService,
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    user: smtpUser,
    pass: smtpPass,
    from: resolvedFrom,
    fromName,
    fromAddress,
    tlsRejectUnauthorized: cleanEnvString(process.env.SMTP_TLS_REJECT_UNAUTHORIZED).toLowerCase() !== 'false'
  }
};
