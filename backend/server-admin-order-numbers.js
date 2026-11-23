function normalizeAdminOrderNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function isPaidOrderForAdminNumber(order = {}) {
  const paymentStatus = String(order.stripePaymentStatus || order.paymentStatus || '').trim().toLowerCase();
  const workflowStatus = String(order.status || '').trim().toLowerCase();
  return paymentStatus === 'paid' || workflowStatus === 'payment received' || workflowStatus === 'paid';
}

function buildAdminOrderNumberMap(rows = []) {
  const numbers = new Map();
  for (const row of rows) {
    const orderId = String(row?.order_id || row?.orderId || '').trim();
    const adminOrderNumber = normalizeAdminOrderNumber(row?.admin_order_number ?? row?.adminOrderNumber);
    if (orderId && adminOrderNumber !== null) numbers.set(orderId, adminOrderNumber);
  }
  return numbers;
}

function attachAdminOrderNumbers(orders = [], rows = []) {
  const numbers = buildAdminOrderNumberMap(rows);
  return orders.map((order) => {
    const adminOrderNumber = numbers.get(String(order?.id || '').trim());
    if (!isPaidOrderForAdminNumber(order) || adminOrderNumber === undefined) return order;
    return { ...order, adminOrderNumber };
  });
}

function buildAdminOrderNumberLine(adminOrderNumber) {
  const number = normalizeAdminOrderNumber(adminOrderNumber);
  if (number === null) throw new Error('A database-assigned admin order number is required.');
  return `\u0e40\u0e25\u0e02\u0e2d\u0e2d\u0e40\u0e14\u0e2d\u0e23\u0e4c: ${number}`;
}

module.exports = {
  attachAdminOrderNumbers,
  buildAdminOrderNumberLine,
  buildAdminOrderNumberMap,
  isPaidOrderForAdminNumber,
  normalizeAdminOrderNumber
};
