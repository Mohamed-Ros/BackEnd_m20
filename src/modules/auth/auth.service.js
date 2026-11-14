const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../users/user.model');
const { normalizePhone } = require('../../utils/helpers/phoneNormalizer');
const { generateUserId } = require('../../utils/helpers/orderNumber');
const { signToken } = require('../../utils/security/jwt');
const EmailService = require('../../utils/email/emailService');
const logger = require('../../utils/helpers/logger');
const AppError = require('../../utils/errors/appError');
const { ErrorCodes } = require('../../utils/errors/errorCodes');

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 5;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

const SELECT_OTP_FIELDS =
  '+password +emailVerificationCode +emailVerificationExpires +emailVerificationAttempts +emailOtpLastSentAt +emailOtpSendCount +emailOtpSendWindowStart';

const sanitizeUser = (userDoc) => {
  const userObj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete userObj.password;
  delete userObj.emailVerificationCode;
  delete userObj.emailVerificationExpires;
  delete userObj.emailVerificationAttempts;
  delete userObj.emailOtpLastSentAt;
  delete userObj.emailOtpSendCount;
  delete userObj.emailOtpSendWindowStart;
  return userObj;
};

class AuthService {
  /**
   * Generate cryptographically secure 6-digit numeric OTP
   */
  static generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Secret used for HMAC-SHA256 OTP hashing
   */
  static getOtpSecret() {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new AppError(
        'Authentication secret is not configured on the server.',
        500,
        ErrorCodes.INTERNAL_ERROR,
        'AuthService.getOtpSecret'
      );
    }
    return secret;
  }

  /**
   * Hash OTP bound to target email using HMAC-SHA256
   */
  static hashOTP(otp, email) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    return crypto
      .createHmac('sha256', this.getOtpSecret())
      .update(`${cleanEmail}:${String(otp || '').trim()}`)
      .digest('hex');
  }

  /**
   * Constant-time verification of candidate OTP against stored HMAC hash
   */
  static verifyOTPHash(storedHash, otp, email) {
    if (!storedHash || !otp || !email) return false;
    const candidateHash = this.hashOTP(otp, email);
    const storedBuf = Buffer.from(storedHash, 'hex');
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    if (storedBuf.length === 0 || storedBuf.length !== candidateBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(storedBuf, candidateBuf);
  }

  /**
   * Enforce per-account cooldown (60s) and windowed send limit (5 / 15m)
   */
  static checkOtpRateLimit(user) {
    const now = Date.now();

    if (user.emailOtpLastSentAt) {
      const elapsed = now - new Date(user.emailOtpLastSentAt).getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const waitSec = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000));
        throw new AppError(
          `Please wait ${waitSec} seconds before requesting another verification code.`,
          429,
          ErrorCodes.VALIDATION_ERROR,
          'AuthService.otpRateLimit'
        );
      }
    }

    const windowStartMs = user.emailOtpSendWindowStart
      ? new Date(user.emailOtpSendWindowStart).getTime()
      : 0;
    const isWindowActive = windowStartMs > 0 && now - windowStartMs < OTP_RATE_WINDOW_MS;

    if (isWindowActive && (user.emailOtpSendCount || 0) >= OTP_MAX_SENDS_PER_WINDOW) {
      const waitMinutes = Math.max(
        1,
        Math.ceil((OTP_RATE_WINDOW_MS - (now - windowStartMs)) / 60000)
      );
      throw new AppError(
        `Too many verification codes requested. Please try again in ${waitMinutes} minute(s).`,
        429,
        ErrorCodes.VALIDATION_ERROR,
        'AuthService.otpRateLimit'
      );
    }

    return {
      lastSentAt: new Date(now),
      sendWindowStart: isWindowActive ? user.emailOtpSendWindowStart : new Date(now),
      sendCount: isWindowActive ? (user.emailOtpSendCount || 0) + 1 : 1
    };
  }

  /**
   * Generate, persist (hashed), and deliver an email OTP with safe rollback on SMTP error
   */
  static async issueAndSendOTP(user, { purpose = 'signin' } = {}) {
    if (!user.email) {
      throw new AppError(
        'An email address is required to send a verification code.',
        400,
        ErrorCodes.VALIDATION_ERROR,
        'AuthService.issueAndSendOTP'
      );
    }

    const rateMeta = this.checkOtpRateLimit(user);
    const otp = this.generateOTP();
    const otpHash = this.hashOTP(otp, user.email);
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);

    const prevState = {
      code: user.emailVerificationCode,
      expires: user.emailVerificationExpires,
      attempts: user.emailVerificationAttempts,
      lastSentAt: user.emailOtpLastSentAt,
      sendCount: user.emailOtpSendCount,
      sendWindowStart: user.emailOtpSendWindowStart
    };

    user.emailVerificationCode = otpHash;
    user.emailVerificationExpires = otpExpires;
    user.emailVerificationAttempts = 0;
    user.emailOtpLastSentAt = rateMeta.lastSentAt;
    user.emailOtpSendCount = rateMeta.sendCount;
    user.emailOtpSendWindowStart = rateMeta.sendWindowStart;
    await user.save();

    try {
      const delivery = await EmailService.sendVerificationOTP({
        to: user.email,
        name: user.name,
        otp,
        expiresMinutes: 10,
        purpose
      });

      if (!delivery || !delivery.success) {
        const dispatchErr = new Error('Email delivery did not confirm acceptance.');
        dispatchErr.code = 'SMTP_DELIVERY_UNCONFIRMED';
        throw dispatchErr;
      }
    } catch (error) {
      // Roll back OTP & cooldown counters if SMTP delivery failed
      user.emailVerificationCode = prevState.code;
      user.emailVerificationExpires = prevState.expires;
      user.emailVerificationAttempts = prevState.attempts;
      user.emailOtpLastSentAt = prevState.lastSentAt;
      user.emailOtpSendCount = prevState.sendCount;
      user.emailOtpSendWindowStart = prevState.sendWindowStart;
      await user.save().catch(() => {});

      logger.error('[AUTH] OTP email delivery failed.', {
        purpose,
        to: EmailService.maskEmail(user.email),
        code: error.code || 'SMTP_ERROR',
        responseCode: error.responseCode || null,
        command: error.command || null,
        message: error.message
      });

      if (['SMTP_NOT_CONFIGURED', 'EAUTH'].includes(error.code)) {
        throw new AppError(
          'Email verification service is temporarily unavailable. Please try again shortly or contact support.',
          503,
          ErrorCodes.INTERNAL_ERROR,
          'AuthService.issueAndSendOTP'
        );
      }

      if (['INVALID_RECIPIENT', 'EENVELOPE_REJECTED'].includes(error.code)) {
        throw new AppError(
          'The provided email address could not accept mail. Please verify the address and try again.',
          400,
          ErrorCodes.VALIDATION_ERROR,
          'AuthService.issueAndSendOTP'
        );
      }

      throw new AppError(
        'Unable to deliver verification email at the moment. Please verify your email address and try again.',
        502,
        ErrorCodes.INTERNAL_ERROR,
        'AuthService.issueAndSendOTP'
      );
    }

    return {
      email: user.email,
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
      cooldownSeconds: OTP_RESEND_COOLDOWN_MS / 1000
    };
  }

  /**
   * Sign standard user JWT
   */
  static signUserToken(user) {
    return signToken({
      id: user._id,
      userId: user.userId,
      phone: user.phone || null,
      email: user.email || null,
      role: user.role
    });
  }

  /**
   * Passwordless Email Sign In / Quick Join via 6-digit OTP
   */
  static async requestEmailOTP({ email, name }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) {
      throw new AppError('Valid email address is required.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.requestEmailOTP');
    }

    let user = await User.findOne({ email: cleanEmail }).select(SELECT_OTP_FIELDS);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const derivedName = name && name.trim() ? name.trim() : cleanEmail.split('@')[0];
      user = await User.create({
        userId: generateUserId(),
        name: derivedName,
        email: cleanEmail,
        isEmailVerified: false,
        role: 'customer'
      });
    }

    const dispatch = await this.issueAndSendOTP(user, {
      purpose: isNewUser ? 'register' : 'signin'
    });

    return {
      requiresVerification: true,
      isNewUser,
      email: dispatch.email,
      expiresInSeconds: dispatch.expiresInSeconds,
      cooldownSeconds: dispatch.cooldownSeconds
    };
  }

  /**
   * Register customer with name, phone, email, and password.
   * Sends 6-digit verification code via Nodemailer when email is provided.
   */
  static async registerOrLogin({ name, phone, email, password }) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new AppError('Invalid phone number format.', 400, ErrorCodes.INVALID_PHONE_NUMBER, 'AuthService.registerOrLogin');
    }

    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;

    const [phoneUser, emailUser] = await Promise.all([
      User.findOne({ phone: normalizedPhone }).select(SELECT_OTP_FIELDS),
      cleanEmail ? User.findOne({ email: cleanEmail }).select(SELECT_OTP_FIELDS) : Promise.resolve(null)
    ]);

    if (phoneUser && emailUser && String(phoneUser._id) !== String(emailUser._id)) {
      throw new AppError(
        'This phone number and email address belong to different existing accounts. Please sign in instead.',
        409,
        ErrorCodes.VALIDATION_ERROR,
        'AuthService.registerOrLogin'
      );
    }

    let user = phoneUser || emailUser;

    let hashedPassword = null;
    if (password && password.trim()) {
      hashedPassword = await bcrypt.hash(password.trim(), 10);
    }

    if (!user) {
      if (!name) {
        throw new AppError('Customer name is required for registration.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.registerOrLogin');
      }

      const userId = generateUserId();
      user = await User.create({
        userId,
        name: name.trim(),
        phone: normalizedPhone,
        email: cleanEmail || undefined,
        password: hashedPassword,
        isEmailVerified: false,
        role: 'customer'
      });
    } else {
      // Prevent hijacking existing staff/admin accounts or already-verified accounts via /register
      if (user.role !== 'customer' || user.isEmailVerified) {
        throw new AppError(
          'An account with this phone number or email already exists. Please sign in instead.',
          409,
          ErrorCodes.VALIDATION_ERROR,
          'AuthService.registerOrLogin'
        );
      }

      if (name && name.trim()) user.name = name.trim();
      if (!user.phone && normalizedPhone) user.phone = normalizedPhone;
      if (cleanEmail && user.email !== cleanEmail) {
        user.email = cleanEmail;
        user.isEmailVerified = false;
      }
      if (hashedPassword) user.password = hashedPassword;
      await user.save();
    }

    // If email exists, require OTP verification BEFORE issuing JWT
    if (cleanEmail || user.email) {
      let cooldownSeconds = OTP_RESEND_COOLDOWN_MS / 1000;
      let expiresInSeconds = OTP_EXPIRY_MS / 1000;

      try {
        const dispatch = await this.issueAndSendOTP(user, { purpose: 'register' });
        cooldownSeconds = dispatch.cooldownSeconds;
        expiresInSeconds = dispatch.expiresInSeconds;
      } catch (err) {
        if (err.statusCode === 429 && user.emailOtpLastSentAt && (user.emailOtpSendCount || 0) < OTP_MAX_SENDS_PER_WINDOW) {
          const elapsed = Date.now() - new Date(user.emailOtpLastSentAt).getTime();
          if (elapsed < OTP_RESEND_COOLDOWN_MS) {
            cooldownSeconds = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000));
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      return {
        user: null,
        token: null,
        requiresVerification: true,
        email: user.email,
        expiresInSeconds,
        cooldownSeconds
      };
    }

    const token = this.signUserToken(user);
    return {
      user: sanitizeUser(user),
      token,
      requiresVerification: false,
      email: null
    };
  }

  /**
   * Verify email OTP code (validates expiry, attempt limit, HMAC-SHA256 hash)
   */
  static async verifyOTP({ email, phone, otp }) {
    const cleanOtp = String(otp || '').trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      throw new AppError('Verification code must be a 6-digit number.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.verifyOTP');
    }

    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    if (!cleanEmail && !normalizedPhone) {
      throw new AppError('Email or phone number is required.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.verifyOTP');
    }

    const user = await User.findOne({
      $or: [
        ...(cleanEmail ? [{ email: cleanEmail }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
      ]
    }).select(SELECT_OTP_FIELDS);

    if (!user) {
      throw new AppError('Account not found.', 404, ErrorCodes.USER_NOT_FOUND, 'AuthService.verifyOTP');
    }

    if (!user.email || !user.emailVerificationCode || !user.emailVerificationExpires) {
      throw new AppError('No active verification code found. Please request a new code.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.verifyOTP');
    }

    if (new Date(user.emailVerificationExpires).getTime() < Date.now()) {
      user.emailVerificationCode = null;
      user.emailVerificationExpires = null;
      user.emailVerificationAttempts = 0;
      await user.save();
      throw new AppError('Verification code has expired. Please request a new one.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.verifyOTP');
    }

    if ((user.emailVerificationAttempts || 0) >= OTP_MAX_VERIFY_ATTEMPTS) {
      user.emailVerificationCode = null;
      user.emailVerificationExpires = null;
      await user.save();
      throw new AppError(
        'Too many invalid verification attempts. Please request a new code.',
        429,
        ErrorCodes.VALIDATION_ERROR,
        'AuthService.verifyOTP'
      );
    }

    const isValid = this.verifyOTPHash(user.emailVerificationCode, cleanOtp, user.email);
    if (!isValid) {
      user.emailVerificationAttempts = (user.emailVerificationAttempts || 0) + 1;
      const remaining = OTP_MAX_VERIFY_ATTEMPTS - user.emailVerificationAttempts;
      if (remaining <= 0) {
        user.emailVerificationCode = null;
        user.emailVerificationExpires = null;
      }
      await user.save();

      if (remaining <= 0) {
        throw new AppError(
          'Too many invalid verification attempts. Please request a new code.',
          429,
          ErrorCodes.VALIDATION_ERROR,
          'AuthService.verifyOTP'
        );
      }

      throw new AppError(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
        400,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'AuthService.verifyOTP'
      );
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;
    user.emailVerificationAttempts = 0;
    await user.save();

    const token = this.signUserToken(user);
    return { user: sanitizeUser(user), token };
  }

  /**
   * Resend OTP verification code with cooldown and rate-limit enforcement
   */
  static async resendOTP({ email, phone }) {
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    if (!cleanEmail && !normalizedPhone) {
      throw new AppError('Email or phone number is required.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.resendOTP');
    }

    const user = await User.findOne({
      $or: [
        ...(cleanEmail ? [{ email: cleanEmail }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
      ]
    }).select(SELECT_OTP_FIELDS);

    if (!user) {
      throw new AppError('Account not found.', 404, ErrorCodes.USER_NOT_FOUND, 'AuthService.resendOTP');
    }

    if (!user.email) {
      throw new AppError('No email associated with this account.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.resendOTP');
    }

    const dispatch = await this.issueAndSendOTP(user, { purpose: 'signin' });

    return {
      success: true,
      message: 'Verification code resent successfully.',
      email: dispatch.email,
      expiresInSeconds: dispatch.expiresInSeconds,
      cooldownSeconds: dispatch.cooldownSeconds
    };
  }

  /**
   * Login by phone or email with password (or trigger email OTP if unverified)
   */
  static async login({ phone, email, identifier, password }) {
    const queryTerm = identifier || phone || email;
    if (!queryTerm) {
      throw new AppError('Phone number or email is required.', 400, ErrorCodes.VALIDATION_ERROR, 'AuthService.login');
    }

    const normalizedPhone = normalizePhone(queryTerm);
    const cleanEmail = queryTerm.trim().toLowerCase();

    const user = await User.findOne({
      $or: [
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        { email: cleanEmail }
      ]
    }).select(SELECT_OTP_FIELDS);

    if (!user) {
      throw new AppError('No account found with these credentials. Please register.', 404, ErrorCodes.USER_NOT_FOUND, 'AuthService.login');
    }

    if (user.password) {
      if (!password) {
        throw new AppError('Password is required for this account.', 401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'AuthService.login');
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        throw new AppError('Invalid password. Please check your credentials.', 401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'AuthService.login');
      }
    }

    // Require email OTP if account has no password OR customer email is not yet verified
    const requiresOtpChallenge =
      (!user.password && Boolean(user.email)) ||
      (user.role === 'customer' && Boolean(user.email) && !user.isEmailVerified);

    if (!user.password && !user.email) {
      throw new AppError(
        'This account does not have a password or verified email configured. Please create an account with your email.',
        401,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'AuthService.login'
      );
    }

    if (requiresOtpChallenge) {
      let cooldownSeconds = OTP_RESEND_COOLDOWN_MS / 1000;
      let expiresInSeconds = OTP_EXPIRY_MS / 1000;

      // Send a fresh OTP if possible, or report remaining cooldown if just sent
      try {
        const dispatch = await this.issueAndSendOTP(user, { purpose: 'signin' });
        cooldownSeconds = dispatch.cooldownSeconds;
        expiresInSeconds = dispatch.expiresInSeconds;
      } catch (err) {
        if (err.statusCode === 429 && user.emailOtpLastSentAt) {
          const elapsed = Date.now() - new Date(user.emailOtpLastSentAt).getTime();
          cooldownSeconds = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000));
        } else {
          throw err;
        }
      }

      return {
        user: null,
        token: null,
        requiresVerification: true,
        email: user.email,
        expiresInSeconds,
        cooldownSeconds
      };
    }

    const token = this.signUserToken(user);
    return {
      user: sanitizeUser(user),
      token,
      requiresVerification: false
    };
  }

  /**
   * Get user profile by ID
   */
  static async getMe(id) {
    const user = await User.findById(id);
    if (!user) {
      throw new AppError('User not found.', 404, ErrorCodes.USER_NOT_FOUND, 'AuthService.getMe');
    }
    return user;
  }
}

module.exports = AuthService;
