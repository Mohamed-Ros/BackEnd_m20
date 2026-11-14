const crypto = require('crypto');
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const logger = require('../helpers/logger');

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

let cachedTransporter = null;
let cachedConfigSignature = '';

class EmailService {
  /**
   * Mask email local-part for safe diagnostic logging (never logs secrets or full PII)
   */
  static maskEmail(email = '') {
    const clean = String(email || '').trim();
    const atIdx = clean.indexOf('@');
    if (atIdx <= 0) return '***';
    const local = clean.slice(0, atIdx);
    const domain = clean.slice(atIdx);
    const prefix = local.slice(0, Math.min(2, local.length));
    return `${prefix}***${domain}`;
  }

  /**
   * Resolve normalized SMTP configuration from centralized env module
   */
  static getSmtpConfig() {
    const mail = env.email || {};
    return {
      service: mail.service || '',
      host: mail.host || 'smtp.gmail.com',
      port: mail.port || 465,
      secure: typeof mail.secure === 'boolean' ? mail.secure : (mail.port || 465) === 465,
      user: mail.user || '',
      pass: mail.pass || '',
      from: mail.from || (mail.user ? `"M20 Maison" <${mail.user}>` : ''),
      tlsRejectUnauthorized: mail.tlsRejectUnauthorized !== false
    };
  }

