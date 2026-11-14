const CashAccount = require('./cashAccount.model');
const StockMovement = require('../inventory/stockMovement.model');
const RawMaterial = require('../inventory/rawMaterial.model');
const Product = require('../products/product.model');
const Order = require('../orders/order.model');
const Expense = require('../expenses/expense.model');
const Purchase = require('../purchases/purchase.model');
const ProductionBatch = require('../batches/batch.model');
const Settings = require('../settings/settings.model');
const AppError = require('../../utils/errors/appError');

// Ensure default cash accounts exist
const ensureDefaultAccounts = async () => {
  const count = await CashAccount.countDocuments();
  if (count === 0) {
    await CashAccount.create([
      { name: 'Vodafone Cash', type: 'digital_wallet', accountIdentifier: '01012345678', balance: 0 },
      { name: 'InstaPay', type: 'digital_wallet', accountIdentifier: 'm20.perfumes@instapay', balance: 0 },
      { name: 'Cash on Hand', type: 'cash', accountIdentifier: 'Main Safe', balance: 0 },
      { name: 'Bank Account', type: 'bank', accountIdentifier: 'CIB - Main', balance: 0 },
      { name: 'Payment Gateway', type: 'online_gateway', accountIdentifier: 'Fawaterk Gateway', balance: 0 }
    ]);
  }
};

const getCashAccounts = async () => {
  await ensureDefaultAccounts();
  const accounts = await CashAccount.find().sort({ name: 1 });
  return accounts;
};

const getCashAccountById = async (id) => {
  const account = await CashAccount.findById(id);
  if (!account) {
    throw new AppError('Cash account not found', 404);
  }
  return account;
};

const createCashAccount = async (data) => {
  const existing = await CashAccount.findOne({ name: data.name.trim() });
  if (existing) {
    throw new AppError(`Account with name "${data.name}" already exists.`, 400);
  }

  const account = await CashAccount.create({
    name: data.name.trim(),
    type: data.type || 'cash',
    accountIdentifier: data.accountIdentifier || '',
    balance: Number(data.initialBalance) || 0,
    notes: data.notes || '',
    active: data.active !== undefined ? data.active : true
  });

  return account;
};

const updateCashAccount = async (id, data) => {
  const account = await CashAccount.findById(id);
  if (!account) {
    throw new AppError('Account not found', 404);
  }

  if (data.name) account.name = data.name.trim();
  if (data.type) account.type = data.type;
  if (data.accountIdentifier !== undefined) account.accountIdentifier = data.accountIdentifier;
  if (data.notes !== undefined) account.notes = data.notes;
  if (data.active !== undefined) account.active = data.active;

  await account.save();
  return account;
};

const adjustAccountBalance = async (id, { amount, type = 'MANUAL_ADJUSTMENT', description = '' }, userId) => {
  const account = await CashAccount.findById(id);
  if (!account) {
    throw new AppError('Cash account not found', 404);
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt === 0) {
    throw new AppError('Adjustment amount must be non-zero', 400);
  }

  account.balance += amt;
  account.transactions.push({
    type,
    amount: amt,
    balanceAfter: account.balance,
    description: description || 'Manual balance adjustment',
    date: new Date(),
    createdBy: userId
  });

  await account.save();
  return account;
};

const getStockMovements = async (query = {}) => {
  const filter = {};
  if (query.itemType) filter.itemType = query.itemType;
  if (query.movementType) filter.movementType = query.movementType;
  if (query.rawMaterial) filter.rawMaterial = query.rawMaterial;
  if (query.product) filter.product = query.product;
  if (query.startDate && query.endDate) {
    filter.createdAt = {
      $gte: new Date(query.startDate),
      $lte: new Date(query.endDate)
    };
  }

  const limit = Math.min(100, Number(query.limit) || 50);
  const page = Math.max(1, Number(query.page) || 1);
  const skip = (page - 1) * limit;

  const [total, movements] = await Promise.all([
    StockMovement.countDocuments(filter),
    StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name phone email')
  ]);

  return {
    total,
    page,
    pages: Math.ceil(total / limit),
    movements
  };
};

/**
 * Helper to compute date range from presets or custom dates
 */
