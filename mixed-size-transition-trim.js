import { createBraceletGeometry } from './bracelet-geometry.js';

// Removes only the tail of the ordered mutable sequence. It never reorders,
// substitutes, or adds components; invalid geometry is never trimmed.
export function trimTrailingOverflowAfterFixedConversion({ state = {}, targetLengthMm = 0, getComponentGeometry, fixedGeometryComponents = [] } = {}) {
  const selectedStones = Array.isArray(state.selectedStones) ? state.selectedStones.slice() : [];
  const geometryFor = () => createBraceletGeometry({
    components: [
      ...(Array.isArray(fixedGeometryComponents) ? fixedGeometryComponents : []),
      ...selectedStones.map((component) => getComponentGeometry ? getComponentGeometry(component) : component)
    ],
    targetLengthMm
  });
  const removedComponents = [];
  let geometry = geometryFor();
  while (geometry.fitStatus === 'overflow' && selectedStones.length > 0) {
    const removed = selectedStones.pop();
    removedComponents.push({ uniqueId: removed?.uniqueId ?? null, componentType: String(removed?.componentType || removed?.type || 'stone'), stoneId: removed?.stoneId || null, spacerId: removed?.spacerId || null, charmId: removed?.charmId || null, size: Number(removed?.size) || null });
    geometry = geometryFor();
  }
  return { state: { ...state, selectedStones, activeSlotIndex: removedComponents.length ? null : state.activeSlotIndex }, geometry, removedComponents };
}
