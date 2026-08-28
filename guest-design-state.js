// Guest-design persistence is intentionally isolated from the normal application state.
// It is dormant until a future, feature-flagged LINE handoff flow explicitly calls it.

import { MIXED_BEAD_SIZE_MODE, normalizeMixedPlacingSize } from './mixed-size-state.js';

export const GUEST_DESIGN_SNAPSHOT_STORAGE_KEY = 'lucky_colorstone_guest_design_snapshot';
export const GUEST_DESIGN_SNAPSHOT_VERSION = 1;
export const GUEST_DESIGN_SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000;

const ALLOWED_STEPS = new Set([1, 2, 3]);
const ALLOWED_COMPONENT_TYPES = new Set(['empty', 'stone', 'charm', 'spacer']);
const MAX_COMPONENTS = 240;
const MAX_CHARM_IDS = 2;
const MAX_ID_LENGTH = 120;
const MAX_SERIALIZED_BYTES = 32 * 1024;

function failure(reason) {
  return { ok: false, reason };
}

function normalizeId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= MAX_ID_LENGTH ? id : '';
}

function normalizeWristSize(value) {
  const size = Number(value);
  return Number.isFinite(size) && size >= 14 && size <= 20 && Math.round(size * 2) === size * 2
    ? size
    : null;
}

function normalizeBeadSize(value) {
  const beadSize = String(value || '').trim();
  return beadSize === MIXED_BEAD_SIZE_MODE || ['4', '6', '10'].includes(beadSize) ? beadSize : '';
}

function normalizeCanonicalComponent(component, beadSize) {
  if (component === null) return { type: 'empty' };
  if (!component || typeof component !== 'object') return null;
  const type = String(component.type || component.componentType || '').trim().toLowerCase();
  if (!ALLOWED_COMPONENT_TYPES.has(type)) return null;
  if (type === 'empty') return { type };

  const id = normalizeId(
    type === 'stone' ? component.id || component.stoneId
      : type === 'charm' ? component.id || component.charmId
        : component.id || component.spacerId
  );
  if (!id) return null;
  if (type !== 'stone') return { type, id };

  const fallbackSize = beadSize === MIXED_BEAD_SIZE_MODE ? '' : beadSize;
  const size = String(component.size ?? component.sizeMm ?? fallbackSize).trim();
  if (!['4', '6', '10'].includes(size)) return null;
  return { type, id, size: Number(size) };
}

function normalizeCanonicalDesign(input = {}) {
  const wristSize = normalizeWristSize(input.wristSize);
  const beadSize = normalizeBeadSize(input.beadSize);
  const rawComponents = Array.isArray(input.components)
    ? input.components
    : Array.isArray(input.selectedStones)
      ? input.selectedStones
      : null;
  if (wristSize === null || !beadSize || !rawComponents || rawComponents.length > MAX_COMPONENTS) return null;

  const components = rawComponents.map((component) => normalizeCanonicalComponent(component, beadSize));
  if (components.some((component) => component === null)) return null;

  const selectedCharmIds = Array.isArray(input.selectedCharmIds) ? input.selectedCharmIds : [];
  if (selectedCharmIds.length > MAX_CHARM_IDS) return null;
  const normalizedCharmIds = selectedCharmIds.map(normalizeId);
  if (normalizedCharmIds.some((id) => !id)) return null;

  return {
    wristSize,
    beadSize,
    mixedPlacingSize: normalizeMixedPlacingSize(input.mixedPlacingSize, beadSize === MIXED_BEAD_SIZE_MODE ? '6' : beadSize),
    selectedCharmIds: normalizedCharmIds,
    components
  };
}

export function createGuestDesignSnapshot(state = {}, { now = Date.now(), ttlMs = GUEST_DESIGN_SNAPSHOT_TTL_MS } = {}) {
  const savedAt = Number(now);
  const step = Number(state.currentStep ?? state.step ?? 3);
  const design = normalizeCanonicalDesign(state);
  if (!Number.isFinite(savedAt) || !ALLOWED_STEPS.has(step) || !design) return null;

  return {
    version: GUEST_DESIGN_SNAPSHOT_VERSION,
    savedAt,
    expiresAt: savedAt + ttlMs,
    step,
    design
  };
}

export function serializeGuestDesignSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const serialized = JSON.stringify(snapshot);
  return new TextEncoder().encode(serialized).length <= MAX_SERIALIZED_BYTES ? serialized : null;
}