const getDateRange = (query) => {
  const { preset, startDate, endDate } = query;
  const now = new Date();

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start) && !isNaN(end)) {
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }

  if (preset) {
    switch (preset.toLowerCase()) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return { start, end };
      }
      case 'yesterday': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        return { start, end };
      }
      case 'this_week': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
        return { start, end: now };
      }
      case 'this_month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        return { start, end: now };
      }
      case 'last_month': {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { start, end };
      }
      case 'this_year': {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        return { start, end: now };
      }
      case 'all':
      default:
        return null;
    }
  }

  return null;
};

/**
 * Simplified Finance Overview:
 * - Gross Sales
 * - Cost of Goods Sold (COGS)
 * - Gross Profit
 * - Operating Expenses
 * - Shipping and Transportation Expenses
 * - Net Profit
 * - Cash and Payment Account Balances
 * - Outstanding Customer Payments
 * - Outstanding Supplier Payments
 * - Inventory Valuations
 */
const getFinanceOverview = async (query = {}) => {
  await ensureDefaultAccounts();

  const range = getDateRange(query);
  const orderDateFilter = range ? { createdAt: { $gte: range.start, $lte: range.end } } : {};
  const expenseDateFilter = range ? { date: { $gte: range.start, $lte: range.end } } : {};
  const purchaseDateFilter = range ? { purchaseDate: { $gte: range.start, $lte: range.end } } : {};

  // Valid orders that contribute to completed sales revenue
  // Excludes cancelled and returned_from_shipping orders.
  // Undelivered, unpaid orders do not count as completed sales revenue.
  const validOrderFilter = {
    orderStatus: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] },
    $or: [
      { paymentStatus: 'paid' },
      { orderStatus: 'delivered' }
    ],
    ...orderDateFilter
  };

  const [orders, allOrders, rawMaterials, products, expenses, purchases, cashAccounts, settingsDoc] = await Promise.all([
    Order.find(validOrderFilter),
    Order.find(orderDateFilter).populate('customer', 'name phone'),
    RawMaterial.find({ active: true }),
    Product.find({ active: true }),
    Expense.find(expenseDateFilter),
    Purchase.find(purchaseDateFilter),
    CashAccount.find({ active: true }),
    Settings.findOne()
  ]);

  const costDefaults = settingsDoc?.costDefaults || {
    bottleWithCapSprayer: 45,
    sticker: 20,
    box: 25,
    marketingPerBottle: 20,
    defaultLiquidDensity: 0.86
  };

  // 1. Gross Sales & COGS (Strict Whole Integers)
  let grossSales = 0;
  let totalCogs = 0;
  let totalOutboundShippingOnOrders = 0;

  orders.forEach((order) => {
    grossSales += Math.round(order.total || 0);
    // Outbound carrier shipping expense for valid orders
    const outboundCost = Math.round(order.actualOutboundShippingCost ?? order.realShippingCost ?? 0);
    totalOutboundShippingOnOrders += outboundCost;

    if (order.totalCogs && order.totalCogs > 0) {
      totalCogs += Math.round(order.totalCogs);
    } else {
      // Calculate from items if totalCogs not recorded
      (order.items || []).forEach((item) => {
        if (item.totalCost && item.totalCost > 0) {
          totalCogs += Math.round(item.totalCost);
        } else {
          const sizeMl = parseInt(item.size, 10) || 50;
          const density = costDefaults.defaultLiquidDensity || 0.86;
          const grams = sizeMl * density;
          const pkgCost = (Number(costDefaults.bottleWithCapSprayer) || 45) +
                          (Number(costDefaults.sticker) || 20) +
                          (Number(costDefaults.box) || 25) +
                          (Number(costDefaults.marketingPerBottle) || 20);
          const estUnitCost = (grams * 0.5) + pkgCost;
          totalCogs += Math.round(estUnitCost * (item.quantity || 1));
        }
      });
    }
  });

  const grossProfit = grossSales - totalCogs;
  const grossProfitMargin = grossSales > 0 ? Number(((grossProfit / grossSales) * 100).toFixed(1)) : 0;

  // 2. Operating Expenses vs Shipping & Transportation (Preventing Duplication)
  let operatingExpenses = 0;
  let generalTransportExpenses = 0;
  const expensesByCategory = {};
  const processedExpenseOrderIds = new Set();

  expenses.forEach((exp) => {
    const amt = Math.round(exp.amount || 0);
    if (exp.category === 'Transportation') {
      if (exp.relatedOrderId) {
        processedExpenseOrderIds.add(String(exp.relatedOrderId));
      } else {
        // General transport/logistics not tied to an individual customer order
        generalTransportExpenses += amt;
      }
    } else {
      operatingExpenses += amt;
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + amt;
    }
  });

  // 3. Cash and Payment Account Balances
  let totalCashBalance = 0;
  const allTransactions = [];

  const accountBalances = cashAccounts.map((acc) => {
    const b = acc.balance || 0;
    totalCashBalance += b;

    (acc.transactions || []).forEach((tx) => {
      allTransactions.push({
        _id: tx._id,
        accountId: acc._id,
        accountName: acc.name,
        accountType: acc.type,
        type: tx.type,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        description: tx.description,
        date: tx.date || tx.createdAt
      });
    });

    return {
      id: acc._id,
      name: acc.name,
      type: acc.type,
      balance: Number(b.toFixed(2)),
      identifier: acc.accountIdentifier || ''
    };
  });

  allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 4. Returned Orders & Shipping Costs (Strict Whole Integers)
  let returnedOrdersCount = 0;
  let totalReturnShippingExpenses = 0;
  let outboundReturnShippingTotal = 0;
  let inboundReturnShippingTotal = 0;
  const returnedOrdersList = [];

  allOrders.forEach((o) => {
    if (o.orderStatus === 'returned_from_shipping') {
      returnedOrdersCount++;
      const outFee = Math.round(Number(o.actualOutboundShippingCost ?? o.returnDetails?.outboundShippingFee ?? o.realShippingCost ?? 0));
      const inFee = Math.round(Number(o.actualReturnShippingCost ?? o.returnDetails?.returnShippingFee ?? 0));
      const totFee = Math.round(Number(o.returnDetails?.totalReturnShippingCost) || (outFee + inFee));
      outboundReturnShippingTotal += outFee;
      inboundReturnShippingTotal += inFee;
      totalReturnShippingExpenses += totFee;

      returnedOrdersList.push({
        _id: o._id,
        orderNumber: o.orderNumber,
        customerName: o.customer?.name || 'Customer',
        customerPhone: o.customerPhone || o.customer?.phone || '',
        total: Math.round(o.total || 0),
        outboundShippingFee: outFee,
        returnShippingFee: inFee,
        totalReturnShippingCost: totFee,
        returnReason: o.returnDetails?.returnReason || '',
        restockStatus: o.returnDetails?.restockStatus || 'not_inspected',
        refundStatus: o.returnDetails?.refundStatus || 'not_applicable',
        refundAmount: Math.round(o.returnDetails?.refundAmount || 0),
        createdAt: o.createdAt
      });
    }
  });

  // Total Shipping Expenses = Outbound on completed orders + Return shipping on returned orders
  const totalShippingExpenses = totalOutboundShippingOnOrders + totalReturnShippingExpenses;
  const shippingAndTransportExpenses = totalShippingExpenses + generalTransportExpenses;
  const netProfit = grossProfit - operatingExpenses - shippingAndTransportExpenses;
  const netProfitMargin = grossSales > 0 ? Number(((netProfit / grossSales) * 100).toFixed(1)) : 0;

  // 5. Outstanding Customer Payments (unverified transfers or unpaid pending orders)
  // Exclude cancelled and returned_from_shipping orders
  let outstandingCustomerPayments = 0;
  let outstandingCustomerOrdersCount = 0;

  allOrders.forEach((o) => {
    if (
      o.orderStatus !== 'cancelled' &&
      o.orderStatus !== 'returned_from_shipping' &&
      o.paymentStatus !== 'paid' &&
      o.paymentStatus !== 'refunded'
    ) {
      outstandingCustomerPayments += o.total || 0;
      outstandingCustomerOrdersCount++;
    }
  });

  // 6. Outstanding Supplier Payments (unpaid purchase invoices)
  let outstandingSupplierPayments = 0;
  let unpaidInvoicesCount = 0;

  purchases.forEach((p) => {
    if (p.paymentStatus === 'unpaid') {
      outstandingSupplierPayments += p.totalAmount || 0;
      unpaidInvoicesCount++;
    }
  });

  // 7. Inventory Valuations
  let rawMaterialsValuation = 0;
  let oilsValuation = 0;
  let alcoholValuation = 0;
  let packagingValuation = 0;

  rawMaterials.forEach((rm) => {
    const val = (rm.currentStock || 0) * (rm.costPerGram || 0);
    rawMaterialsValuation += val;
    if (rm.category === 'fragrance_oil') oilsValuation += val;
    else if (rm.category === 'alcohol') alcoholValuation += val;
    else packagingValuation += val;
  });

  let finishedLiquidValuation = 0;
  let totalFinishedLiquidGrams = 0;

  products.forEach((p) => {
    const g = p.finishedLiquidGrams || 0;
    const c = p.finishedLiquidCostPerGram || 0;
    totalFinishedLiquidGrams += g;
    finishedLiquidValuation += g * c;
  });

  const totalInventoryValuation = rawMaterialsValuation + finishedLiquidValuation;

  return {
    dateRange: range ? { start: range.start, end: range.end } : { preset: query.preset || 'all' },
    summary: {
      grossSales: Math.round(grossSales),
      cogs: Math.round(totalCogs),
      grossProfit: Math.round(grossProfit),
      grossProfitMargin,
      operatingExpenses: Math.round(operatingExpenses),
      shippingExpenses: Math.round(totalShippingExpenses),
      shippingAndTransportExpenses: Math.round(shippingAndTransportExpenses),
      actualOutboundShippingTotal: Math.round(totalOutboundShippingOnOrders),
      netProfit: Math.round(netProfit),
      netProfitMargin,
      totalOrdersCount: orders.length,
      returnedOrdersCount,
      totalReturnShippingExpenses: Math.round(totalReturnShippingExpenses),
      outboundReturnShipping: Math.round(outboundReturnShippingTotal),
      inboundReturnShipping: Math.round(inboundReturnShippingTotal),
      returnShippingProfitImpact: Math.round(-totalReturnShippingExpenses)
    },
    returnedShipments: {
      count: returnedOrdersCount,
      totalCost: Math.round(totalReturnShippingExpenses),
      outboundCost: Math.round(outboundReturnShippingTotal),
      returnCost: Math.round(inboundReturnShippingTotal),
      orders: returnedOrdersList
    },
    cashBalances: {
      total: Number(totalCashBalance.toFixed(2)),
      accounts: accountBalances
    },
    outstanding: {
      customerPayments: Number(outstandingCustomerPayments.toFixed(2)),
      customerOrdersCount: outstandingCustomerOrdersCount,
      supplierPayments: Number(outstandingSupplierPayments.toFixed(2)),
      unpaidInvoicesCount
    },
    inventoryValuation: {
      rawMaterialsValue: Number(rawMaterialsValuation.toFixed(2)),
      oilsValue: Number(oilsValuation.toFixed(2)),
      alcoholValue: Number(alcoholValuation.toFixed(2)),
      packagingValue: Number(packagingValuation.toFixed(2)),
      finishedLiquidValue: Number(finishedLiquidValuation.toFixed(2)),
      totalFinishedLiquidGrams: Number(totalFinishedLiquidGrams.toFixed(2)),
      totalInventoryValue: Number(totalInventoryValuation.toFixed(2))
    },
    expensesByCategory,
    recentTransactions: allTransactions.slice(0, 25),
    costDefaults
  };
};

