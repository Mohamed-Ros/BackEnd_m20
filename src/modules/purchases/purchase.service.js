const crypto = require('crypto');
const Purchase = require('./purchase.model');
const RawMaterial = require('../inventory/rawMaterial.model');
const StockMovement = require('../inventory/stockMovement.model');
const CashAccount = require('../finance/cashAccount.model');
const AppError = require('../../utils/errors/appError');

const getAllPurchases = async (query = {}) => {
  const purchases = await Purchase.find(query)
    .sort({ purchaseDate: -1, createdAt: -1 })
    .populate('items.rawMaterial', 'name category unit currentStock costPerGram')
    .populate('paymentAccount', 'name type')
    .populate('createdBy', 'name phone email');

  return purchases;
};

const getPurchaseById = async (id) => {
  const purchase = await Purchase.findById(id)
    .populate('items.rawMaterial')
    .populate('paymentAccount')
    .populate('createdBy', 'name phone email');

  if (!purchase) {
    throw new AppError('Purchase record not found', 404);
  }
  return purchase;
};

const generatePurchaseNumber = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `M20-PUR-${dateStr}-${randomHex}`;
};

const createPurchase = async (data, userId) => {
  const {
    supplier,
    invoiceNumber,
    purchaseDate,
    items,
    paymentAccountId,
    paymentAccount,
    paymentStatus = 'paid',
    shippingFee = 0,
    transportCost = 0,
    taxFee = 0,
    attachmentUrl,
    notes
  } = data;

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Purchase invoice must contain at least one purchased item', 400);
  }

  const extraAcquisitionCosts = (Number(shippingFee) || 0) + (Number(transportCost) || 0) + (Number(taxFee) || 0);

  // Calculate base total items cost to apportion extra acquisition costs proportionally
  const baseItemsTotal = items.reduce((sum, item) => {
    const itemQty = Number(item.quantity ?? item.quantityGrams) || 0;
    const itemCost = Number(item.totalCost) || (itemQty * (Number(item.unitCost) || 0));
    return sum + itemCost;
  }, 0);

  let totalAmount = 0;
  const processedItems = [];

  for (const item of items) {
    let rawMaterial = null;

    if (item.rawMaterial) {
      rawMaterial = await RawMaterial.findById(item.rawMaterial);
    }
    
    if (!rawMaterial && item.rawMaterialName) {
      // Find or create by name
      rawMaterial = await RawMaterial.findOne({ name: item.rawMaterialName.trim() });
      if (!rawMaterial) {
        rawMaterial = await RawMaterial.create({
          name: item.rawMaterialName.trim(),
          category: item.category || 'fragrance_oil',
          unit: item.unit || 'gram',
          currentStock: 0,
          costPerGram: 0,
          supplier: supplier || '',
          lowStockThreshold: Number(item.lowStockThreshold) || 100
        });
      }
    } else if (!rawMaterial && item.name) {
      rawMaterial = await RawMaterial.findOne({ name: item.name.trim() });
      if (!rawMaterial) {
        rawMaterial = await RawMaterial.create({
          name: item.name.trim(),
          category: item.category || 'fragrance_oil',
          unit: item.unit || 'gram',
          currentStock: 0,
          costPerGram: 0,
          supplier: supplier || '',
          lowStockThreshold: Number(item.lowStockThreshold) || 100
        });
      }
    }

    if (!rawMaterial) {
      throw new AppError(`Item material reference or name is missing.`, 400);
    }

    const qty = Number(item.quantity ?? item.quantityGrams);
    let itemBaseCost = Number(item.totalCost);
    if (isNaN(itemBaseCost) || itemBaseCost <= 0) {
      itemBaseCost = qty * (Number(item.unitCost) || 0);
    }

    if (!qty || qty <= 0) {
      throw new AppError(`Invalid quantity for ${rawMaterial.name}. Must be greater than 0.`, 400);
    }

    // Apportion extra transport/acquisition cost proportionally
    const costRatio = baseItemsTotal > 0 ? itemBaseCost / baseItemsTotal : 1 / items.length;
    const itemTransportShare = extraAcquisitionCosts * costRatio;
    const itemEffectiveTotalCost = itemBaseCost + itemTransportShare;
    const unitCost = itemEffectiveTotalCost / qty;

    totalAmount += itemEffectiveTotalCost;

    const previousStock = rawMaterial.currentStock || 0;
    const previousCostPerGram = rawMaterial.costPerGram || 0;

    // Weighted Average Unit Cost Formula:
    // (PreviousStock * PreviousCost + NewQty * NewCost) / (PreviousStock + NewQty)
    let newWeightedCost = unitCost;
    const newTotalStock = previousStock + qty;

    if (newTotalStock > 0) {
      const previousTotalValue = previousStock * previousCostPerGram;
      newWeightedCost = Number(((previousTotalValue + itemEffectiveTotalCost) / newTotalStock).toFixed(4));
    }

    // Update raw material inventory and weighted average cost
    rawMaterial.currentStock = newTotalStock;
    rawMaterial.costPerGram = newWeightedCost;
    if (supplier && !rawMaterial.supplier) rawMaterial.supplier = supplier.trim();
    await rawMaterial.save();

    processedItems.push({
      rawMaterial: rawMaterial._id,
      rawMaterialName: rawMaterial.name,
      quantity: qty,
      quantityGrams: qty,
      unit: rawMaterial.unit || item.unit || 'gram',
      unitCost: Number(unitCost.toFixed(4)),
      totalCost: Number(itemEffectiveTotalCost.toFixed(2)),
      costPerGram: Number(unitCost.toFixed(4)),
      previousStock,
      previousCostPerGram,
      newWeightedCostPerGram: newWeightedCost
    });

    // Record Stock Movement
    await StockMovement.create({
      itemType: 'RawMaterial',
      rawMaterial: rawMaterial._id,
      itemName: rawMaterial.name,
      movementType: 'PURCHASE',
      quantityBefore: previousStock,
      quantityChange: qty,
      quantityAfter: newTotalStock,
      unit: rawMaterial.unit || 'gram',
      unitCost: unitCost,
      totalValue: itemEffectiveTotalCost,
      reason: `Purchased from ${supplier || 'supplier'} (Invoice: ${invoiceNumber || 'N/A'})${extraAcquisitionCosts > 0 ? ` incl. transport share: ${itemTransportShare.toFixed(2)}` : ''}`,
      referenceType: 'Purchase',
      createdBy: userId
    });
  }

  // Handle cash/payment account deduction if marked as paid
  const accountId = paymentAccountId || paymentAccount;
  let paymentAccountDoc = null;
  const isPaid = (paymentStatus || 'paid').toLowerCase() === 'paid';

  if (isPaid && accountId) {
    paymentAccountDoc = await CashAccount.findById(accountId);
    if (paymentAccountDoc) {
      paymentAccountDoc.balance -= totalAmount;
      paymentAccountDoc.transactions.push({
        type: 'PURCHASE',
        amount: -totalAmount,
        balanceAfter: paymentAccountDoc.balance,
        description: `Raw material purchase from ${supplier || 'supplier'} (Invoice: ${invoiceNumber || 'N/A'})`,
        date: purchaseDate || new Date(),
        createdBy: userId
      });
      await paymentAccountDoc.save();
    }
  }

  const purchaseNumber = await generatePurchaseNumber();

  const purchase = await Purchase.create({
    purchaseNumber,
    supplier: supplier || '',
    invoiceNumber: invoiceNumber || '',
    purchaseDate: purchaseDate || new Date(),
    items: processedItems,
    totalAmount: Number(totalAmount.toFixed(2)),
    paymentStatus: isPaid ? 'paid' : 'unpaid',
    paymentAccount: paymentAccountDoc ? paymentAccountDoc._id : null,
    paymentAccountName: paymentAccountDoc ? paymentAccountDoc.name : '',
    attachmentUrl: attachmentUrl || null,
    isInventoryApplied: true,
    notes: notes || '',
    createdBy: userId
  });

  return purchase;
};