export function parseGuestDesignSnapshot(rawSnapshot, { now = Date.now() } = {}) {
  if (typeof rawSnapshot !== 'string' || rawSnapshot.length === 0 || rawSnapshot.length > MAX_SERIALIZED_BYTES) {
    return failure('malformed');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawSnapshot);
  } catch {
    return failure('malformed');
  }

  if (!parsed || parsed.version !== GUEST_DESIGN_SNAPSHOT_VERSION) return failure('unsupported_version');
  const savedAt = Number(parsed.savedAt);
  const expiresAt = Number(parsed.expiresAt);
  const step = Number(parsed.step);
  const design = normalizeCanonicalDesign(parsed.design);
  if (!Number.isFinite(savedAt) || !Number.isFinite(expiresAt) || expiresAt <= savedAt || !ALLOWED_STEPS.has(step) || !design) {
    return failure('invalid');
  }
  if (Number(now) >= expiresAt) return failure('expired');

  return {
    ok: true,
    snapshot: {
      version: GUEST_DESIGN_SNAPSHOT_VERSION,
      savedAt,
      expiresAt,
      step,
      design
    }
  };
}

function catalogIds(source) {
  if (source == null) return null;
  const items = source instanceof Set ? [...source] : Array.isArray(source) ? source : [];
  return new Set(items.map((item) => normalizeId(typeof item === 'string' ? item : item?.id)).filter(Boolean));
}

export function reconcileGuestDesignSnapshot(snapshot, catalog = {}) {
  const parsed = typeof snapshot === 'string' ? parseGuestDesignSnapshot(snapshot) : { ok: true, snapshot };
  if (!parsed.ok) return parsed;
  const validated = createGuestDesignSnapshot({ ...parsed.snapshot.design, currentStep: parsed.snapshot.step }, {
    now: parsed.snapshot.savedAt,
    ttlMs: parsed.snapshot.expiresAt - parsed.snapshot.savedAt
  });
  if (!validated) return failure('invalid');

  const stoneIds = catalogIds(catalog.stones);
  const charmIds = catalogIds(catalog.charms);
  const spacerIds = catalogIds(catalog.spacers);
  const slotPlaceableCharmIds = catalogIds(catalog.slotPlaceableCharms);
  const skipped = [];
  const isKnown = (ids, id) => ids === null || ids.has(id);

  const components = validated.design.components.filter((component) => {
    if (component.type === 'empty') return true;
    const ids = component.type === 'stone' ? stoneIds : component.type === 'charm' ? charmIds : spacerIds;
    const isValidCharmPlacement = component.type !== 'charm' || slotPlaceableCharmIds === null || slotPlaceableCharmIds.has(component.id);
    const keep = isKnown(ids, component.id) && isValidCharmPlacement;
    if (!keep) skipped.push({ type: component.type, id: component.id });
    return keep;
  });
  const selectedCharmIds = validated.design.selectedCharmIds.filter((id) => {
    const keep = isKnown(charmIds, id);
    if (!keep) skipped.push({ type: 'anchored_charm', id });
    return keep;
  });

  return {
    ok: true,
    snapshot: {
      ...validated,
      design: { ...validated.design, components, selectedCharmIds }
    },
    skipped
  };
}

export function saveGuestDesignSnapshot(state, { storage = globalThis?.localStorage, now = Date.now() } = {}) {
  const snapshot = createGuestDesignSnapshot(state, { now });
  const serialized = serializeGuestDesignSnapshot(snapshot);
  if (!snapshot || !serialized) return failure('invalid');
  try {
    if (!storage?.setItem) return failure('storage_unavailable');
    storage.setItem(GUEST_DESIGN_SNAPSHOT_STORAGE_KEY, serialized);
    return { ok: true, snapshot, serialized };
  } catch {
    return failure('storage_unavailable');
  }
}

export function restoreGuestDesignSnapshot({ storage = globalThis?.localStorage, now = Date.now(), catalog = {} } = {}) {
  let rawSnapshot;
  try {
    if (!storage?.getItem) return failure('storage_unavailable');
    rawSnapshot = storage.getItem(GUEST_DESIGN_SNAPSHOT_STORAGE_KEY);
  } catch {
    return failure('storage_unavailable');
  }
  const parsed = parseGuestDesignSnapshot(rawSnapshot, { now });
  if (!parsed.ok) {
    if (['expired', 'malformed', 'unsupported_version', 'invalid'].includes(parsed.reason)) clearGuestDesignSnapshot({ storage });
    return parsed;
  }
  return reconcileGuestDesignSnapshot(parsed.snapshot, catalog);
}

export function clearGuestDesignSnapshot({ storage = globalThis?.localStorage } = {}) {
  try {
    if (!storage?.removeItem) return failure('storage_unavailable');
    storage.removeItem(GUEST_DESIGN_SNAPSHOT_STORAGE_KEY);
    return { ok: true };
  } catch {
    return failure('storage_unavailable');
  }
}