const getCostSettings = async () => {
  const settings = await Settings.findOne();
  return settings?.costDefaults || {
    bottleWithCapSprayer: 45,
    sticker: 20,
    box: 25,
    marketingPerBottle: 20,
    defaultLiquidDensity: 0.86
  };
};

const updateCostSettings = async (data) => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }

  settings.costDefaults = {
    bottleWithCapSprayer: Number(data.bottleWithCapSprayer ?? settings.costDefaults?.bottleWithCapSprayer ?? 45),
    sticker: Number(data.sticker ?? settings.costDefaults?.sticker ?? 20),
    box: Number(data.box ?? settings.costDefaults?.box ?? 25),
    marketingPerBottle: Number(data.marketingPerBottle ?? settings.costDefaults?.marketingPerBottle ?? 20),
    defaultLiquidDensity: Number(data.defaultLiquidDensity ?? settings.costDefaults?.defaultLiquidDensity ?? 0.86)
  };

  await settings.save();
  return settings.costDefaults;
};

const getReports = async (reportType, query = {}) => {
  return await getFinanceOverview(query);
};

module.exports = {
  getCashAccounts,
  getCashAccountById,
  createCashAccount,
  updateCashAccount,
  adjustAccountBalance,
  getStockMovements,
  getFinanceOverview,
  getCostSettings,
  updateCostSettings,
  getReports
};
