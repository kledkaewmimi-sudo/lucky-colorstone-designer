function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asBoolean(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function resolveCrmOrderPreviewSource(order = {}) {
  const checkoutSummary = order.checkoutSummary && typeof order.checkoutSummary === 'object' ? order.checkoutSummary : {};
  const candidates = [
    order.braceletPreviewImage,
    order.braceletPreviewDataUrl,
    order.braceletPreviewSnapshot,
    checkoutSummary.braceletPreviewImage,
    checkoutSummary.braceletPreviewDataUrl,
    checkoutSummary.braceletPreviewSnapshot
  ];
  // Mirrors getOrderFinalBraceletPreviewImage in crm-order-details.js exactly.
  return candidates.find((value) => typeof value === 'string' && value.startsWith('data:image/')) || '';
}

function toCompactCostSnapshot(order = {}) {
  const snapshot = order.costSnapshot && typeof order.costSnapshot === 'object' ? order.costSnapshot : {};
  return {
    status: snapshot.status || order.costSnapshotStatus || 'unavailable',
    materialCost: snapshot.materialCost ?? order.costSnapshotMaterialCost ?? null,
    deliveryCost: snapshot.deliveryCost ?? order.costSnapshotDeliveryCost ?? null,
    totalCost: snapshot.totalCost ?? order.costSnapshotTotalCost ?? null,
    profit: snapshot.profit ?? order.costSnapshotProfit ?? null,
    marginPercent: snapshot.marginPercent ?? order.costSnapshotMarginPercent ?? null
  };
}

function isCrmPaidOrder(order = {}) {
  return String(order.stripePaymentStatus || order.paymentStatus || '').trim().toLowerCase() === 'paid';
}

function getCrmOrderTotal(order = {}) {
  return asNumber(
    order.checkoutSummary?.totalPrice
    ?? order.checkoutSummary?.finalPrice
    ?? order.checkoutSummary?.netPrice
    ?? order.totalPrice
    ?? order.finalPrice
    ?? order.netPrice
  );
}

function sortCrmOrders(orders = []) {
  return [...orders].sort((left, right) => {
    const rightDate = Date.parse(right.date || right.createdAt || right.created_at || 0) || 0;
    const leftDate = Date.parse(left.date || left.createdAt || left.created_at || 0) || 0;
    if (rightDate !== leftDate) return rightDate - leftDate;
    return String(right.id || '').localeCompare(String(left.id || ''));
  });
}

function toCrmOrderSummary(order = {}) {
  const checkoutSummary = order.checkoutSummary || {};
  return {
    id: String(order.id || ''),
    date: order.date || null,
    createdAt: order.createdAt || order.created_at || null,
    status: order.status || 'New Order',
    customerName: order.customerName || '',
    stripePaymentStatus: order.stripePaymentStatus || '',
    paymentStatus: order.paymentStatus || '',
    wristSize: asNumber(order.wristSize),
    beadSize: order.beadSize || '',
    totalBeads: asNumber(order.totalBeads),
    hasCharm: asBoolean(order.hasCharm),
    charmNameTh: order.charmNameTh || '',
    charmNameEn: order.charmNameEn || '',
    charmSku: order.charmSku || '',
    charmSizeCm: asNumber(order.charmSizeCm),
    hasSpacer: asBoolean(order.hasSpacer),
    spacerCount: asNumber(order.spacerCount),
    // The Order card must use the exact immutable preview source displayed in View Detail.
    braceletPreviewImage: resolveCrmOrderPreviewSource(order),
    costSnapshot: toCompactCostSnapshot(order),
    subtotal: asNumber(checkoutSummary.subtotal ?? order.subtotal),
    discountPercent: asNumber(checkoutSummary.discountPercent ?? order.discountPercent),
    discountAmount: asNumber(checkoutSummary.discountAmount ?? order.discountAmount),
    totalPrice: getCrmOrderTotal(order),
    adminOrderNumber: order.adminOrderNumber ?? null
  };
}

function toCrmOverviewOrderSummary(order = {}) {
  const summary = toCrmOrderSummary(order);
  // Overview must never carry stored preview blobs; only the paginated Orders
  // list needs the exact View Detail source.
  delete summary.braceletPreviewImage;
  return summary;
}

function buildCrmOverview(orders = []) {
  const paidOrders = sortCrmOrders(orders.filter(isCrmPaidOrder));
  return {
    paidOrderCount: paidOrders.length,
    revenue: paidOrders.reduce((sum, order) => sum + getCrmOrderTotal(order), 0),
    recentOrders: paidOrders.slice(0, 4).map(toCrmOverviewOrderSummary)
  };
}

function paginateCrmOrders(orders = [], page = 1, limit = 20) {
  const safePage = Math.max(1, Math.trunc(Number(page) || 1));
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 20)));
  const paidOrders = sortCrmOrders(orders.filter(isCrmPaidOrder));
  const total = paidOrders.length;
  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    orders: paidOrders.slice((safePage - 1) * safeLimit, safePage * safeLimit).map(toCrmOrderSummary)
  };
}

module.exports = {
  resolveCrmOrderPreviewSource,
  toCompactCostSnapshot,
  isCrmPaidOrder,
  getCrmOrderTotal,
  sortCrmOrders,
  toCrmOrderSummary,
  toCrmOverviewOrderSummary,
  buildCrmOverview,
  paginateCrmOrders
};