const updatePurchase = async (id, data, userId) => {
  const purchase = await Purchase.findById(id);
  if (!purchase) {
    throw new AppError('Purchase not found', 404);
  }

  // Revert previous stock changes
  if (purchase.isInventoryApplied && Array.isArray(purchase.items)) {
    for (const oldItem of purchase.items) {
      const mat = await RawMaterial.findById(oldItem.rawMaterial);
      if (mat) {
        mat.currentStock = Math.max(0, (mat.currentStock || 0) - (oldItem.quantity || oldItem.quantityGrams || 0));
        await mat.save();
      }
    }
  }

  // Revert previous cash deduction if it was paid
  if (purchase.paymentStatus === 'paid' && purchase.paymentAccount) {
    const oldAccount = await CashAccount.findById(purchase.paymentAccount);
    if (oldAccount) {
      oldAccount.balance += purchase.totalAmount;
      oldAccount.transactions.push({
        type: 'MANUAL_ADJUSTMENT',
        amount: purchase.totalAmount,
        balanceAfter: oldAccount.balance,
        description: `Reversal of modified purchase ${purchase.purchaseNumber}`,
        date: new Date(),
        createdBy: userId
      });
      await oldAccount.save();
    }
  }

  // Now apply updated items and calculate
  const {
    supplier = purchase.supplier,
    invoiceNumber = purchase.invoiceNumber,
    purchaseDate = purchase.purchaseDate,
    items = purchase.items,
    paymentAccountId = purchase.paymentAccount,
    paymentAccount = purchase.paymentAccount,
    paymentStatus = purchase.paymentStatus,
    attachmentUrl = purchase.attachmentUrl,
    notes = purchase.notes
  } = data;

  const processedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    let rawMaterial = null;
    if (item.rawMaterial) rawMaterial = await RawMaterial.findById(item.rawMaterial);
    if (!rawMaterial && item.rawMaterialName) rawMaterial = await RawMaterial.findOne({ name: item.rawMaterialName.trim() });

    if (!rawMaterial) continue;

    const qty = Number(item.quantity ?? item.quantityGrams);
    const itemCost = Number(item.totalCost) || (qty * (Number(item.unitCost) || 0));
    const unitCost = qty > 0 ? itemCost / qty : 0;
    totalAmount += itemCost;

    const prevStock = rawMaterial.currentStock || 0;
    const newStock = prevStock + qty;
    let newWeightedCost = unitCost;
    if (newStock > 0) {
      newWeightedCost = Number((((prevStock * (rawMaterial.costPerGram || 0)) + itemCost) / newStock).toFixed(4));
    }

    rawMaterial.currentStock = newStock;
    rawMaterial.costPerGram = newWeightedCost;
    await rawMaterial.save();

    processedItems.push({
      rawMaterial: rawMaterial._id,
      rawMaterialName: rawMaterial.name,
      quantity: qty,
      quantityGrams: qty,
      unit: rawMaterial.unit || 'gram',
      unitCost,
      totalCost: itemCost,
      costPerGram: unitCost,
      previousStock: prevStock,
      newWeightedCostPerGram: newWeightedCost
    });

    await StockMovement.create({
      itemType: 'RawMaterial',
      rawMaterial: rawMaterial._id,
      itemName: rawMaterial.name,
      movementType: 'PURCHASE',
      quantityBefore: prevStock,
      quantityChange: qty,
      quantityAfter: newStock,
      unit: rawMaterial.unit || 'gram',
      unitCost,
      totalValue: itemCost,
      reason: `Updated purchase ${purchase.purchaseNumber}`,
      referenceType: 'Purchase',
      createdBy: userId
    });
  }

  // Handle new payment deduction
  const isPaid = (paymentStatus || 'paid').toLowerCase() === 'paid';
  const targetAccountId = paymentAccountId || paymentAccount;
  let newPaymentAccountDoc = null;

  if (isPaid && targetAccountId) {
    newPaymentAccountDoc = await CashAccount.findById(targetAccountId);
    if (newPaymentAccountDoc) {
      newPaymentAccountDoc.balance -= totalAmount;
      newPaymentAccountDoc.transactions.push({
        type: 'PURCHASE',
        amount: -totalAmount,
        balanceAfter: newPaymentAccountDoc.balance,
        description: `Raw material purchase update (Invoice: ${invoiceNumber || purchase.purchaseNumber})`,
        date: purchaseDate || new Date(),
        createdBy: userId
      });
      await newPaymentAccountDoc.save();
    }
  }

  purchase.supplier = supplier;
  purchase.invoiceNumber = invoiceNumber;
  purchase.purchaseDate = purchaseDate;
  purchase.items = processedItems;
  purchase.totalAmount = Number(totalAmount.toFixed(2));
  purchase.paymentStatus = isPaid ? 'paid' : 'unpaid';
  purchase.paymentAccount = newPaymentAccountDoc ? newPaymentAccountDoc._id : null;
  purchase.paymentAccountName = newPaymentAccountDoc ? newPaymentAccountDoc.name : '';
  purchase.attachmentUrl = attachmentUrl !== undefined ? attachmentUrl : purchase.attachmentUrl;
  purchase.notes = notes;
  await purchase.save();

  return purchase;
};

