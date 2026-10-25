export const LUMI_AESTHETIC_VERSION = '2.0.0';
export const LUMI_BUSINESS_COMPONENT_CATEGORY = Object.freeze({ STONE: 'STONE', TALISMAN: 'TALISMAN', DECORATIVE_PART: 'DECORATIVE_PART' });
export function businessCategoryForComponent(componentType) {
  if (componentType === 'stone') return LUMI_BUSINESS_COMPONENT_CATEGORY.STONE;
  if (componentType === 'spacer') return LUMI_BUSINESS_COMPONENT_CATEGORY.DECORATIVE_PART;
  if (componentType === 'loop_charm' || componentType === 'anchored_charm' || componentType === 'charm') return LUMI_BUSINESS_COMPONENT_CATEGORY.TALISMAN;
  return null;
}
export function isRealTalismanComponent(component) {
  return businessCategoryForComponent(component?.componentType || component?.type) === LUMI_BUSINESS_COMPONENT_CATEGORY.TALISMAN && Boolean(component?.materialId || component?.id);
}
export function countRealTalismans(physical) {
  return [...(physical?.sequence || []), ...(physical?.anchoredCharms || [])].filter(isRealTalismanComponent).length;
}
export function catalogTaxonomy(snapshot = {}) {
  const map = (items, category) => (items || []).map((item) => Object.freeze({ id:item.id, sku:item.sku || item.id, internalType:item.type || (category === 'STONE' ? 'stone' : 'spacer'), businessCategory:category, active:item.active !== false, eligible:item.active !== false && item.inStock !== false, placement:category === 'TALISMAN' ? (item.loopPlaceable ? 'loop' : 'anchored') : null, image:item.image || '' }));
  return Object.freeze([...map(snapshot.stones, 'STONE'), ...map(snapshot.charms, 'TALISMAN'), ...map(snapshot.spacers, 'DECORATIVE_PART')]);
}