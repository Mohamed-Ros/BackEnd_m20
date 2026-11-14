const Joi = require('joi');

const registerSchema = {
  body: Joi.object().keys({
    name: Joi.string().required().trim().min(2).max(100).messages({
      'string.empty': 'Name cannot be empty',
      'any.required': 'Name is required'
    }),
    phone: Joi.string().required().trim().min(8).max(20).messages({
      'string.empty': 'Phone number cannot be empty',
      'any.required': 'Phone number is required'
    }),
    email: Joi.string().email().trim().lowercase().allow('', null).optional(),
    password: Joi.string().min(4).max(100).allow('', null).optional()
  })
};

const loginSchema = {
  body: Joi.object().keys({
    phone: Joi.string().allow('', null).optional().trim(),
    email: Joi.string().allow('', null).optional().trim(),
    identifier: Joi.string().allow('', null).optional().trim(),
    password: Joi.string().allow('', null).optional()
  }).or('phone', 'email', 'identifier')
};

const requestOtpSchema = {
  body: Joi.object().keys({
    email: Joi.string().email().required().trim().lowercase().messages({
      'string.email': 'Please enter a valid email address.',
      'any.required': 'Email address is required.'
    }),
    name: Joi.string().trim().min(2).max(100).allow('', null).optional()
  })
};

const verifyOtpSchema = {
  body: Joi.object().keys({
    email: Joi.string().email().trim().lowercase().allow('', null).optional(),
    phone: Joi.string().trim().allow('', null).optional(),
    otp: Joi.string().pattern(/^\d{6}$/).required().messages({
      'string.pattern.base': 'Verification code must be a 6-digit number.',
      'any.required': 'Verification code is required.'
    })
  }).or('email', 'phone')
};

const resendOtpSchema = {
  body: Joi.object().keys({
    email: Joi.string().email().trim().lowercase().allow('', null).optional(),
    phone: Joi.string().trim().allow('', null).optional()
  }).or('email', 'phone')
};

module.exports = {
  registerSchema,
  loginSchema,
  requestOtpSchema,
  verifyOtpSchema,
  resendOtpSchema
};