const deletePurchase = async (id, userId = null) => {
  const purchase = await Purchase.findById(id);
  if (!purchase) {
    throw new AppError('Purchase not found', 404);
  }

  // Revert stock changes
  if (purchase.isInventoryApplied && Array.isArray(purchase.items)) {
    for (const item of purchase.items) {
      const mat = await RawMaterial.findById(item.rawMaterial);
      if (mat) {
        mat.currentStock = Math.max(0, (mat.currentStock || 0) - (item.quantity || item.quantityGrams || 0));
        await mat.save();

        await StockMovement.create({
          itemType: 'RawMaterial',
          rawMaterial: mat._id,
          itemName: mat.name,
          movementType: 'MANUAL_ADJUSTMENT',
          quantityBefore: mat.currentStock + (item.quantity || 0),
          quantityChange: -(item.quantity || 0),
          quantityAfter: mat.currentStock,
          unit: mat.unit || 'gram',
          reason: `Reversal of deleted purchase ${purchase.purchaseNumber}`,
          referenceType: 'Purchase',
          createdBy: userId
        });
      }
    }
  }

  // Revert cash account balance if was deducted
  if (purchase.paymentStatus === 'paid' && purchase.paymentAccount) {
    const account = await CashAccount.findById(purchase.paymentAccount);
    if (account) {
      account.balance += purchase.totalAmount;
      account.transactions.push({
        type: 'MANUAL_ADJUSTMENT',
        amount: purchase.totalAmount,
        balanceAfter: account.balance,
        description: `Reversal of deleted purchase ${purchase.purchaseNumber}`,
        date: new Date(),
        createdBy: userId
      });
      await account.save();
    }
  }

  await Purchase.findByIdAndDelete(id);
  return { success: true };
};

module.exports = {
  getAllPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase
};
