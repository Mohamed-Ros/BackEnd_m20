require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const User = require('../src/modules/users/user.model');
const CashAccount = require('../src/modules/finance/cashAccount.model');
const Expense = require('../src/modules/expenses/expense.model');
const AdSpend = require('../src/modules/marketing/adSpend.model');
const { signToken } = require('../src/utils/security/jwt');

const BASE_URL = 'http://localhost:5000';

async function runVerification() {
  console.log('\n======================================================');
  console.log('--- STARTING MARKETING & ADS ANALYTICS DASHBOARD TEST ---');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, name) {
    if (cond) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  // Find or create admin user for token
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.findOne();
  }
  const token = signToken({ id: admin._id, role: 'admin' });
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // Find or create a CashAccount for ad spend test
  let testAccount = await CashAccount.findOne({ active: true });
  if (!testAccount) {
    testAccount = await CashAccount.create({
      name: 'Ad Marketing Bank Account',
      type: 'bank',
      balance: 50000
    });
  }
  const initialBalance = testAccount.balance;

  // 1. Test Funnel Event Ingestion (Public Endpoint)
  console.log('\n--- 1. Testing Storefront Funnel Event Ingestion (/api/marketing/event) ---');
  const testSessionId = 'm20_test_session_' + Date.now();
  const eventPayload = {
    eventType: 'view_content',
    platform: 'tiktok',
    campaign: 'summer_launch_2026',
    content: 'video_hook_oud',
    sessionId: testSessionId,
    path: '/product/crush',
    productName: 'CRUSH Extrait de Parfum',
    value: 850
  };

  try {
    const evRes = await axios.post(`${BASE_URL}/api/marketing/event`, eventPayload);
    assert(evRes.status === 201 || evRes.status === 200, 'POST /api/marketing/event succeeds (status 201/200)');
    assert(evRes.data?.data?.sessionId === testSessionId, 'Event stored with correct sessionId and campaign');
  } catch (err) {
    assert(false, `Event ingestion failed: ${err.message}`);
  }

  // 2. Test Logging Ad Spend & Cash Account Sync
  console.log('\n--- 2. Testing Ad Spend Logging & Cash Account Deduction ---');
  let createdAdSpendId = null;
  const testSpendAmount = 2500;
  const spendPayload = {
    platform: 'tiktok',
    campaignName: 'summer_launch_2026',
    adContent: 'video_hook_oud',
    amountEGP: testSpendAmount,
    startDate: new Date().toISOString().split('T')[0],
    paymentAccountId: testAccount._id,
    notes: 'TikTok In-Feed Video Campaign Scaling'
  };

  try {
    const spendRes = await axios.post(`${BASE_URL}/api/marketing/ad-spend`, spendPayload, authHeaders);
    assert(spendRes.status === 201 || spendRes.status === 200, 'POST /api/marketing/ad-spend created successfully');
    const createdSpend = spendRes.data?.data || spendRes.data;
    createdAdSpendId = createdSpend._id;
    assert(createdSpend.amountEGP === testSpendAmount, `Ad spend amount recorded as integer: ${createdSpend.amountEGP} EGP`);
    assert(createdSpend.expenseId !== null, 'Ad spend automatically generated linked Expense record');

    // Check that CashAccount balance was deducted
    const updatedAccount = await CashAccount.findById(testAccount._id);
    assert(updatedAccount.balance === initialBalance - testSpendAmount, `CashAccount balance deducted by ${testSpendAmount} EGP (new balance: ${updatedAccount.balance})`);

    // Check linked Expense
    const linkedExp = await Expense.findById(createdSpend.expenseId);
    assert(linkedExp && linkedExp.category === 'Marketing', 'Linked Expense has category: "Marketing" for Finance Overview sync');
    assert(linkedExp && linkedExp.amount === testSpendAmount, `Linked Expense amount matches: ${linkedExp.amount} EGP`);
  } catch (err) {
    assert(false, `Ad spend creation failed: ${err.response?.data?.message || err.message}`);
  }

  // 3. Test Dashboard Aggregation Endpoint
  console.log('\n--- 3. Testing Marketing Dashboard Metrics (/api/marketing/dashboard) ---');
  try {
    const dashRes = await axios.get(`${BASE_URL}/api/marketing/dashboard?rangeKey=all&platform=all`, authHeaders);
    assert(dashRes.status === 200, 'GET /api/marketing/dashboard returns status 200');
    const data = dashRes.data?.data || dashRes.data;

    // Validate KPIs
    assert(data.kpis !== undefined, 'Dashboard returns kpis object');
    assert(data.kpis.totalAdSpend >= testSpendAmount, `Total Ad Spend reflects logged spend: ${data.kpis.totalAdSpend} EGP`);
    assert(typeof data.kpis.deliveredRoas === 'number', `Delivered ROAS calculated: ${data.kpis.deliveredRoas}x`);
    assert(typeof data.kpis.cpa === 'number', `CPA calculated: ${data.kpis.cpa} EGP`);
    assert(typeof data.kpis.netCampaignProfit === 'number', `Net Campaign Profit calculated: ${data.kpis.netCampaignProfit} EGP`);

    // Validate Funnel
    assert(data.funnel && Array.isArray(data.funnel.steps), 'Dashboard returns conversion funnel steps');
    assert(data.funnel.steps.length === 5, 'Funnel has exact 5 steps (PageViews -> ViewContent -> AddToCart -> InitiateCheckout -> Purchase)');
    assert(typeof data.funnel.overallConversionRate === 'number', `Overall conversion rate calculated: ${data.funnel.overallConversionRate}%`);

    // Validate Campaigns Breakdown
    assert(Array.isArray(data.campaigns), 'Dashboard returns campaigns array');
    const matchedCamp = data.campaigns.find(c => c.campaignName === 'summer_launch_2026');
    assert(matchedCamp !== undefined, 'Logged campaign "summer_launch_2026" appears in campaigns table');
    assert(matchedCamp && matchedCamp.spend >= testSpendAmount, `Campaign spend correctly aggregated: ${matchedCamp?.spend} EGP`);

    // Validate Fragrances by Channel
    assert(Array.isArray(data.fragrances), 'Dashboard returns fragrances breakdown array');
    assert(data.fragrances.some(f => f.name === 'CRUSH'), 'Fragrance breakdown includes CRUSH');
  } catch (err) {
    assert(false, `Dashboard retrieval failed: ${err.response?.data?.message || err.message}`);
  }

  // 4. Test Deleting Ad Spend & Balance Reversal
  console.log('\n--- 4. Testing Deletion & Cash Balance Reversal ---');
  if (createdAdSpendId) {
    try {
      const delRes = await axios.delete(`${BASE_URL}/api/marketing/ad-spend/${createdAdSpendId}`, authHeaders);
      assert(delRes.status === 200, 'DELETE /api/marketing/ad-spend/:id succeeds');

      // Check that CashAccount balance was restored
      const restoredAccount = await CashAccount.findById(testAccount._id);
      assert(restoredAccount.balance === initialBalance, `CashAccount balance restored to initial: ${restoredAccount.balance} EGP`);
    } catch (err) {
      assert(false, `Deletion failed: ${err.message}`);
    }
  }

  console.log('\n======================================================');
  console.log(`MARKETING DASHBOARD VERIFICATION: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runVerification().catch(e => {
  console.error('Fatal verification error:', e);
  process.exit(1);
});
