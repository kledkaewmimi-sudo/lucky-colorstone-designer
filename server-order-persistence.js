const fs = require('node:fs');

function readOrderPayloads(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
    const parsed = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrderPayload(filePath, order, getOrderId) {
  const orders = readOrderPayloads(filePath);
  const orderId = getOrderId(order);
  const index = orders.findIndex((entry) => getOrderId(entry) === orderId);
  if (index >= 0) orders[index] = order;
  else orders.unshift(order);
  fs.writeFileSync(filePath, JSON.stringify(orders, null, 2), 'utf8');
  return order;
}

module.exports = { readOrderPayloads, saveOrderPayload };