  /**
   * Create or reuse configured Nodemailer transporter
   */
  static getTransporter() {
    const cfg = this.getSmtpConfig();
    if (!cfg.user || !cfg.pass) {
      return null;
    }

    const passDigest = crypto.createHash('sha256').update(String(cfg.pass)).digest('hex').slice(0, 8);
    const signature = `${cfg.service}|${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}|${passDigest}`;
    if (cachedTransporter && cachedConfigSignature === signature) {
      return cachedTransporter;
    }
    if (cachedTransporter && typeof cachedTransporter.close === 'function') {
      cachedTransporter.close();
    }

    const baseTransportOpts = cfg.service
      ? {
          service: cfg.service,
          auth: { user: cfg.user, pass: cfg.pass }
        }
      : {
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          ...(!cfg.secure ? { requireTLS: true } : {}),
          auth: { user: cfg.user, pass: cfg.pass },
          tls: {
            rejectUnauthorized: cfg.tlsRejectUnauthorized,
            servername: cfg.host
          }
        };

    cachedTransporter = nodemailer.createTransport({
      ...baseTransportOpts,
      family: 4,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    cachedConfigSignature = signature;

    return cachedTransporter;
  }

  /**
   * Resolve sender address aligned with authenticated SMTP account
   */
  static getFromAddress() {
    const cfg = this.getSmtpConfig();
    if (cfg.from) return cfg.from;
    if (cfg.user) return `"M20 Maison" <${cfg.user}>`;
    return '"M20 Maison" <noreply@m20fragrance.com>';
  }

  /**
   * Verify live SMTP authentication and TLS handshake without leaking secrets
   */
  static async verifyConnection() {
    const cfg = this.getSmtpConfig();
    const transporter = this.getTransporter();

    if (!transporter) {
      logger.warn('[SMTP] Verification skipped: SMTP_USER or SMTP_PASSWORD is missing in .env.');
      return { ok: false, code: 'SMTP_NOT_CONFIGURED' };
    }

    try {
      await transporter.verify();
      logger.info('[SMTP] Transporter verified and ready to send emails.', {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: this.maskEmail(cfg.user)
      });
      return {
        ok: true,
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: this.maskEmail(cfg.user)
      };
    } catch (error) {
      cachedTransporter = null;
      cachedConfigSignature = '';
      logger.error('[SMTP] Transporter verification failed.', {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: this.maskEmail(cfg.user),
        code: error.code || 'SMTP_VERIFY_FAILED',
        responseCode: error.responseCode || null,
        command: error.command || null,
        message: error.message
      });
      return {
        ok: false,
        code: error.code || 'SMTP_VERIFY_FAILED',
        responseCode: error.responseCode || null,
        message: error.message
      };
    }
  }

  /**
   * Send 6-Digit Email Verification Code with Responsive M20 Branded Template
   */
  static async sendVerificationOTP({ to, name = 'Valued Guest', otp, expiresMinutes = 10, purpose = 'signin' }) {
    const cleanTo = String(to || '').trim().toLowerCase();
    if (!cleanTo || !cleanTo.includes('@')) {
      const err = new Error('A valid recipient email address is required.');
      err.code = 'INVALID_RECIPIENT';
      throw err;
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      logger.error('[EMAIL] Cannot deliver verification OTP: SMTP credentials are not configured.', {
        to: this.maskEmail(cleanTo),
        purpose
      });
      const configError = new Error('Email delivery service is not configured on the server.');
      configError.code = 'SMTP_NOT_CONFIGURED';
      throw configError;
    }

    const fromAddress = this.getFromAddress();
    const safeName = escapeHtml(name && String(name).trim() ? name.trim() : 'Valued Guest');
    const safeOtp = escapeHtml(String(otp || '').trim());
    const headlineText = purpose === 'register' ? 'Confirm your email address' : 'Your M20 sign-in code';
    const actionText =
      purpose === 'register'
        ? 'Enter this 6-digit verification code to verify your email address and complete your M20 account setup.'
        : 'Enter this 6-digit verification code to sign in to your M20 account.';
    const subjectText =
      purpose === 'register' ? 'Confirm your M20 email address' : 'Your M20 sign-in code';

    const htmlContent = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subjectText)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-card { width: 100% !important; }
      .email-body { padding: 28px 20px !important; }
      .otp-code-text { font-size: 30px !important; letter-spacing: 7px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F3EF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">
  <!-- Preheader for inbox preview -->
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">
    Your M20 verification code is ${safeOtp}. Valid for ${expiresMinutes} minutes.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F4F3EF; width: 100%;">
    <tr>
      <td align="center" style="padding: 36px 16px;">
        <table role="presentation" class="email-card" width="520" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; width: 100%; background-color: #FFFFFF; border: 1px solid #E5E2D9; border-radius: 8px; overflow: hidden;">
          <!-- Subtle M20 Brand Top Accent -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #174F43 0%, #174F43 68%, #FF9D00 100%); background-color: #174F43; font-size: 1px; line-height: 1px;">&nbsp;</td>
          </tr>

          <!-- Minimal Editorial Header -->
          <tr>
            <td style="padding: 28px 36px 0 36px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <span style="font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: 700; letter-spacing: 4px; color: #174F43;">M20</span>
                    <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: #FF9D00; vertical-align: middle; margin-left: 4px;"></span>
                  </td>
                  <td style="text-align: right; vertical-align: middle; font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; color: #64748B; font-weight: 600;">
                    Security Code
                  </td>
                </tr>
              </table>
              <div style="margin-top: 18px; height: 1px; background-color: #EFECE4;"></div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="email-body" style="padding: 28px 36px 32px 36px; text-align: left;">
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 600; color: #0F3830; margin: 0 0 12px 0; line-height: 1.3;">
                ${escapeHtml(headlineText)}
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 8px 0;">
                Hi ${safeName},
              </p>
              <p style="font-size: 14px; line-height: 1.65; color: #475569; margin: 0 0 24px 0;">
                ${escapeHtml(actionText)}
              </p>

              <!-- Single-Select Copyable OTP Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F8F7F3; border: 1px solid #DFDDD4; border-left: 4px solid #FF9D00; border-radius: 6px; margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="padding: 24px 20px;">
                    <div style="font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; color: #174F43; font-weight: 700; margin-bottom: 12px;">
                      Verification Code
                    </div>
                    <div dir="ltr" style="display: inline-block; background-color: #FFFFFF; border: 1.5px solid #174F43; border-radius: 6px; padding: 14px 19px 14px 28px; cursor: pointer;">
                      <span class="otp-code-text" style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 700; letter-spacing: 9px; color: #0F3830; user-select: all; -webkit-user-select: all; -moz-user-select: all; -ms-user-select: all;">${safeOtp}</span>
                    </div>
                    <div style="margin-top: 12px; font-size: 12px; color: #64748B;">
                      Tap or click the code above to select &amp; copy &bull; Expires in <strong style="color: #174F43;">${expiresMinutes} minutes</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; line-height: 1.6; color: #64748B; margin: 0;">
                If you did not request this code, you can safely ignore this email. Never share this code with anyone.
              </p>
            </td>
          </tr>

          <!-- Clean Minimal Footer -->
          <tr>
            <td style="padding: 18px 36px 24px 36px; border-top: 1px solid #EFECE4; text-align: left; font-size: 12px; color: #64748B; line-height: 1.5;">
              <strong style="color: #174F43;">M20</strong> &mdash; Sent because an account verification was requested for ${escapeHtml(cleanTo)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: fromAddress,
        to: cleanTo,
        subject: subjectText,
        html: htmlContent,
        text: `Hi ${name || 'Valued Guest'},\n\n${headlineText}\n\nYour M20 verification code is: ${String(otp || '').trim()}\n\nThis code expires in ${expiresMinutes} minutes. Never share it with anyone.\n\n— M20`
      });

      const acceptedCount = Array.isArray(info.accepted) ? info.accepted.length : 0;
      if (acceptedCount === 0) {
        const rejectErr = new Error('SMTP server rejected the recipient email address.');
        rejectErr.code = 'EENVELOPE_REJECTED';
        throw rejectErr;
      }

      logger.info('[EMAIL] Verification OTP sent.', {
        purpose,
        to: this.maskEmail(cleanTo),
        messageId: info.messageId,
        accepted: acceptedCount
      });

      return {
        success: true,
        messageId: info.messageId,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        response: info.response || ''
      };
    } catch (error) {
      // Reset cached transporter on auth/connection errors so subsequent calls recover cleanly
      if (['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(error.code)) {
        if (cachedTransporter && typeof cachedTransporter.close === 'function') {
          cachedTransporter.close();
        }
        cachedTransporter = null;
        cachedConfigSignature = '';
      }

      logger.error('[EMAIL] Failed to send verification OTP.', {
        purpose,
        to: this.maskEmail(cleanTo),
        code: error.code || 'SMTP_SEND_FAILED',
        responseCode: error.responseCode || null,
        command: error.command || null,
        message: error.message
      });

      throw error;
    }
  }

  /**
   * Shared helper to render and send branded M20 order emails
   */
  static async sendOrderEmail({
    to,
    subject,
    headline,
    introHtml,
    orderNumber,
    total,
    totalLabel = 'Total Amount',
    items = [],
    trackingUrl = '',
    metaRows = [],
    textFallback = ''
  }) {
    const cleanTo = String(to || '').trim().toLowerCase();
    if (!cleanTo || !cleanTo.includes('@')) {
      return { success: false, error: 'INVALID_RECIPIENT' };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      logger.warn('[EMAIL] Order email skipped: SMTP credentials are not configured.', {
        to: this.maskEmail(cleanTo),
        orderNumber
      });
      return { success: false, error: 'SMTP_NOT_CONFIGURED' };
    }

    const fromAddress = this.getFromAddress();
    const safeOrderNumber = escapeHtml(orderNumber);

    const itemsHtml = (items || []).map(item => `
      <tr style="border-bottom: 1px solid #EAE7DF;">
        <td style="padding: 12px 0; font-weight: 500; color: #174F43;">${escapeHtml(item.productName || 'Fragrance')} (${escapeHtml(item.size || '')})</td>
        <td style="padding: 12px 0; text-align: center; color: #64748B;">x${Number(item.quantity) || 1}</td>
        <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #0F3830;">${((Number(item.price) || 0) * (Number(item.quantity) || 1)).toLocaleString()} EGP</td>
      </tr>
    `).join('');

    const metaHtml = metaRows.length > 0
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 14px 0 18px 0; background-color: #F8F7F4; border: 1px solid #E2E0D8; border-radius: 4px;">
          ${metaRows.map(r => `
            <tr>
              <td style="padding: 8px 14px; font-size: 12px; color: #64748B; border-bottom: 1px solid #EAE7DF;">${escapeHtml(r.label)}</td>
              <td style="padding: 8px 14px; font-size: 12px; font-weight: 600; color: #174F43; text-align: right; border-bottom: 1px solid #EAE7DF;">${escapeHtml(r.value)}</td>
            </tr>
          `).join('')}
        </table>`
      : '';

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #F4F3EF; margin: 0; padding: 0; }
    .wrapper { max-width: 580px; margin: 28px auto; background-color: #FFFFFF; border: 1px solid #E2E0D8; border-radius: 4px; overflow: hidden; }
    .header { background-color: #0F3830; padding: 30px 24px; text-align: center; border-bottom: 3px solid #FF9D00; }
    .header h1 { color: #FF9D00; font-size: 28px; letter-spacing: 5px; text-transform: uppercase; margin: 0; font-family: 'Georgia', serif; }
    .header p { color: #E2ECE9; font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; margin-top: 6px; }
    .content { padding: 32px 28px; color: #334155; line-height: 1.6; }
    .title { font-size: 18px; font-weight: 700; color: #174F43; margin-bottom: 8px; }
    .order-num { display: inline-block; background: #F4F3EF; color: #174F43; border: 1px solid #D5D2C8; font-weight: bold; padding: 6px 14px; border-radius: 4px; font-family: monospace; font-size: 14px; margin-bottom: 16px; }
    .table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    .total-box { background-color: #F4F3EF; border-radius: 4px; padding: 16px; margin-top: 16px; text-align: right; }
    .total-amount { font-size: 20px; font-weight: 800; color: #174F43; }
    .btn { display: inline-block; background-color: #174F43; color: #FFFFFF !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-weight: 600; font-size: 14px; margin-top: 24px; text-align: center; }
    .footer { background-color: #F8F7F4; border-top: 1px solid #EAE7DF; padding: 20px; text-align: center; font-size: 11px; color: #64748B; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>M20</h1>
      <p>DESIGN TO LEAVE AN IMPRESSION &bull; CAIRO</p>
    </div>
    <div class="content">
      <div class="title">${escapeHtml(headline)}</div>
      ${introHtml}
      <div class="order-num">Order Reference: ${safeOrderNumber}</div>
      ${metaHtml}
      ${items.length > 0 ? `
      <table class="table">
        <thead>
          <tr style="border-bottom: 2px solid #CBD5E1; color: #64748B; font-size: 12px; text-transform: uppercase; text-align: left;">
            <th style="padding-bottom: 8px;">Item</th>
            <th style="padding-bottom: 8px; text-align: center;">Qty</th>
            <th style="padding-bottom: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>` : ''}
      <div class="total-box">
        <span style="font-size: 13px; color: #64748B;">${escapeHtml(totalLabel)}: </span>
        <span class="total-amount">${Number(total || 0).toLocaleString()} EGP</span>
      </div>
      ${trackingUrl ? `<div style="text-align: center;"><a href="${escapeHtml(trackingUrl)}" class="btn">Track Your Order</a></div>` : ''}
    </div>
    <div class="footer">
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} M20 Fragrance House. All Rights Reserved.</p>
      <p style="margin: 4px 0 0 0; font-style: italic;">Leave your mark.</p>
    </div>
  </div>
</body>
</html>`;

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: fromAddress,
        to: cleanTo,
        subject,
        html: htmlContent,
        text: textFallback || `${headline}\nOrder: ${orderNumber}\nTotal: ${total} EGP`
      });
      logger.info('[EMAIL] Order email sent.', {
        to: this.maskEmail(cleanTo),
        orderNumber,
        subject,
        messageId: info.messageId
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      if (['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(error.code)) {
        cachedTransporter = null;
        cachedConfigSignature = '';
      }
      logger.error('[EMAIL] Order email delivery failed.', {
        to: this.maskEmail(cleanTo),
        orderNumber,
        code: error.code || 'SMTP_SEND_FAILED',
        responseCode: error.responseCode || null,
        message: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send Order Received Email immediately after checkout
   */
  static async sendOrderReceived({ to, name = 'Valued Customer', orderNumber, total, items = [], deliveryMethod, paymentMethod, trackingUrl }) {
    const safeName = escapeHtml(name || 'Valued Customer');
    return this.sendOrderEmail({
      to,
      subject: `M20 Order Received: ${orderNumber}`,
      headline: 'Thank You, Your Order Was Received',
      introHtml: `<p>Dear ${safeName},</p><p>Thank you for ordering from M20. We have received your order and our team is reviewing your details now.</p>`,
      orderNumber,
      total,
      totalLabel: 'Order Total',
      items,
      trackingUrl,
      metaRows: [
        { label: 'Delivery Method', value: deliveryMethod === 'metro_pickup' ? 'Cairo Metro Pickup' : 'Home Delivery' },
        { label: 'Payment Method', value: String(paymentMethod || 'cod').replace(/_/g, ' ').toUpperCase() }
      ],
      textFallback: `Dear ${name},\n\nWe received your M20 order ${orderNumber}.\nTotal: ${total} EGP\nTrack your order: ${trackingUrl || ''}\n\nThank you for choosing M20.`
    });
  }

  /**
   * Send Order Confirmation / Verification Email
   */
  static async sendOrderConfirmation({ to, name = 'Valued Customer', orderNumber, total, items = [], trackingUrl }) {
    const safeName = escapeHtml(name || 'Valued Customer');
    return this.sendOrderEmail({
      to,
      subject: `Your M20 Order ${orderNumber} is Confirmed`,
      headline: 'Order Confirmed & Verified',
      introHtml: `<p>Dear ${safeName},</p><p>We are delighted to confirm that your order has been received and verified. Our fulfillment team is now preparing your selection with care.</p>`,
      orderNumber,
      total,
      totalLabel: 'Total Amount Paid / Due',
      items,
      trackingUrl,
      textFallback: `Dear ${name},\n\nYour order ${orderNumber} has been verified and is being prepared.\nTotal: ${total} EGP\n\nThank you for choosing M20.`
    });
  }

  /**
   * Send Order Status Update Email when Admin advances fulfillment stage
   */
  static async sendOrderStatusUpdate({ to, name = 'Valued Customer', orderNumber, orderStatus, total, items = [], trackingUrl }) {
    const statusLabels = {
      confirmed: { headline: 'Your M20 Order is Confirmed', note: 'Your order has been confirmed and queued for preparation.' },
      processing: { headline: 'Your M20 Order is Being Prepared', note: 'Our atelier team is carefully packaging your fragrances.' },
      shipped: { headline: 'Your M20 Order is On the Way', note: 'Your parcel has been handed to our courier and is on its way to you.' },
      delivered: { headline: 'Your M20 Order Was Delivered', note: 'Your M20 order has been delivered. We hope you enjoy your signature scent.' }
    };
    const meta = statusLabels[orderStatus];
    if (!meta) return { success: false, error: 'UNTRACKED_STATUS' };

    const safeName = escapeHtml(name || 'Valued Customer');
    return this.sendOrderEmail({
      to,
      subject: `M20 Order ${orderNumber}: ${meta.headline}`,
      headline: meta.headline,
      introHtml: `<p>Dear ${safeName},</p><p>${escapeHtml(meta.note)}</p>`,
      orderNumber,
      total,
      totalLabel: 'Order Total',
      items,
      trackingUrl,
      metaRows: [{ label: 'Current Status', value: String(orderStatus).toUpperCase() }],
      textFallback: `Dear ${name},\n\n${meta.note}\nOrder: ${orderNumber}\nTrack: ${trackingUrl || ''}`
    });
  }

  /**
   * Notify Store Owner / Admin when a new order is placed
   */
  static async sendAdminNewOrderAlert({ to, orderNumber, customerName, customerPhone, customerEmail, total, items = [], deliveryMethod, paymentMethod }) {
    const cfg = this.getSmtpConfig();
    const targetEmail = to || process.env.ADMIN_NOTIFICATION_EMAIL || cfg.user;
    if (!targetEmail) return { success: false, error: 'NO_ADMIN_EMAIL' };

    return this.sendOrderEmail({
      to: targetEmail,
      subject: `New M20 Order #${orderNumber} (${Number(total || 0).toLocaleString()} EGP)`,
      headline: 'New Order Received on M20 Store',
      introHtml: `<p>A new order has been placed on the storefront and is ready for review in the Dashboard.</p>`,
      orderNumber,
      total,
      totalLabel: 'Order Total',
      items,
      metaRows: [
        { label: 'Customer', value: customerName || 'Guest' },
        { label: 'Phone', value: customerPhone || 'N/A' },
        { label: 'Email', value: customerEmail || 'Not provided' },
        { label: 'Delivery', value: deliveryMethod === 'metro_pickup' ? 'Metro Pickup' : 'Home Delivery' },
        { label: 'Payment', value: String(paymentMethod || 'cod').replace(/_/g, ' ').toUpperCase() }
      ],
      textFallback: `New M20 Order #${orderNumber}\nCustomer: ${customerName} (${customerPhone})\nTotal: ${total} EGP`
    });
  }
}

module.exports = EmailService;
