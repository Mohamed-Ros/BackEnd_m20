const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const { globalRateLimiter } = require('./middleware/rateLimiter');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

// Import Module Routes
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const productRoutes = require('./modules/products/product.routes');
const orderRoutes = require('./modules/orders/order.routes');
const couponRoutes = require('./modules/coupons/coupon.routes');
const reviewRoutes = require('./modules/reviews/review.routes');
const homepageRoutes = require('./modules/homepage/homepage.routes');
const cloudinaryRoutes = require('./cloudinary/cloudinary.routes');
const fawaterkRoutes = require('./payments/fawaterk/routes');
const rawMaterialRoutes = require('./modules/inventory/rawMaterial.routes');
const formulaRoutes = require('./modules/formulas/formula.routes');
const batchRoutes = require('./modules/batches/batch.routes');
const purchaseRoutes = require('./modules/purchases/purchase.routes');
const expenseRoutes = require('./modules/expenses/expense.routes');
const financeRoutes = require('./modules/finance/finance.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const offerRoutes = require('./modules/offers/offer.routes');
const marketingRoutes = require('./modules/marketing/marketing.routes');


const app = express();


// 1. Security HTTP Headers
app.use(helmet());

// 2. CORS Configuration
app.use(
  cors({
    // Credentials (sendBeacon / cookies) are incompatible with a '*' origin, so reflect the
    // request origin when CORS_ORIGIN is unset or '*', otherwise allow the comma-separated list.
    origin:
      !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.trim() === '*'
        ? true
        : process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-fawaterk-signature', 'signature']
  })
);

// 3. Global Rate Limiter
app.use('/api', globalRateLimiter);

// 4. Request Body Parsing & Limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Data Sanitization against NoSQL Query Injection & Parameter Pollution
app.use(mongoSanitize());
app.use(
  hpp({
    whitelist: ['price', 'season', 'fragranceFamily', 'orderStatus', 'paymentStatus']
  })
);

// 6. Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'M20 API Server is healthy and running.',
    timestamp: new Date().toISOString()
  });
});

// SEO Technical Endpoints: robots.txt & dynamic sitemap.xml
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /checkout
Disallow: /account

Sitemap: https://m20fragrance.store/sitemap.xml
`);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const Product = require('./modules/products/product.model');
    const products = await Product.find({ active: true }).select('slug updatedAt');
    const baseUrl = 'https://m20fragrance.store';
    const now = new Date().toISOString().split('T')[0];

    const staticUrls = [
      { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${baseUrl}/shop`, priority: '0.9', changefreq: 'daily' },
      { loc: `${baseUrl}/men`, priority: '0.8', changefreq: 'weekly' },
      { loc: `${baseUrl}/women`, priority: '0.8', changefreq: 'weekly' },
      { loc: `${baseUrl}/offers`, priority: '0.8', changefreq: 'daily' },
      { loc: `${baseUrl}/about`, priority: '0.7', changefreq: 'monthly' },
      { loc: `${baseUrl}/policies`, priority: '0.5', changefreq: 'monthly' }
    ];

    const productUrls = products.map(p => ({
      loc: `${baseUrl}/product/${p.slug}`,
      lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : now,
      priority: '0.9',
      changefreq: 'weekly'
    }));

    const allUrls = [...staticUrls, ...productUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : `<lastmod>${now}</lastmod>`}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
    <xhtml:link rel="alternate" hreflang="ar-eg" href="${u.loc}?lang=ar" />
    <xhtml:link rel="alternate" hreflang="en-eg" href="${u.loc}?lang=en" />
  </url>`).join('\n')}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

// 7. Mount API Modular Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/home', homepageRoutes);
app.use('/api/cloudinary', cloudinaryRoutes);
app.use('/api/payments/fawaterk', fawaterkRoutes);
app.use('/api/inventory', rawMaterialRoutes);
app.use('/api/formulas', formulaRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/marketing', marketingRoutes);


// 8. 404 Route Handler

app.use(notFound);

// 9. Global Error Handling Middleware
app.use(errorHandler);

module.exports = app;
