const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Product = require('../modules/products/product.model');
const Formula = require('../modules/formulas/formula.model');
const RawMaterial = require('../modules/inventory/rawMaterial.model');
const BatchService = require('../modules/batches/batch.service');
const OrderService = require('../modules/orders/order.service');
const Order = require('../modules/orders/order.model');
const { getBottleSpec, getNetBottleBreakdowns, calculateCumulativeScale, calculateBottleOrderPrep } = require('../utils/helpers/manufacturing');

async function runVerification() {
  console.log('=== STARTING M20 MANUFACTURING & FULFILLMENT VERIFICATION ===\n');
  await connectDB();

  // 1. Verify Bottle Net Weights & Densities
  console.log('--- 1. BOTTLE NET WEIGHTS & CONSTANTS ---');
  const spec30 = getBottleSpec('30ml');
  const spec50 = getBottleSpec('50ml');
  const spec100 = getBottleSpec('100ml');

  console.log('30ml:', spec30);
  console.log('50ml:', spec50);
  console.log('100ml:', spec100);

  if (spec30.netLiquidWeightGrams !== 25.0 || spec30.totalPrepWeightGrams !== 26.0) {
    throw new Error('30ml bottle spec mismatch!');
  }
  if (spec50.netLiquidWeightGrams !== 43.0 || spec50.totalPrepWeightGrams !== 44.0) {
    throw new Error('50ml bottle spec mismatch!');
  }
  if (spec100.netLiquidWeightGrams !== 78.0 || spec100.totalPrepWeightGrams !== 79.0) {
    throw new Error('100ml bottle spec mismatch!');
  }
  console.log('✓ Bottle specs match official M20 specs (25+1g, 43+1g, 78+1g).\n');

  // 2. Verify 6 Core Fragrance BOM Recipes
  console.log('--- 2. CORE FRAGRANCE BOM RECIPES ---');
  const expectedFormulas = {
    CRUSH: { oil: 22, alc: 78 },
    CROWN: { oil: 25, alc: 75 },
    NIGHT: { oil: 22, alc: 78 },
    BLOOM: { oil: 20, alc: 80 },
    CHERRY: { oil: 25, alc: 75 },
    CLOUD: { oil: 25, alc: 75 }
  };

  for (const [name, expected] of Object.entries(expectedFormulas)) {
    const prod = await Product.findOne({ name: new RegExp(name, 'i') });
    if (!prod) throw new Error(`Product ${name} not found!`);
    const formula = await Formula.findOne({ fragrance: prod._id, active: true });
    if (!formula) throw new Error(`Formula for ${name} not found!`);

    console.log(`Fragrance ${name}: Oil ${formula.oilPercentage}%, Alcohol ${formula.alcoholPercentage}%`);
    if (formula.oilPercentage !== expected.oil) {
      throw new Error(`Fragrance ${name} oil mismatch: got ${formula.oilPercentage}, expected ${expected.oil}`);
    }

    // Verify net breakdowns per bottle
    const breakdowns = getNetBottleBreakdowns(formula.oilPercentage / 100);
    console.log(`  30ml breakdown:  oil=${breakdowns['30ml'].oilGrams}g, alc=${breakdowns['30ml'].alcoholGrams}g`);
    console.log(`  50ml breakdown:  oil=${breakdowns['50ml'].oilGrams}g, alc=${breakdowns['50ml'].alcoholGrams}g`);
    console.log(`  100ml breakdown: oil=${breakdowns['100ml'].oilGrams}g, alc=${breakdowns['100ml'].alcoholGrams}g`);
  }
  console.log('✓ All 6 core recipes verified.\n');

  // 3. Verify Batch Preview & Cumulative Scale Calculation
  console.log('--- 3. CUMULATIVE SCALE & BATCH PREVIEW ---');
  const crushProd = await Product.findOne({ name: /CRUSH/i });
  const previewBulk = await BatchService.previewBatchCalculation({
    productId: crushProd._id,
    productionMode: 'bulk_weight',
    finalBatchWeight: 1000
  });

  console.log('CRUSH 1000g Bulk Batch:');
  console.log('  Required Oil:', previewBulk.fragranceOilWeight, 'g (Scale Step 1: 0.00g ->', previewBulk.scaleReadings.scaleStep1ReadingGrams, 'g)');
  console.log('  Required Alcohol:', previewBulk.alcoholWeight, 'g (Scale Step 2: ->', previewBulk.scaleReadings.scaleStep2ReadingGrams, 'g)');
  console.log('  Alcohol Volume:', previewBulk.scaleReadings.alcoholLiters, 'L (', previewBulk.scaleReadings.alcoholMl, 'ml)');

  if (previewBulk.fragranceOilWeight !== 220 || previewBulk.alcoholWeight !== 780) {
    throw new Error('CRUSH 1000g calculations incorrect!');
  }
  if (previewBulk.scaleReadings.scaleStep1ReadingGrams !== 220 || previewBulk.scaleReadings.scaleStep2ReadingGrams !== 1000) {
    throw new Error('Scale cumulative reading mismatch!');
  }

  // Bottle count order preview
  const previewBottles = await BatchService.previewBatchCalculation({
    productId: crushProd._id,
    productionMode: 'bottle_count',
    bottleCounts: { '30ml': 10, '50ml': 10, '100ml': 10 }
  });
  // 10*26g + 10*44g + 10*79g = 260 + 440 + 790 = 1490g prep weight!
  // Net liquid: 10*25 + 10*43 + 10*78 = 250 + 430 + 780 = 1460g net usable!
  console.log('\nCRUSH Bottle Order (10x30ml, 10x50ml, 10x100ml):');
  console.log('  Total Prep Weight:', previewBottles.batchWeight, 'g');
  console.log('  Net Usable Weight:', previewBottles.netUsableWeightGrams, 'g');
  console.log('  Required Oil:', previewBottles.fragranceOilWeight, 'g');
  console.log('  Required Alcohol:', previewBottles.alcoholWeight, 'g');

  if (previewBottles.batchWeight !== 1490 || previewBottles.netUsableWeightGrams !== 1460) {
    throw new Error(`Bottle order prep mismatch: got prep=${previewBottles.batchWeight}, net=${previewBottles.netUsableWeightGrams}`);
  }
  console.log('✓ Cumulative scale & bottle order calculation verified.\n');

  // 4. Verify Batch Creation & Crediting to Finished Liquid
  console.log('--- 4. BATCH CREATION & FINISHED LIQUID CREDITING ---');
  const prevCrushLiquid = crushProd.finishedLiquidGrams || 0;
  console.log('CRUSH current finished liquid:', prevCrushLiquid, 'g');

  const createdBatch = await BatchService.createAndConfirmBatch({
    productId: crushProd._id,
    productionMode: 'bottle_count',
    bottleCounts: { '30ml': 2, '50ml': 2 }
    // 2*26g + 2*44g = 52 + 88 = 140g prep weight.
    // Net usable = 2*25 + 2*43 = 50 + 86 = 136g net liquid.
  }, null);

  const updatedCrush = await Product.findById(crushProd._id);
  console.log('Created Batch #', createdBatch.batchNumber, 'Prep weight:', createdBatch.finalBatchWeight, 'g, Net:', createdBatch.netUsableWeightGrams, 'g');
  console.log('CRUSH new finished liquid:', updatedCrush.finishedLiquidGrams, 'g (Expected increase:', createdBatch.netUsableWeightGrams, 'g)');

  if (updatedCrush.finishedLiquidGrams !== prevCrushLiquid + createdBatch.netUsableWeightGrams) {
    throw new Error('Finished liquid crediting mismatch!');
  }
  console.log('✓ Batch successfully added net liquid to Finished Liquid Inventory.\n');

  // 5. Verify Order Fulfillment Deductions (Finished Liquid & Packaging)
  console.log('--- 5. ORDER FULFILLMENT DEDUCTION & RESTOCKING ---');
  const bottle50 = await RawMaterial.findOne({ category: 'bottle', name: /50ml/i });
  const sticker50 = await RawMaterial.findOne({ category: 'sticker', name: /50ml/i });
  const box50 = await RawMaterial.findOne({ category: 'box', name: /50ml/i });

  const prevBottleStock = bottle50.currentStock;
  const prevStickerStock = sticker50.currentStock;
  const prevBoxStock = box50.currentStock;
  const prevLiquidStock = updatedCrush.finishedLiquidGrams;

  console.log('Before Order:');
  console.log('  50ml Bottles:', prevBottleStock);
  console.log('  50ml Stickers:', prevStickerStock);
  console.log('  50ml Boxes:', prevBoxStock);
  console.log('  Finished Liquid:', prevLiquidStock, 'g');

  // Create an order for 2 units of 50ml CRUSH
  // Liquid to deduct: 2 * 44g = 88g
  // Packaging to deduct: 2 bottles, 2 stickers, 2 boxes
  const testOrder = await OrderService.createOrder(null, {
    customerName: 'Manufacturing Test Customer',
    customerPhone: '01012345678',
    deliveryMethod: 'home_delivery',
    shippingAddress: {
      governorate: 'Cairo',
      city: 'Nasr City',
      addressDetails: 'Test Street 10'
    },
    items: [
      {
        productId: crushProd._id,
        size: '50ml',
        quantity: 2
      }
    ]
  });

  console.log('Created Test Order #', testOrder.orderNumber);
  console.log('  Order Liquid Consumed:', testOrder.items[0].liquidGramsConsumed, 'g (Expected: 88g)');

  const afterBottle = await RawMaterial.findById(bottle50._id);
  const afterSticker = await RawMaterial.findById(sticker50._id);
  const afterBox = await RawMaterial.findById(box50._id);
  const afterCrush = await Product.findById(crushProd._id);

  console.log('After Order:');
  console.log('  50ml Bottles:', afterBottle.currentStock, '(Deducted:', prevBottleStock - afterBottle.currentStock, ')');
  console.log('  50ml Stickers:', afterSticker.currentStock, '(Deducted:', prevStickerStock - afterSticker.currentStock, ')');
  console.log('  50ml Boxes:', afterBox.currentStock, '(Deducted:', prevBoxStock - afterBox.currentStock, ')');
  console.log('  Finished Liquid:', afterCrush.finishedLiquidGrams, 'g (Deducted:', prevLiquidStock - afterCrush.finishedLiquidGrams, 'g)');

  if (testOrder.items[0].liquidGramsConsumed !== 88.0) {
    throw new Error('Order liquid grams consumed must be exactly 88g (2 * 44g)!');
  }
  if (prevBottleStock - afterBottle.currentStock !== 2) {
    throw new Error('Bottle stock not deducted by 2!');
  }
  if (prevStickerStock - afterSticker.currentStock !== 2) {
    throw new Error('Sticker stock not deducted by 2!');
  }
  if (prevBoxStock - afterBox.currentStock !== 2) {
    throw new Error('Box stock not deducted by 2!');
  }
  if (prevLiquidStock - afterCrush.finishedLiquidGrams !== 88.0) {
    throw new Error('Liquid stock not deducted by 88g!');
  }
  console.log('✓ Order fulfillment deducted exact liquid grams + packaging materials.');

  // Test Order Cancellation & Restocking
  console.log('\n--- 6. ORDER CANCELLATION & RESTOCKING ---');
  await OrderService.updateOrderStatus(testOrder._id, {
    orderStatus: 'cancelled',
    notes: 'Test cancellation to verify inventory reversal'
  });

  const restockedBottle = await RawMaterial.findById(bottle50._id);
  const restockedSticker = await RawMaterial.findById(sticker50._id);
  const restockedBox = await RawMaterial.findById(box50._id);
  const restockedCrush = await Product.findById(crushProd._id);

  console.log('After Cancellation:');
  console.log('  50ml Bottles:', restockedBottle.currentStock, '(Expected:', prevBottleStock, ')');
  console.log('  50ml Stickers:', restockedSticker.currentStock, '(Expected:', prevStickerStock, ')');
  console.log('  50ml Boxes:', restockedBox.currentStock, '(Expected:', prevBoxStock, ')');
  console.log('  Finished Liquid:', restockedCrush.finishedLiquidGrams, 'g (Expected:', prevLiquidStock, 'g)');

  if (restockedBottle.currentStock !== prevBottleStock) throw new Error('Bottle not restocked!');
  if (restockedSticker.currentStock !== prevStickerStock) throw new Error('Sticker not restocked!');
  if (restockedBox.currentStock !== prevBoxStock) throw new Error('Box not restocked!');
  if (restockedCrush.finishedLiquidGrams !== prevLiquidStock) throw new Error('Liquid not restocked!');
  console.log('✓ Order cancellation restored both finished liquid and packaging materials.');

  // Clean up test order
  await Order.findByIdAndDelete(testOrder._id);
  console.log('Cleaned up test order record.');

  console.log('\n=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
