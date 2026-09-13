const PRODUCT_CARD_BADGES = Object.freeze({
  stones: Object.freeze({
    'golden_rutile:10': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'moonstone:10': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'carnelian:10': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'amethyst:6': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'cherry_quartz:6': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'lapis_lazuli:6': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'golden_rutile:4': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'tigers_eye:4': Object.freeze({ label: 'ขายดี✨', variant: 'bestseller' }),
    'green_jade:6': Object.freeze({ label: 'ใหม่', variant: 'new' })
  }),
  charms: Object.freeze({
    cl01: Object.freeze({ label: 'ใหม่', variant: 'new' })
  })
});

function getProductCardBadge(productType, productId, sizeMm = null) {
  const key = productType === 'stones' ? `${productId}:${Number(sizeMm)}` : productId;
  return PRODUCT_CARD_BADGES[productType]?.[key] || null;
}

export { PRODUCT_CARD_BADGES, getProductCardBadge };