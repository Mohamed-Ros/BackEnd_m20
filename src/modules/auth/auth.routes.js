const express = require('express');
const AuthController = require('./auth.controller');
const validate = require('../../middleware/validation');
const {
  registerSchema,
  loginSchema,
  requestOtpSchema,
  verifyOtpSchema,
  resendOtpSchema
} = require('./auth.validation');
const { authRateLimiter } = require('../../middleware/rateLimiter');
const { protect } = require('../../middleware/auth');

const router = express.Router();

router.post('/register', authRateLimiter, validate(registerSchema, 'Auth.Register'), AuthController.registerOrLogin);
router.post('/login', authRateLimiter, validate(loginSchema, 'Auth.Login'), AuthController.login);
router.post('/request-otp', authRateLimiter, validate(requestOtpSchema, 'Auth.RequestOTP'), AuthController.requestOTP);
router.post('/verify-otp', authRateLimiter, validate(verifyOtpSchema, 'Auth.VerifyOTP'), AuthController.verifyOTP);
router.post('/resend-otp', authRateLimiter, validate(resendOtpSchema, 'Auth.ResendOTP'), AuthController.resendOTP);
router.get('/me', protect, AuthController.getMe);

module.exports = router;
