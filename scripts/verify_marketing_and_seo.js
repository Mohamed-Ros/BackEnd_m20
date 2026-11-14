require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const { hashData, normalizePhoneForCapi } = require('../src/utils/helpers/metaCapi');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }
  console.log('\n======================================================');
  console.log('--- STARTING MARKETING ATTRIBUTION & SEO VERIFICATION ---');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // TEST 1: Phone Normalization for Egyptian CAPI (E.164)
  console.log('\n--- 1. Testing Egyptian Phone Normalization for CAPI ---');
  const p1 = normalizePhoneForCapi('01132687324');
  assert(p1 === '201132687324', `Local Egyptian 011... normalizes to 2011...: got ${p1}`);

  const p2 = normalizePhoneForCapi('+20 10 1234 5678');
  assert(p2 === '201012345678', `Formatted +20 10... normalizes to 2010...: got ${p2}`);

  const p3 = normalizePhoneForCapi('201234567890');
  assert(p3 === '201234567890', `Already prefixed 20... remains untouched: got ${p3}`);

  // TEST 2: SHA-256 Hashing for Meta EMQ Matching
  console.log('\n--- 2. Testing SHA-256 Normalization & Hashing ---');
  const emailHash = hashData('  Test.User@M20Fragrance.COM ');
  assert(typeof emailHash === 'string' && emailHash.length === 64, 'Email hashed to 64-char hex SHA-256');

  // TEST 3: Technical SEO - Dynamic /robots.txt
  console.log('\n--- 3. Testing Technical SEO: /robots.txt Endpoint ---');
  try {
    const robotsRes = await axios.get(`${BASE_URL}/robots.txt`);
    assert(robotsRes.status === 200, 'GET /robots.txt returns status 200');
    assert(robotsRes.data.includes('Disallow: /admin'), 'robots.txt disallows /admin');
    assert(robotsRes.data.includes('Disallow: /api'), 'robots.txt disallows /api');
    assert(robotsRes.data.includes('Disallow: /checkout'), 'robots.txt disallows /checkout');
    assert(robotsRes.data.includes('Sitemap: https://m20fragrance.com/sitemap.xml'), 'robots.txt points to official sitemap');
  } catch (err) {
    assert(false, `GET /robots.txt failed: ${err.message}`);
  }

  // TEST 4: Technical SEO - Dynamic /sitemap.xml
  console.log('\n--- 4. Testing Technical SEO: /sitemap.xml Endpoint ---');
  try {
    const sitemapRes = await axios.get(`${BASE_URL}/sitemap.xml`);
    assert(sitemapRes.status === 200, 'GET /sitemap.xml returns status 200');
    assert(sitemapRes.data.includes('<urlset'), 'sitemap.xml contains valid XML urlset');
    assert(sitemapRes.data.includes('https://m20fragrance.com/'), 'sitemap.xml contains homepage');
    assert(sitemapRes.data.includes('hreflang="ar-eg"'), 'sitemap.xml contains Arabic hreflang');
    assert(sitemapRes.data.includes('hreflang="en-eg"'), 'sitemap.xml contains English hreflang');
  } catch (err) {
    assert(false, `GET /sitemap.xml failed: ${err.message}`);
  }

  // TEST 5: Public Settings Security & Token Masking
  console.log('\n--- 5. Testing Public Settings Security & Token Masking ---');
  try {
    const publicSettingsRes = await axios.get(`${BASE_URL}/api/settings/public`);
    assert(publicSettingsRes.status === 200, 'GET /api/settings/public returns status 200');
    const tracking = publicSettingsRes.data?.data?.tracking || publicSettingsRes.data?.tracking;
    assert(tracking !== undefined, 'Tracking configuration exists in public settings');
    assert(tracking && tracking.metaCapiAccessToken === undefined, 'metaCapiAccessToken is strictly MASKED/HIDDEN from public endpoint');
    assert(tracking && tracking.enableTracking !== undefined, 'enableTracking toggle is exposed safely');
  } catch (err) {
    assert(false, `GET /api/settings/public failed: ${err.message}`);
  }

  // TEST 6: Order Attribution Capture & Persistence
  console.log('\n--- 6. Testing Order Creation with UTM Attribution ---');
  try {
    // Get an active product for valid productId
    const productsRes = await axios.get(`${BASE_URL}/api/products`);
    const products = productsRes.data?.data?.products || productsRes.data?.products || productsRes.data?.data || [];
    const testProduct = Array.isArray(products) && products.length > 0 ? products[0] : null;

    if (!testProduct) {
      assert(false, 'No products found in DB for checkout test');
    } else {
      const testPhone = '01199988877';
      const testPayload = {
        deliveryMethod: 'home_delivery',
        customerName: 'Marketing Test Customer',
        customerPhone: testPhone,
        customerEmail: 'attribution.test@m20fragrance.com',
        paymentMethod: 'cod',
        items: [
          {
            productId: testProduct._id,
            productName: testProduct.name,
            size: '50ml',
            price: 850,
            quantity: 1
          }
        ],
        shippingAddress: {
          governorate: 'Giza',
          city: 'Dokki',
          street: 'El Tahrir St',
          buildingNumber: '10'
        },
        attribution: {
          source: 'tiktok',
          medium: 'cpc',
          campaign: 'summer_launch_2026',
          content: 'video_ad_hook_1',
          term: 'perfume egypt',
          ttclid: 'tt_test_click_998877',
          channel: 'tiktok'
        }
      };

      const orderRes = await axios.post(`${BASE_URL}/api/orders`, testPayload);
      assert(orderRes.status === 201 || orderRes.status === 200, 'Order created successfully with UTM attribution');
      const createdOrder = orderRes.data?.data || orderRes.data;
      assert(createdOrder.attribution?.channel === 'tiktok', 'Order channel auto-assigned as "tiktok"');
      assert(createdOrder.attribution?.campaign === 'summer_launch_2026', 'Order campaign correctly saved as "summer_launch_2026"');
      assert(createdOrder.attribution?.ttclid === 'tt_test_click_998877', 'TikTok click ID saved');
      assert(createdOrder.metaEventId !== undefined, `Order has deduplication metaEventId: ${createdOrder.metaEventId}`);

      // TEST 7: Marketing Analytics Endpoint & Service
      console.log('\n--- 7. Testing Admin Marketing Analytics ---');
      const User = require('../src/modules/users/user.model');
      const { generateAccessToken } = require('../src/utils/security/jwt');
      const OrderService = require('../src/modules/orders/order.service');

      // 7a. Test service calculation directly
      const serviceStats = await OrderService.getMarketingAnalytics({});
      assert(Array.isArray(serviceStats.channels), 'OrderService returns marketing channels array');
      const tiktokChannel = serviceStats.channels.find(c => c.id === 'tiktok');
      assert(tiktokChannel && tiktokChannel.count >= 1, `TikTok orders registered in service (count: ${tiktokChannel?.count})`);

      // 7b. Test HTTP endpoint with Admin Token
      const adminUser = await User.findOne({ role: 'admin' });
      if (adminUser) {
        const token = generateAccessToken({ id: adminUser._id, role: adminUser.role });
        const analyticsRes = await axios.get(`${BASE_URL}/api/orders/marketing-analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        assert(analyticsRes.status === 200, 'GET /api/orders/marketing-analytics with admin token returns status 200');
        const stats = analyticsRes.data?.data || analyticsRes.data;
        assert(Array.isArray(stats.channels), 'Analytics HTTP endpoint returns channels array');
        assert(Array.isArray(stats.topCampaigns), 'Analytics returns top campaigns list');
      } else {
        console.log('[SKIP] No admin user in DB for HTTP header test, service test passed');
      }
    }
  } catch (err) {
    assert(false, `Order creation failed: ${err.response?.data?.message || err.message}`);
  }

  console.log('\n======================================================');
  console.log(`VERIFICATION COMPLETE: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error('Fatal error during verification:', e);
  process.exit(1);
});
