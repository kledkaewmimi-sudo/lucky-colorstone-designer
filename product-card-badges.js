const BUILTIN_BANNER_PRESETS = Object.freeze({
  new: Object.freeze({
    id: 'new',
    label: 'ใหม่',
    variant: 'new',
    textColor: '#644aa8',
    backgroundColor: '#eee8ff'
  }),
  bestseller: Object.freeze({
    id: 'bestseller',
    label: 'ขายดี✨',
    variant: 'bestseller',
    textColor: '#ffffff',
    backgroundColor: '#c8102e'
  })
});

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
    'green_jade:6': Object.freeze({ label: 'ใหม่', variant: 'new' }),
    'kyanite:10': Object.freeze({ label: 'ใหม่', variant: 'new' }),
    'phase27-freshwater-pearl:10': Object.freeze({ label: 'ใหม่', variant: 'new' })
  }),
  charms: Object.freeze({
    cl01: Object.freeze({ label: 'ใหม่', variant: 'new' })
  }),
  spacers: Object.freeze({})
});

const BADGE_PRODUCT_TYPES = new Set(['stone', 'charm', 'spacer']);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const CUSTOM_PRESET_ID_PATTERN = /^custom_[a-z0-9_-]{1,48}$/i;

function normalizeBadgeProductType(productType) {
  const normalized = String(productType || '').trim().toLowerCase().replace(/s$/, '');
  return BADGE_PRODUCT_TYPES.has(normalized) ? normalized : '';
}

function normalizeBannerColor(value, fallback = '') {
  const normalized = String(value || '').trim();
  return HEX_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : fallback;
}

function normalizeCustomBannerPresets(records = []) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  return records.reduce((presets, record) => {
    if (!record || typeof record !== 'object') return presets;
    const id = String(record.id || '').trim();
    const label = String(record.label || '').trim().slice(0, 24);
    const textColor = normalizeBannerColor(record.textColor);
    const backgroundColor = normalizeBannerColor(record.backgroundColor);
    if (!CUSTOM_PRESET_ID_PATTERN.test(id) || !label || !textColor || !backgroundColor || seen.has(id)) {
      return presets;
    }
    seen.add(id);
    presets.push(Object.freeze({
      id,
      label,
      variant: 'custom',
      textColor,
      backgroundColor
    }));
    return presets;
  }, []);
}

function getBadgePresetCatalog(settings = null) {
  return [
    ...Object.values(BUILTIN_BANNER_PRESETS),
    ...normalizeCustomBannerPresets(settings?.catalogBadgePresets)
  ];
}

function getBadgeAssignmentKey(productType, productId) {
  const normalizedType = normalizeBadgeProductType(productType);
  const normalizedId = String(productId || '').trim();
  return normalizedType && normalizedId ? `${normalizedType}:${normalizedId}` : '';
}

function normalizeBadgeAssignments(assignments = {}) {
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) return {};
  return Object.entries(assignments).reduce((normalized, [key, value]) => {
    const [productType, ...idParts] = String(key || '').split(':');
    const normalizedKey = getBadgeAssignmentKey(productType, idParts.join(':'));
    const presetId = String(value || '').trim();
    if (normalizedKey && presetId) normalized[normalizedKey] = presetId;
    return normalized;
  }, {});
}

function toProductCardBadge(preset) {
  if (!preset) return null;
  return {
    label: preset.label,
    variant: preset.variant,
    textColor: preset.textColor,
    backgroundColor: preset.backgroundColor
  };
}

function getProductCardBadge(productType, productId, sizeMm = null, settings = null) {
  const normalizedType = normalizeBadgeProductType(productType);
  const normalizedId = String(productId || '').trim();
  const assignmentKey = getBadgeAssignmentKey(normalizedType, normalizedId);
  const assignments = settings?.catalogItemBadges;

  if (assignmentKey && assignments && typeof assignments === 'object' && Object.hasOwn(assignments, assignmentKey)) {
    const presetId = String(assignments[assignmentKey] || '').trim();
    if (!presetId || presetId === 'none') return null;
    const preset = getBadgePresetCatalog(settings).find((entry) => entry.id === presetId);
    return toProductCardBadge(preset);
  }

  const pluralType = `${normalizedType}s`;
  const key = normalizedType === 'stone' ? `${productId}:${Number(sizeMm)}` : productId;
  const legacyBadge = PRODUCT_CARD_BADGES[pluralType]?.[key] || null;
  if (!legacyBadge) return null;
  return toProductCardBadge(
    Object.values(BUILTIN_BANNER_PRESETS).find((entry) => entry.variant === legacyBadge.variant)
      || { ...legacyBadge, variant: legacyBadge.variant }
  );
}

export {
  BUILTIN_BANNER_PRESETS,
  PRODUCT_CARD_BADGES,
  getBadgeAssignmentKey,
  getBadgePresetCatalog,
  getProductCardBadge,
  normalizeBadgeAssignments,
  normalizeBannerColor,
  normalizeCustomBannerPresets
};
