import { createBraceletGeometry } from './bracelet-geometry.js';

export function trimTrailingOverflowAfterFixedConversion({
  state = {},
  targetLengthMm = 0,
  getComponentLengthMm = (component) => Number(component?.size || 0)
} = {}) {
  const selectedStones = Array.isArray(state.selectedStones) ? state.selectedStones.slice() : [];
  const toGeometryComponents = (items) => items.map((item) => ({
    type: 'sequence',
    sizeMm: Number(getComponentLengthMm(item)) || 0
  }));
  const removedComponents = [];
  let geometry = createBraceletGeometry({
    components: toGeometryComponents(selectedStones),
    targetLengthMm
  });

  while (geometry.fitStatus === 'overflow' && selectedStones.length > 0) {
    const removed = selectedStones.pop();
    removedComponents.push({
      uniqueId: removed?.uniqueId ?? null,
      componentType: String(removed?.componentType || removed?.type || 'stone'),
      stoneId: removed?.stoneId || null,
      spacerId: removed?.spacerId || null,
      charmId: removed?.charmId || null,
      size: Number(removed?.size) || null
    });
    geometry = createBraceletGeometry({
      components: toGeometryComponents(selectedStones),
      targetLengthMm
    });
  }

  return {
    state: {
      ...state,
      selectedStones,
      activeSlotIndex: removedComponents.length > 0 ? null : state.activeSlotIndex
    },
    geometry,
    removedComponents
  };
}
