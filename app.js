import { STONES, CATEGORIES, CHARM_PLACEHOLDER_IMAGE, refreshCatalog, refreshCharmCatalog, refreshCatalogLayoutOrder, getLegacyCharmCatalog, getSharedSettings, addSharedOrder, getSharedOrders, getStonePriceForSize, applyCatalogLayoutOrder, withCatalogImageVersion, getComponentTypeLabel } from './data.js';

// Clear session helper for testing/debugging
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('clear') || urlParams.has('logout') || urlParams.has('clearStorage')) {
  localStorage.clear();
  sessionStorage.removeItem('lucky_colorstone_landing_dismissed');
  window.location.href = window.location.pathname;
}

const LANDING_DISMISSED_KEY = 'lucky_colorstone_landing_dismissed';
const CHECKOUT_SUMMARY_STORAGE_KEY = 'lucky_colorstone_checkout_summary';
const STRIPE_ORDER_PAYLOAD_STORAGE_KEY = 'lucky_colorstone_stripe_order_payload';
const CUSTOMIZATION_LOGIN_INTENT_KEY = 'lucky_colorstone_customize_login_intent';
const LIFF_ID = '2010525799-qImIuhla';
const LINE_CONNECT_RETRY_MESSAGE = 'ไม่สามารถเข้าสู่ระบบ LINE ได้ กรุณาลองใหม่อีกครั้ง';
const INSPIRATION_SAMPLE_IMAGES = Object.freeze(
  Array.from({ length: 7 }, (_, index) => `/assets/sample/s${index + 1}.webp`)
);
const CUSTOMER_COMPONENT_LABELS = {
  stone: getComponentTypeLabel('stone', 'th'),
  charm: getComponentTypeLabel('charm', 'th'),
  spacer: getComponentTypeLabel('spacer', 'th')
};

// ==========================================
// 1. Global Application State
// ==========================================
const State = {
  currentStep: 1,
  wristSize: 16.0,          // Default wrist size in cm
  beadSize: '6',            // '4', '6', or '10'
  mixedPlacingSize: 6,      // Legacy persisted field, normalized to a supported size
  ownerName: '',            // Personalized bracelet owner name
  lineUserId: '',           // LIFF profile user identifier
  shippingInfo: {
    recipientName: '',
    phoneNumber: '',
    addressLine: '',
    province: '',
    postalCode: ''
  },
  selectedCharmIds: [],     // Up to two selected charm IDs, kept in selection order
  selectedCharmId: null,    // Legacy primary charm alias for compatibility
  liffInitialized: false,   // Ready flag for LINE LIFF Login API
  landingDismissed: false,  // Keep landing visible until CTA is clicked
  selectedStones: [],       // Array of placed beads: { stoneId: string, size: number, uniqueId: number }
  activeCategory: 'all',    // Current category filter in Step 3
  activeCatalogSection: 'stones', // Step 3 catalog type filter: stones, charms, spacer
  activeSlotIndex: null,    // Index of selected slot in Step 3 (-1 or null for append)
  uniqueCounter: 0,         // For generating unique IDs for animation keys
  newlyAddedIds: [],        // Track newly added bead unique IDs for pop animation
  orderDetailLoadError: '', // Friendly state for direct order summary links
  orderDetailSnapshot: null, // Saved order currently shown from ?orderId=
  orderDetailMode: false,
  paymentCompletedView: false,
  checkoutSummarySnapshot: null,
  braceletPreviewImage: '',
  discountEnabled: true,
  globalDiscountPercent: 20,
  showDiscountBanner: true,
  braceletPreviewKey: ''
};

// ==========================================
// 2. DOM Elements Selection
// ==========================================
const DOM = {
  // Stepper Elements
  stepNodes: [
    document.getElementById('stepNode1'),
    document.getElementById('stepNode2'),
    document.getElementById('stepNode3'),
    document.getElementById('stepNode4')
  ],
  stepProgressLine: document.getElementById('stepProgressLine'),
  stepIndicatorLabel: document.getElementById('stepIndicatorLabel'),
  
  // Step Views
  stepViews: [
    document.getElementById('stepView1'),
    document.getElementById('stepView2'),
    document.getElementById('stepView3'),
    document.getElementById('stepView4')
  ],
  
  // Navigation Buttons
  btnBack: document.getElementById('btnBack'),
  btnNext: document.getElementById('btnNext'),
  btnHome: document.getElementById('btnHome'),
  appFooter: document.querySelector('.app-footer'),
  headerLogo: document.getElementById('headerLogo'),
  
  // Step 1: Wrist Size
  braceletOwnerName: document.getElementById('braceletOwnerName'),
  visualWristSizeText: document.getElementById('visualWristSizeText'),
  displaySizeValue: document.getElementById('displaySizeValue'),
  
  // Step 2: Bead Size
  beadSizeCards: document.querySelectorAll('.bead-size-card'),
  estimationWristSizeText: document.getElementById('estimationWristSizeText'),
  estimationLengthText: document.getElementById('estimationLengthText'),
  estimationCapacityText: document.getElementById('estimationCapacityText'),
  charmSectionMount: document.getElementById('charmSectionMount'),
  
  // Step 3: Designer Workspace
  canvasPriceText: document.getElementById('canvasPriceText'),
  canvasBeadCountText: document.getElementById('canvasBeadCountText'),
  canvasSpaceText: document.getElementById('canvasSpaceText'),
  braceletSvg: document.getElementById('braceletSvg'),
  canvasCenterValue: document.getElementById('canvasCenterValue'),
  canvasCenterSub: document.getElementById('canvasCenterSub'),
  btnBackToSteps: document.getElementById('btnBackToSteps'),
  btnResetBracelet: document.getElementById('btnResetBracelet'),
  btnInspirationGallery: document.getElementById('btnInspirationGallery'),
  mixedSizeSelectorBar: document.getElementById('mixedSizeSelectorBar'),
  mixedToggleBtns: document.querySelectorAll('.mixed-toggle-btn'),
  catalogTypeFilter: document.getElementById('catalogTypeFilter'),
  catalogTypeTabs: document.querySelectorAll('.catalog-type-tab'),
  catalogFiltersContainer: document.getElementById('catalogFiltersContainer'),
  stoneCatalogGrid: document.getElementById('stoneCatalogGrid'),
  
  // Step 4: Summary & Billing
  summaryTitleText: document.getElementById('summaryTitleText'),
  summaryDateText: document.getElementById('summaryDateText'),
  specWristSize: document.getElementById('specWristSize'),
  specLength: document.getElementById('specLength'),
  specBeadSize: document.getElementById('specBeadSize'),
  specBeadsCount: document.getElementById('specBeadsCount'),
  billingItemsList: document.getElementById('billingItemsList'),
  priceSubtotal: document.getElementById('priceSubtotal'),
  priceDiscount: document.getElementById('priceDiscount'),
  priceTotal: document.getElementById('priceTotal'),
  meaningsList: document.getElementById('meaningsList'),
  shippingRecipientName: document.getElementById('shippingRecipientName'),
  shippingPhoneNumber: document.getElementById('shippingPhoneNumber'),
  shippingAddressLine: document.getElementById('shippingAddressLine'),
  shippingProvince: document.getElementById('shippingProvince'),
  shippingPostalCode: document.getElementById('shippingPostalCode'),
  shippingValidationMessage: document.getElementById('shippingValidationMessage'),
  btnPayWithStripe: document.getElementById('btnPayWithStripe'),
  
  // Modals & Popups
  stoneInfoModal: document.getElementById('stoneInfoModal'),
  modalStoneName: document.getElementById('modalStoneName'),
  modalStoneImg: document.getElementById('modalStoneImg'),
  modalStoneTitleTh: document.getElementById('modalStoneTitleTh'),
  modalStoneTitleEn: document.getElementById('modalStoneTitleEn'),
  modalStoneMeaning: document.getElementById('modalStoneMeaning'),
  modalStonePrice: document.getElementById('modalStonePrice'),
  btnModalClose: document.getElementById('btnModalClose'),
  btnModalAdd: document.getElementById('btnModalAdd'),
  btnModalFillAll: document.getElementById('btnModalFillAll'),
  confirmModal: document.getElementById('confirmModal'),
  confirmModalTitle: document.getElementById('confirmModalTitle'),
  confirmModalMessage: document.getElementById('confirmModalMessage'),
  btnConfirmClose: document.getElementById('btnConfirmClose'),
  btnConfirmCancel: document.getElementById('btnConfirmCancel'),
  btnConfirmOK: document.getElementById('btnConfirmOK'),
  inspirationGalleryModal: document.getElementById('inspirationGalleryModal'),
  inspirationGalleryGrid: document.getElementById('inspirationGalleryGrid'),
  btnInspirationGalleryClose: document.getElementById('btnInspirationGalleryClose'),
  btnInspirationGalleryBottomClose: document.getElementById('btnInspirationGalleryBottomClose'),
  toastMessage: document.getElementById('toastMessage'),
  
  // Landing Page & Loading selectors
  landingView: document.getElementById('landingView'),
  btnLandingLogin: document.getElementById('btnLandingLogin'),
  liffLoadingOverlay: document.getElementById('liffLoadingOverlay')
};

// ==========================================
// 3. Constants & Configuration
// ==========================================
const WRIST_SIZES = Array.from({ length: 13 }, (_, i) => 14.0 + i * 0.5); // 14.0, 14.5, ..., 20.0
const TOLERANCE_CM = 1.5; // Adding 1.5 cm standard padding for bracelets
const ALLOWED_BEAD_SIZES = Object.freeze(['4', '6', '10']);
const SHIPPING_FIELD_CONFIG = Object.freeze([
  { key: 'recipientName', label: 'ชื่อผู้รับ', domKey: 'shippingRecipientName' },
  { key: 'phoneNumber', label: 'เบอร์โทรศัพท์', domKey: 'shippingPhoneNumber' },
  { key: 'addressLine', label: 'ที่อยู่จัดส่ง', domKey: 'shippingAddressLine' },
  { key: 'province', label: 'จังหวัด', domKey: 'shippingProvince' },
  { key: 'postalCode', label: 'รหัสไปรษณีย์', domKey: 'shippingPostalCode' }
]);
let braceletShowcaseRenderKey = '';
let braceletShowcaseGenerationInFlight = false;
const charmVisibleBoundsCache = new Map();
const charmVisibleBoundsPromiseCache = new Map();
let legacyCharmCatalogCache = [];
let liffLoginInProgress = false;
let landingStartInProgress = false;
let landingConnectPromptVisible = false;
let customizationResumeInProgress = false;
let inspirationGalleryCloseTimer = null;
const SPACER_CATALOG = Object.freeze([
  {
    id: 'diamond_ball_orange',
    nameTh: 'ไดมอนด์บอล สีส้ม',
    nameEn: 'Diamond Ball Orange',
    type: 'ball',
    color: 'orange',
    image: '/assets/spacers/diamond-ball-orange-9mm.png',
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 0
  },
  {
    id: 'diamond_ball_pink',
    nameTh: 'ไดมอนด์บอล สีชมพู',
    nameEn: 'Diamond Ball Pink',
    type: 'ball',
    color: 'pink',
    image: '/assets/spacers/diamond-ball-pink-9mm.png',
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 0
  },
  {
    id: 'diamond_ball_purple',
    nameTh: 'ไดมอนด์บอล สีม่วง',
    nameEn: 'Diamond Ball Purple',
    type: 'ball',
    color: 'purple',
    image: '/assets/spacers/diamond-ball-purple-9mm.png',
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 0
  },
  {
    id: 'diamond_ball_white',
    nameTh: 'ไดมอนด์บอล สีขาว',
    nameEn: 'Diamond Ball White',
    type: 'ball',
    color: 'white',
    image: '/assets/spacers/diamond-ball-white-9mm.png',
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 0
  },
  {
    id: 'golden_ball',
    nameTh: 'โกลเด้นบอล',
    nameEn: 'Golden Ball',
    type: 'ball',
    color: 'gold',
    image: '/assets/spacers/golden-ball-7mm.png',
    displaySizeMm: 7,
    effectiveLengthMm: 7,
    renderSizeMm: 7,
    price: 0
  },
  {
    id: 'gold_flower',
    nameTh: 'ดอกไม้ทอง',
    nameEn: 'Gold Flower',
    type: 'flat-spacer',
    color: 'gold',
    image: '/assets/spacers/flower-gold-6mm.png',
    displaySizeMm: 6,
    effectiveLengthMm: 1,
    thicknessMm: 1,
    renderSizeMm: 6,
    price: 0
  },
  {
    id: 'silver_flower',
    nameTh: 'ดอกไม้เงิน',
    nameEn: 'Silver Flower',
    type: 'flat-spacer',
    color: 'silver',
    image: '/assets/spacers/flower-silver-6mm.png',
    displaySizeMm: 6,
    effectiveLengthMm: 1,
    thicknessMm: 1,
    renderSizeMm: 6,
    price: 0
  }
]);
const SPACER_CATALOG_MAP = new Map(SPACER_CATALOG.map((spacer) => [spacer.id, spacer]));

function normalizeBeadSizeOption(value) {
  const beadSize = String(value || '').trim();
  if (ALLOWED_BEAD_SIZES.includes(beadSize)) return beadSize;
  if (beadSize === '8') return '10';
  return '6';
}

function getCurrentBeadSizeMm() {
  return parseInt(normalizeBeadSizeOption(State.beadSize), 10);
}

function normalizeSelectedStoneSizes() {
  const normalizedBeadSize = getCurrentBeadSizeMm();
  State.selectedStones.forEach((item) => {
    if (isEmptyLoopSlot(item) || isSelectedSpacerItem(item) || isSelectedCharmItem(item)) return;
    item.size = normalizedBeadSize;
  });
}

function getSpacerCatalogEntry(spacerId) {
  return SPACER_CATALOG_MAP.get(String(spacerId || '').trim()) || null;
}

function getCharmCatalogEntry(charmId) {
  return legacyCharmCatalogCache.find((charm) => charm?.id === String(charmId || '').trim()) || null;
}

function isSlotPlaceableCharmType(charmType) {
  return String(charmType || '').trim().toLowerCase() === 'bee_heart';
}

function isAnchoredCharmType(charmType) {
  return !isSlotPlaceableCharmType(charmType);
}

function isEmptyLoopSlot(item) {
  return String(item?.componentType || item?.type || '').trim().toLowerCase() === 'empty';
}

function createEmptyLoopSlot(size, uniqueId = null) {
  const normalizedSize = Number(size);
  return {
    componentType: 'empty',
    size: Number.isFinite(normalizedSize) && normalizedSize > 0 ? normalizedSize : getCurrentBeadSizeMm(),
    uniqueId
  };
}

function normalizeSelectedLoopItem(item, normalizedBeadSize = getCurrentBeadSizeMm()) {
  if (item === null) return createEmptyLoopSlot(normalizedBeadSize);
  if (!item || typeof item !== 'object') return null;

  const componentType = String(item.componentType || 'stone').trim().toLowerCase();
  const uniqueId = Number.isFinite(Number(item.uniqueId)) ? Number(item.uniqueId) : null;

  if (componentType === 'empty') {
    return createEmptyLoopSlot(item.size, uniqueId);
  }

  if (componentType === 'spacer') {
    const spacerId = String(item.spacerId || item.id || '').trim();
    const spacer = getSpacerCatalogEntry(spacerId);
    if (!spacer) return null;

    return {
      componentType: 'spacer',
      spacerId: spacer.id,
      size: spacer.effectiveLengthMm,
      uniqueId
    };
  }

  if (componentType === 'charm') {
    const charmId = String(item.charmId || item.id || '').trim();
    if (!charmId) return null;
    const charm = getCharmCatalogEntry(charmId);
    if (charm && !isSlotPlaceableCharmType(charm.type)) return null;

    return {
      componentType: 'charm',
      charmId: charm?.id || charmId,
      size: charm ? getCharmFootprintMm(charm) : Number(item.size || 2),
      uniqueId
    };
  }

  const stoneId = String(item.stoneId || '').trim();
  if (!stoneId) return null;
  const size = Number.isFinite(Number(item.size)) ? Number(item.size) : normalizedBeadSize;

  return {
    componentType: 'stone',
    stoneId,
    size,
    uniqueId
  };
}

function normalizeSelectedLoopItems(source = []) {
  const normalizedBeadSize = getCurrentBeadSizeMm();
  if (!Array.isArray(source)) return [];

  return source
    .map((item) => normalizeSelectedLoopItem(item, normalizedBeadSize))
    .filter((item) => item !== null);
}

function getSelectedLoopItems() {
  return normalizeSelectedLoopItems(State.selectedStones);
}

function isSelectedSpacerItem(item) {
  return (item?.componentType || 'stone') === 'spacer';
}

function isSelectedCharmItem(item) {
  return (item?.componentType || 'stone') === 'charm';
}

function isSelectedStoneItem(item) {
  return Boolean(item) && !isEmptyLoopSlot(item) && !isSelectedSpacerItem(item) && !isSelectedCharmItem(item);
}

function getSelectedStoneItems() {
  return getSelectedLoopItems().filter((item) => isSelectedStoneItem(item));
}

function getSelectedStoneCountsById() {
  return getSelectedStoneItems().reduce((counts, item) => {
    if (!item.stoneId) return counts;
    counts[item.stoneId] = (counts[item.stoneId] || 0) + 1;
    return counts;
  }, {});
}

function getSelectedSpacerItems() {
  return getSelectedLoopItems()
    .map((item, sourceIndex) => {
      if (!isSelectedSpacerItem(item)) return null;
      const spacer = getSpacerCatalogEntry(item.spacerId);
      if (!spacer) return null;
      return {
        ...spacer,
        sourceIndex,
        uniqueId: item.uniqueId,
        effectiveLengthMm: spacer.effectiveLengthMm
      };
    })
    .filter(Boolean);
}

function getSelectedLoopCharmItems() {
  return getSelectedLoopItems()
    .map((item, sourceIndex) => {
      if (!isSelectedCharmItem(item)) return null;
      const charm = getCharmCatalogEntry(item.charmId);
      if (!charm || !isSlotPlaceableCharmType(charm.type)) return null;
      const charmMeta = getCharmDisplayMeta(charm);
      return {
        ...charm,
        ...charmMeta,
        sourceIndex,
        uniqueId: item.uniqueId,
        footprintMm: getCharmFootprintMm(charm)
      };
    })
    .filter(Boolean);
}

function getLoopItemLengthMm(item) {
  if (isEmptyLoopSlot(item)) {
    return Number(item?.size || 0);
  }
  if (isSelectedSpacerItem(item)) {
    const spacer = getSpacerCatalogEntry(item.spacerId);
    return spacer ? spacer.effectiveLengthMm : 0;
  }
  if (isSelectedCharmItem(item)) {
    const charm = getCharmCatalogEntry(item.charmId);
    return charm ? getCharmFootprintMm(charm) : Number(item?.size || 2);
  }
  return Number(item?.size || 0);
}

function serializeSelectedLoopItem(item) {
  if (isEmptyLoopSlot(item)) {
    return { t: 'empty', z: getLoopItemLengthMm(item) };
  }
  if (isSelectedSpacerItem(item)) {
    return { t: 'spacer', i: item.spacerId, l: getLoopItemLengthMm(item) };
  }
  if (isSelectedCharmItem(item)) {
    return { t: 'charm', i: item.charmId, l: getLoopItemLengthMm(item) };
  }
  return { t: 'stone', i: item.stoneId, z: item.size };
}

function getSelectedLoopItemRenderKey(item) {
  if (isEmptyLoopSlot(item)) {
    return `empty:${getLoopItemLengthMm(item)}`;
  }
  if (isSelectedSpacerItem(item)) {
    return `spacer:${item.spacerId}:${getLoopItemLengthMm(item)}`;
  }
  if (isSelectedCharmItem(item)) {
    return `charm:${item.charmId}:${getLoopItemLengthMm(item)}:${item.uniqueId}`;
  }
  return `stone:${item.stoneId}:${item.size}`;
}

function createStoneSelectionItem(stoneId, size, uniqueId) {
  return {
    componentType: 'stone',
    stoneId,
    size,
    uniqueId
  };
}

function createSpacerSelectionItem(spacerId, uniqueId) {
  const spacer = getSpacerCatalogEntry(spacerId);
  if (!spacer) return null;

  return {
    componentType: 'spacer',
    spacerId: spacer.id,
    size: spacer.effectiveLengthMm,
    uniqueId
  };
}

function createCharmSelectionItem(charmId, uniqueId) {
  const charm = getCharmCatalogEntry(charmId);
  if (!charm || !isSlotPlaceableCharmType(charm.type)) return null;

  return {
    componentType: 'charm',
    charmId: charm.id,
    size: getCharmFootprintMm(charm),
    uniqueId
  };
}

function createEmptyShippingInfo() {
  return {
    recipientName: '',
    phoneNumber: '',
    addressLine: '',
    province: '',
    postalCode: ''
  };
}

function normalizeShippingInfo(source = {}) {
  const shippingInfo = createEmptyShippingInfo();

  SHIPPING_FIELD_CONFIG.forEach(({ key }) => {
    shippingInfo[key] = typeof source?.[key] === 'string' ? source[key] : '';
  });

  return shippingInfo;
}

function normalizeSelectedCharmIds(source = []) {
  const rawIds = Array.isArray(source) ? source : [source];
  return rawIds
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .slice(0, 2);
}

function syncSelectedCharmState() {
  State.selectedCharmIds = normalizeSelectedCharmIds(State.selectedCharmIds)
    .filter((charmId) => {
      const charm = getCharmCatalogEntry(charmId);
      return !charm || isAnchoredCharmType(charm.type);
    });
  State.selectedCharmId = State.selectedCharmIds[0] || null;
}

function migrateSlotPlaceableCharmSelectionsIntoLoop() {
  const currentCharmIds = normalizeSelectedCharmIds(State.selectedCharmIds);
  if (currentCharmIds.length === 0) return;

  const anchoredCharmIds = [];
  const migratedLoopItems = [];

  currentCharmIds.forEach((charmId) => {
    const charm = getCharmCatalogEntry(charmId);
    if (charm && isSlotPlaceableCharmType(charm.type)) {
      State.uniqueCounter += 1;
      const loopCharm = createCharmSelectionItem(charm.id, State.uniqueCounter);
      if (loopCharm) {
        migratedLoopItems.push(loopCharm);
      }
      return;
    }
    anchoredCharmIds.push(charmId);
  });

  if (migratedLoopItems.length === 0) {
    State.selectedCharmIds = anchoredCharmIds;
    syncSelectedCharmState();
    return;
  }

  State.selectedCharmIds = anchoredCharmIds;
  syncSelectedCharmState();
  migratedLoopItems.forEach((loopItem) => placeLoopItemInFirstAvailableSlot(loopItem));
}

function getShippingInfoSnapshot({ trimValues = false } = {}) {
  const snapshot = normalizeShippingInfo(State.shippingInfo);
  if (!trimValues) return snapshot;

  const trimmed = {};
  SHIPPING_FIELD_CONFIG.forEach(({ key }) => {
    trimmed[key] = snapshot[key].trim();
  });
  return trimmed;
}

function getShippingAddressFromInfo(info) {
  if (!info.addressLine && !info.province && !info.postalCode) {
    return null;
  }

  return {
    line1: info.addressLine,
    line2: '',
    city: '',
    state: info.province,
    postalCode: info.postalCode,
    country: 'TH'
  };
}

function getShippingDetailsFromInfo(info) {
  const address = getShippingAddressFromInfo(info);
  if (!info.recipientName && !address) {
    return null;
  }

  return {
    name: info.recipientName,
    address
  };
}

function resolveShippingInfoFromCheckoutPayload(payload = {}) {
  const metadata = payload.metadata && typeof payload.metadata === 'object'
    ? payload.metadata
    : {};
  const stripeShippingDetails = payload.shippingDetails && typeof payload.shippingDetails === 'object'
    ? payload.shippingDetails
    : null;
  const stripeAddress = stripeShippingDetails?.address || payload.shippingAddress || null;
  const localShippingInfo = getShippingInfoSnapshot({ trimValues: true });

  return normalizeShippingInfo({
    recipientName: localShippingInfo.recipientName || metadata.recipientName || stripeShippingDetails?.name || '',
    phoneNumber: localShippingInfo.phoneNumber || payload.phoneNumber || metadata.phoneNumber || '',
    addressLine: localShippingInfo.addressLine || metadata.addressLine || [stripeAddress?.line1, stripeAddress?.line2].filter(Boolean).join(' '),
    province: localShippingInfo.province || metadata.province || stripeAddress?.state || stripeAddress?.city || '',
    postalCode: localShippingInfo.postalCode || metadata.postalCode || stripeAddress?.postalCode || ''
  });
}

// ==========================================
// 4. Initialisation
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const returnParams = new URLSearchParams(window.location.search);
  const shouldOpenStep4FromUrl = returnParams.get('step') === '4' || returnParams.has('stripe') || returnParams.has('orderId');
  const shouldResumeCustomizationStart = !returnParams.has('orderId') && hasCustomizationLoginIntent();

  // Show loading overlay during LIFF boot
  const loader = document.getElementById('liffLoadingOverlay');
  if (loader) loader.style.display = 'flex';

  // Load persisted state if exists
  loadPersistedState();
  if (shouldOpenStep4FromUrl) {
    if (returnParams.has('orderId')) {
      clearCustomizationLoginIntent();
    }
    State.currentStep = 4;
    State.landingDismissed = true;
  } else if (shouldResumeCustomizationStart) {
    customizationResumeInProgress = true;
    State.currentStep = 1;
    State.landingDismissed = true;
    persistLandingDismissed();
    setLiffLoadingMessage('เข้าสู่ระบบสำเร็จ กำลังพาไปเริ่มออกแบบ...');
  }
  syncShellVisibility();
  
  // Auto-login/bypass for testing
  if (urlParams.has('mock') || urlParams.has('bypass') || urlParams.has('dev') || window.navigator.webdriver) {
    if (!State.ownerName) {
      State.ownerName = "Somchai";
    }
    if (DOM.braceletOwnerName) {
      DOM.braceletOwnerName.value = State.ownerName;
    }
  }
  
  // Setup LIFF (LINE Front-end Framework)
  await initLIFF();
  clearOAuthQueryParams();
  restoreCustomizationIntentAfterLogin();
  
  // Fetch initial catalog from shared persistence
  const [, , , sharedSettings] = await Promise.all([
    refreshCatalog(),
    refreshCharmCatalog(),
    refreshCatalogLayoutOrder(),
    getSharedSettings()
  ]);
  State.discountEnabled = sharedSettings?.discountEnabled === undefined
    ? sharedSettings?.showDiscountBanner !== false
    : sharedSettings.discountEnabled !== false;
  State.globalDiscountPercent = Number.isFinite(Number(sharedSettings?.globalDiscountPercent))
    ? Math.max(0, Math.min(100, Number(sharedSettings.globalDiscountPercent)))
    : 20;
  State.showDiscountBanner = State.discountEnabled && sharedSettings?.showDiscountBanner !== false;

  await loadOrderDetailFromUrlIfNeeded();
  await handleStripeReturnIfNeeded();
  
  // Initialise step UI components
  initWristSizeGrid();
  initBeadSizeOptions();
  initCharmSelection();
  initCatalogFilters();
  
  // Setup Event Listeners
  setupNavigationEvents();
  setupDesignerEvents();
  setupModalEvents();
  setupLandingEvents();
  setupShippingFormEvents();
  
  // Polling for updates every 3 seconds to reflect CRM changes instantly
  setInterval(async () => {
    const [updatedStones, updatedCharms] = await Promise.all([
      refreshCatalog(),
      refreshCharmCatalog()
    ]);
    if (updatedStones || updatedCharms) {
      await renderApp();
    }
  }, 3000);
  
  // Perform first render
  await renderApp();
  if (customizationResumeInProgress) {
    await completeCustomizationStartResume();
  }
});

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => {
      window.clearTimeout(timeoutId);
    });
}

function setLandingButtonState(state, message = '') {
  const button = DOM.btnLandingLogin;
  if (!button) return;

  const isLoading = state === 'starting' || state === 'line';
  const text = button.querySelector('.btn-text');
  if (text) {
    text.textContent = isLoading ? message : (message || 'Start Customize');
  }
  button.disabled = isLoading;
  button.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
  button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  button.classList.toggle('is-loading', isLoading);
  button.classList.toggle('is-pressed', state === 'starting');
  button.classList.toggle('is-line-login', state === 'line');
}

function resetLandingStartState() {
  landingStartInProgress = false;
  setLandingButtonState('idle', landingConnectPromptVisible ? 'เข้าสู่ระบบด้วย LINE' : '');
}

function setLiffLoadingMessage(message = '') {
  const loadingText = DOM.liffLoadingOverlay?.querySelector('.loading-text');
  if (!loadingText) return;
  loadingText.textContent = message || 'กำลังเชื่อมต่อกับ LINE...';
}

function setLandingSubtitleMessage(message = '') {
  const subtitle = document.querySelector('.landing-hero-subtitle');
  if (!subtitle) return;

  if (!subtitle.dataset.defaultHtml) {
    subtitle.dataset.defaultHtml = subtitle.innerHTML;
  }

  if (message) {
    subtitle.textContent = message;
  } else {
    subtitle.innerHTML = subtitle.dataset.defaultHtml;
  }
}

function showLineConnectPrompt(message = '') {
  landingConnectPromptVisible = true;
  setLandingSubtitleMessage('ใช้ LINE เพื่อรับสถานะคำสั่งซื้อและแจ้งเตือนจากร้าน');
  setLandingButtonState('idle', 'เข้าสู่ระบบด้วย LINE');
  if (message) {
    showToast(message);
  }
}

function clearLineConnectPrompt() {
  landingConnectPromptVisible = false;
  setLandingSubtitleMessage('');
}

function getLiffRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function getLiffEntryUrl() {
  return `https://liff.line.me/${LIFF_ID}`;
}

function isLikelyMobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || '');
}

function canUseLiffLoginFromCurrentBrowser() {
  return typeof liff !== 'undefined'
    && State.liffInitialized
    && typeof liff.login === 'function'
    && (isLiffInClient() || isLikelyMobileBrowser());
}

function isLiffInClient() {
  return typeof liff !== 'undefined'
    && State.liffInitialized
    && typeof liff.isInClient === 'function'
    && liff.isInClient();
}

function isLiffLoggedIn() {
  return typeof liff !== 'undefined'
    && State.liffInitialized
    && typeof liff.isLoggedIn === 'function'
    && liff.isLoggedIn();
}

function isLineIdentityAvailable() {
  const hasLineUserId = Boolean(State.lineUserId && State.lineUserId.trim());
  if (!hasLineUserId) return false;
  if (State.liffInitialized && typeof liff !== 'undefined' && typeof liff.isLoggedIn === 'function') {
    return isLiffLoggedIn();
  }
  return true;
}

async function syncLineProfileFromLiff() {
  if (!isLiffLoggedIn()) return false;

  try {
    const profile = await withTimeout(liff.getProfile(), 5000, "LIFF getProfile");
    State.lineUserId = String(profile.userId || '').trim();
    if (profile.displayName) {
      State.ownerName = profile.displayName;
      DOM.braceletOwnerName.value = profile.displayName;
    }
    saveState();
    return isLineIdentityAvailable();
  } catch (profileErr) {
    console.warn("LIFF profile fetch failed. LINE identity is unavailable.", profileErr);
    return false;
  }
}

function rememberCustomizationLoginIntent() {
  localStorage.setItem(CUSTOMIZATION_LOGIN_INTENT_KEY, JSON.stringify({
    ts: Date.now(),
    step: 1
  }));
}

function hasCustomizationLoginIntent() {
  const rawIntent = localStorage.getItem(CUSTOMIZATION_LOGIN_INTENT_KEY);
  if (!rawIntent) return false;

  try {
    const intent = JSON.parse(rawIntent);
    const intentAgeMs = Date.now() - Number(intent?.ts || 0);
    if (intentAgeMs >= 0 && intentAgeMs <= 10 * 60 * 1000) {
      return true;
    }
  } catch (intentErr) {
    console.warn("Invalid customization login intent. Clearing stale state.", intentErr);
  }

  clearCustomizationLoginIntent();
  return false;
}

function clearCustomizationLoginIntent() {
  localStorage.removeItem(CUSTOMIZATION_LOGIN_INTENT_KEY);
}

function restoreCustomizationIntentAfterLogin() {
  if (getRequestedOrderId() || !hasCustomizationLoginIntent()) return;
  if (!isLineIdentityAvailable()) return;

  State.currentStep = 1;
  State.landingDismissed = true;
  persistLandingDismissed();
  syncShellVisibility();
}

async function completeCustomizationStartResume() {
  const loader = DOM.liffLoadingOverlay;

  if (hasCustomizationLoginIntent() && isLineIdentityAvailable() && State.currentStep === 1 && State.landingDismissed) {
    clearCustomizationLoginIntent();
    saveState();
    if (loader) loader.style.display = 'none';
    customizationResumeInProgress = false;
    return;
  }

  customizationResumeInProgress = false;
  clearCustomizationLoginIntent();
  State.landingDismissed = false;
  persistLandingDismissed();
  syncShellVisibility();
  showLineConnectPrompt(LINE_CONNECT_RETRY_MESSAGE);
  resetLandingStartState();
  if (loader) loader.style.display = 'none';
}

function startLiffLoginForCustomization() {
  if (getRequestedOrderId()) return true;
  if (liffLoginInProgress) {
    console.warn("LIFF login already in progress.");
    return false;
  }
  if (typeof liff === 'undefined' || !State.liffInitialized || typeof liff.login !== 'function') {
    return false;
  }

  const loader = DOM.liffLoadingOverlay;
  rememberCustomizationLoginIntent();
  saveState();
  setLandingButtonState('line', 'กำลังเข้าสู่ระบบ LINE...');
  setLiffLoadingMessage('กำลังเข้าสู่ระบบ LINE...');
  if (loader) loader.style.display = 'flex';
  liffLoginInProgress = true;
  console.log("LIFF customization login start");

  try {
    liff.login({ redirectUri: getLiffRedirectUri() });
    return false;
  } catch (loginErr) {
    liffLoginInProgress = false;
    clearCustomizationLoginIntent();
    if (loader) loader.style.display = 'none';
    console.warn("LIFF customization login failed to start.", loginErr);
    if (!State.landingDismissed) {
      showLineConnectPrompt(LINE_CONNECT_RETRY_MESSAGE);
      resetLandingStartState();
    } else {
      resetLandingStartState();
      showToast(LINE_CONNECT_RETRY_MESSAGE);
    }
    return false;
  }
}

function openLineConnectEntryForCustomization() {
  if (getRequestedOrderId()) return true;
  if (liffLoginInProgress) return false;

  const loader = DOM.liffLoadingOverlay;
  rememberCustomizationLoginIntent();
  saveState();
  setLandingButtonState('line', 'กำลังเข้าสู่ระบบ LINE...');
  setLiffLoadingMessage('กำลังเข้าสู่ระบบ LINE...');
  if (loader) loader.style.display = 'flex';
  liffLoginInProgress = true;

  try {
    window.location.assign(getLiffEntryUrl());
    return false;
  } catch (entryErr) {
    liffLoginInProgress = false;
    clearCustomizationLoginIntent();
    if (loader) loader.style.display = 'none';
    console.warn("LINE connect entry failed to open.", entryErr);
    resetLandingStartState();
    showToast(LINE_CONNECT_RETRY_MESSAGE);
    return false;
  }
}

async function requireLineLoginForCustomization(options = {}) {
  const { showLandingPrompt = false } = options;
  if (getRequestedOrderId() || State.orderDetailMode || State.paymentCompletedView) return true;
  if (isLineIdentityAvailable()) return true;
  if (isLiffLoggedIn()) {
    const profileReady = await syncLineProfileFromLiff();
    if (profileReady) return true;
    showToast(LINE_CONNECT_RETRY_MESSAGE);
    return false;
  }

  if (canUseLiffLoginFromCurrentBrowser()) {
    showToast("เข้าสู่ระบบด้วย LINE เพื่อเริ่มออกแบบกำไล");
    return startLiffLoginForCustomization();
  }

  if (showLandingPrompt) {
    showLineConnectPrompt();
  } else {
    showToast("เข้าสู่ระบบด้วย LINE เพื่อเริ่มออกแบบกำไล");
  }

  return false;
}

// LIFF Initialization
async function initLIFF() {
  const loader = document.getElementById('liffLoadingOverlay');
  if (typeof liff === 'undefined') {
    State.liffInitialized = false;
    if (loader && !customizationResumeInProgress) loader.style.display = 'none';
    console.warn("LIFF SDK is unavailable. Continuing without LINE profile.");
    return;
  }

  try {
    console.log("LIFF init start");
    await withTimeout(liff.init({ liffId: LIFF_ID }), 6000, "LIFF init");
    console.log("LIFF init complete");
    State.liffInitialized = true;

    const isLoggedIn = liff.isLoggedIn();
    console.log("LIFF isLoggedIn:", isLoggedIn);
    if (isLoggedIn) {
      try {
        console.log("LIFF getProfile start");
        const profile = await withTimeout(liff.getProfile(), 5000, "LIFF getProfile");
        console.log("LIFF getProfile complete");
        State.lineUserId = String(profile.userId || '').trim();
        if (profile.displayName) {
          State.ownerName = profile.displayName;
          DOM.braceletOwnerName.value = profile.displayName;
        }
      } catch (profileErr) {
        console.warn("LIFF profile fetch failed. Continuing as guest.", profileErr);
      }
    }
  } catch (err) {
    console.warn("LIFF initialization failed or timed out. Continuing without LINE profile.", err);
    State.liffInitialized = false;
  } finally {
    if (loader && !customizationResumeInProgress) loader.style.display = 'none';
  }
}

function setupLandingEvents() {
  DOM.btnLandingLogin.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (landingStartInProgress) return;
    landingStartInProgress = true;
    setLandingButtonState('starting', 'กำลังเริ่มต้น...');

    if (landingConnectPromptVisible) {
      if (canUseLiffLoginFromCurrentBrowser()) {
        startLiffLoginForCustomization();
      } else {
        openLineConnectEntryForCustomization();
      }
      return;
    }

    let canContinue = false;
    try {
      canContinue = await withTimeout(
        requireLineLoginForCustomization({ showLandingPrompt: true }),
        8000,
        "Start customization"
      );
    } catch (startErr) {
      console.warn("Start customization check failed or timed out.", startErr);
      showLineConnectPrompt(LINE_CONNECT_RETRY_MESSAGE);
      resetLandingStartState();
      return;
    }

    if (!canContinue) {
      if (!liffLoginInProgress) {
        resetLandingStartState();
      }
      return;
    }

    clearLineConnectPrompt();
    State.currentStep = 1;
    State.landingDismissed = true;
    persistLandingDismissed();
    await renderApp();
    if (State.currentStep === 1) {
      clearCustomizationLoginIntent();
    }
    resetLandingStartState();
  });
}

// Load State from LocalStorage
function loadPersistedState() {
  const savedState = localStorage.getItem('lucky_colorstone_state');
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      State.wristSize = parsed.wristSize || 16.0;
      State.beadSize = normalizeBeadSizeOption(parsed.beadSize || '6');
      State.mixedPlacingSize = getCurrentBeadSizeMm();
      State.ownerName = parsed.ownerName || '';
      State.lineUserId = typeof parsed.lineUserId === 'string' ? parsed.lineUserId : '';
      State.shippingInfo = normalizeShippingInfo(parsed.shippingInfo);
      const persistedCharmIds = Array.isArray(parsed.selectedCharmIds)
        ? parsed.selectedCharmIds
        : parsed.selectedCharmId != null
          ? [parsed.selectedCharmId]
          : [];
      State.selectedCharmIds = normalizeSelectedCharmIds(persistedCharmIds);
      syncSelectedCharmState();
      State.selectedStones = normalizeSelectedLoopItems(parsed.selectedStones || []);
      
      // Normalize unique IDs to prevent clashes and empty values
      const seenIds = new Set();
      let maxUniqueId = 0;
      State.selectedStones.forEach((item, idx) => {
        if (!item.uniqueId || seenIds.has(item.uniqueId)) {
          item.uniqueId = idx + 1;
        }
        seenIds.add(item.uniqueId);
        maxUniqueId = Math.max(maxUniqueId, Number(item.uniqueId) || 0);
      });
      State.uniqueCounter = maxUniqueId;
      normalizeSelectedStoneSizes();
      
      State.currentStep = parsed.currentStep || 1;
      DOM.braceletOwnerName.value = State.ownerName;
    } catch (e) {
      console.error("Failed to parse persisted state", e);
    }
  }

  State.landingDismissed = sessionStorage.getItem(LANDING_DISMISSED_KEY) === '1';
}

// Persist State to LocalStorage
function saveState() {
  const stateCopy = {
    wristSize: State.wristSize,
    beadSize: State.beadSize,
    mixedPlacingSize: State.mixedPlacingSize,
    ownerName: State.ownerName,
    lineUserId: State.lineUserId,
    shippingInfo: normalizeShippingInfo(State.shippingInfo),
    selectedCharmIds: normalizeSelectedCharmIds(State.selectedCharmIds),
    selectedCharmId: State.selectedCharmIds[0] || null,
    selectedStones: normalizeSelectedLoopItems(State.selectedStones),
    currentStep: State.currentStep
  };
  localStorage.setItem('lucky_colorstone_state', JSON.stringify(stateCopy));
}

function persistLandingDismissed() {
  if (State.landingDismissed) {
    sessionStorage.setItem(LANDING_DISMISSED_KEY, '1');
  } else {
    sessionStorage.removeItem(LANDING_DISMISSED_KEY);
  }
}

function syncShellVisibility() {
  if (DOM.landingView) {
    DOM.landingView.style.display = State.landingDismissed ? 'none' : 'flex';
  }
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.style.display = State.landingDismissed ? 'flex' : 'none';
  }
}

function clearOAuthQueryParams() {
  const oauthKeys = ['code', 'state', 'liff.state', 'access_token', 'id_token', 'scope', 'expires_in', 'token_type'];
  const hasOauthParams = oauthKeys.some((key) => urlParams.has(key));
  if (!hasOauthParams) return;

  const cleanParams = new URLSearchParams(window.location.search);
  oauthKeys.forEach((key) => cleanParams.delete(key));
  const cleanSearch = cleanParams.toString();
  const nextUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash || ''}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function getRequestedOrderId() {
  return String(new URLSearchParams(window.location.search).get('orderId') || '').trim();
}

function getOrderPayloadObject(rawOrder) {
  return rawOrder?.payload && typeof rawOrder.payload === 'object'
    ? rawOrder.payload
    : rawOrder;
}

function firstNonEmptyOrderValue(...values) {
  const value = values.find((entry) => String(entry ?? '').trim());
  return value == null ? '' : String(value).trim();
}

function getOrderIdCandidates(rawOrder) {
  if (!rawOrder || typeof rawOrder !== 'object') return [];
  const payload = rawOrder.payload && typeof rawOrder.payload === 'object'
    ? rawOrder.payload
    : {};
  return [
    rawOrder.id,
    rawOrder.orderId,
    rawOrder.order_id,
    payload.id,
    payload.orderId,
    payload.order_id
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

function orderMatchesRequestedId(rawOrder, requestedOrderId) {
  const normalizedId = String(requestedOrderId || '').trim();
  if (!normalizedId) return false;
  return getOrderIdCandidates(rawOrder).some((candidate) => candidate === normalizedId);
}

function normalizeSavedOrder(rawOrder) {
  if (!rawOrder || typeof rawOrder !== 'object') return null;

  const payload = rawOrder.payload && typeof rawOrder.payload === 'object'
    ? rawOrder.payload
    : null;
  const canonical = payload ? { ...payload } : { ...rawOrder };
  const id = firstNonEmptyOrderValue(
    canonical.id,
    canonical.orderId,
    rawOrder.id,
    rawOrder.orderId,
    rawOrder.order_id
  );
  const orderId = firstNonEmptyOrderValue(
    canonical.orderId,
    canonical.id,
    rawOrder.orderId,
    rawOrder.id,
    rawOrder.order_id
  );

  return {
    ...canonical,
    id: id || canonical.id,
    orderId: orderId || id || canonical.orderId,
    status: canonical.status || rawOrder.status || '',
    date: canonical.date || rawOrder.date || rawOrder.createdAt || rawOrder.created_at || '',
    customerName: canonical.customerName || rawOrder.customerName || rawOrder.customer_name || '',
    lineUserId: canonical.lineUserId || rawOrder.lineUserId || rawOrder.line_user_id || '',
    stripeCheckoutSessionId: canonical.stripeCheckoutSessionId || rawOrder.stripeCheckoutSessionId || rawOrder.stripe_checkout_session_id || '',
    stripePaymentStatus: canonical.stripePaymentStatus || rawOrder.stripePaymentStatus || rawOrder.stripe_payment_status || '',
    netPrice: canonical.netPrice ?? rawOrder.netPrice ?? rawOrder.net_price,
    finalPrice: canonical.finalPrice ?? rawOrder.finalPrice ?? rawOrder.final_price,
    totalPrice: canonical.totalPrice ?? rawOrder.totalPrice ?? rawOrder.total_price
  };
}

async function fetchOrdersFromApiUrl(apiUrl) {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`${apiUrl} returned HTTP ${response.status}`);
  }
  const orders = await response.json();
  return Array.isArray(orders) ? orders : [];
}

function getOrderDetailFallbackApiUrls() {
  const urls = [];
  try {
    const currentOrigin = window.location.origin;
    if (currentOrigin !== 'https://crm.luckycolorstone.com') {
      urls.push('https://crm.luckycolorstone.com/api/orders');
    }
  } catch {
    urls.push('https://crm.luckycolorstone.com/api/orders');
  }
  return urls;
}

async function findSavedOrderByRequestedId(orderId) {
  const primaryOrders = await getSharedOrders();
  const primaryOrder = Array.isArray(primaryOrders)
    ? primaryOrders.find((entry) => orderMatchesRequestedId(entry, orderId))
    : null;
  if (primaryOrder) return normalizeSavedOrder(primaryOrder);

  for (const apiUrl of getOrderDetailFallbackApiUrls()) {
    try {
      const fallbackOrders = await fetchOrdersFromApiUrl(apiUrl);
      const fallbackOrder = fallbackOrders.find((entry) => orderMatchesRequestedId(entry, orderId));
      if (fallbackOrder) return normalizeSavedOrder(fallbackOrder);
    } catch (error) {
      console.warn('Unable to load order detail fallback API', error);
    }
  }

  return null;
}

function decodeOrderConfiguration(configurationCode) {
  const rawCode = String(configurationCode || '').trim();
  if (!rawCode) return null;

  try {
    return JSON.parse(decodeURIComponent(escape(atob(rawCode))));
  } catch (error) {
    console.warn('Unable to decode order configuration code', error);
    return null;
  }
}

function buildLoopItemsFromOrder(order, decodedConfig) {
  const savedSequence = Array.isArray(order?.braceletSequence)
    ? order.braceletSequence
    : Array.isArray(order?.beadMap)
      ? order.beadMap
      : null;

  if (savedSequence?.length) {
    return normalizeSelectedLoopItems(savedSequence.map((item, index) => {
      const itemType = String(item?.componentType || item?.type || 'stone').trim().toLowerCase();
      if (itemType === 'empty') {
        return createEmptyLoopSlot(Number(item?.size || item?.sizeMm || order?.beadSize || State.beadSize), index + 1);
      }
      if (itemType === 'spacer') {
        return {
          componentType: 'spacer',
          spacerId: String(item?.spacerId || item?.id || '').trim(),
          uniqueId: index + 1
        };
      }
      if (itemType === 'charm') {
        const charmId = String(item?.charmId || item?.id || '').trim();
        const charm = getCharmCatalogEntry(charmId);
        if (charm && isAnchoredCharmType(charm.type)) {
          return null;
        }
        return {
          componentType: 'charm',
          charmId,
          uniqueId: index + 1
        };
      }
      return {
        componentType: 'stone',
        stoneId: String(item?.stoneId || item?.id || '').trim(),
        size: Number(item?.size || item?.sizeMm || order?.beadSize || State.beadSize),
        uniqueId: index + 1
      };
    }).filter(Boolean)).map((item, index) => ({
      ...item,
      uniqueId: index + 1
    }));
  }

  const loopItems = Array.isArray(decodedConfig?.l)
    ? decodedConfig.l.map((item, index) => {
      const itemType = String(item?.t || 'stone').trim().toLowerCase();
      if (itemType === 'empty') {
        return createEmptyLoopSlot(Number(item?.z || item?.l || order?.beadSize || State.beadSize), index + 1);
      }
      if (itemType === 'spacer') {
        return {
          componentType: 'spacer',
          spacerId: String(item?.i || '').trim(),
          uniqueId: index + 1
        };
      }
      if (itemType === 'charm') {
        return {
          componentType: 'charm',
          charmId: String(item?.i || '').trim(),
          uniqueId: index + 1
        };
      }
      return {
        componentType: 'stone',
        stoneId: String(item?.i || '').trim(),
        size: Number(item?.z || item?.l || order?.beadSize || State.beadSize),
        uniqueId: index + 1
      };
    })
    : null;

  if (loopItems?.length) {
    return normalizeSelectedLoopItems(loopItems).map((item, index) => ({
      ...item,
      uniqueId: index + 1
    }));
  }

  const billingLoopItems = Array.isArray(order?.itemizedBilling)
    ? order.itemizedBilling.flatMap((item) => {
      const itemType = String(item?.componentType || item?.type || 'stone').trim().toLowerCase();
      const quantity = Math.max(1, Number.parseInt(item?.quantity ?? item?.count ?? 1, 10) || 1);
      return Array.from({ length: quantity }, () => {
        if (itemType === 'spacer') {
          return {
            componentType: 'spacer',
            spacerId: String(item?.spacerId || item?.id || '').trim()
          };
        }
        if (itemType === 'charm') {
          const charmId = String(item?.charmId || item?.id || '').trim();
          const charm = getCharmCatalogEntry(charmId);
          if (charm && isAnchoredCharmType(charm.type)) {
            return null;
          }
          return {
            componentType: 'charm',
            charmId
          };
        }
        return {
          componentType: 'stone',
          stoneId: String(item?.stoneId || item?.id || '').trim(),
          size: Number(item?.size || item?.sizeMm || order?.beadSize || State.beadSize)
        };
      });
    }).filter(Boolean)
    : null;

  if (billingLoopItems?.length) {
    return normalizeSelectedLoopItems(billingLoopItems).map((item, index) => ({
      ...item,
      uniqueId: index + 1
    }));
  }

  const configuredStones = Array.isArray(decodedConfig?.s)
    ? decodedConfig.s.map((item, index) => ({
      componentType: 'stone',
      stoneId: String(item?.i || '').trim(),
      size: Number(item?.z || order?.beadSize || State.beadSize),
      uniqueId: index + 1
    }))
    : null;

  if (configuredStones?.length) {
    return normalizeSelectedLoopItems(configuredStones).map((item, index) => ({
      ...item,
      uniqueId: index + 1
    }));
  }

  const orderBeads = Array.isArray(order?.beads)
    ? order.beads.map((bead, index) => ({
      componentType: 'stone',
      stoneId: String(bead?.stoneId || bead?.id || '').trim(),
      size: Number(bead?.size || order?.beadSize || State.beadSize),
      uniqueId: index + 1
    }))
    : [];

  return normalizeSelectedLoopItems(orderBeads).map((item, index) => ({
    ...item,
    uniqueId: index + 1
  }));
}

function getOrderCharmIds(order, decodedConfig) {
  if (Array.isArray(order?.selectedCharms)) {
    const selectedCharmIds = order.selectedCharms
      .map((charm) => typeof charm === 'string' ? charm : charm?.id || charm?.charmId)
      .filter(Boolean);
    if (selectedCharmIds.length > 0) return selectedCharmIds;
  }
  if (Array.isArray(order?.charmIds)) return order.charmIds;
  if (Array.isArray(order?.braceletSequence)) {
    const sequenceCharmIds = order.braceletSequence
      .filter((item) => String(item?.componentType || item?.type || '').trim().toLowerCase() === 'charm')
      .map((item) => item?.charmId || item?.id)
      .filter(Boolean);
    if (sequenceCharmIds.length > 0) return sequenceCharmIds;
  }
  if (Array.isArray(order?.itemizedBilling)) {
    const billingCharmIds = order.itemizedBilling
      .filter((item) => String(item?.componentType || item?.type || '').trim().toLowerCase() === 'charm')
      .flatMap((item) => {
        const charmId = item?.charmId || item?.id;
        const quantity = Math.max(1, Number.parseInt(item?.quantity ?? item?.count ?? 1, 10) || 1);
        return charmId ? Array.from({ length: quantity }, () => charmId) : [];
      });
    if (billingCharmIds.length > 0) return billingCharmIds;
  }
  if (Array.isArray(decodedConfig?.c)) return decodedConfig.c;
  if (Array.isArray(order?.charms)) return order.charms.map((charm) => charm?.id || charm?.charmId);
  return order?.charmId ? [order.charmId] : [];
}

function hydrateStateFromOrder(order) {
  order = normalizeSavedOrder(order) || {};
  const decodedConfig = decodeOrderConfiguration(order?.configurationCode);
  const wristSize = Number(order?.wristSize ?? decodedConfig?.w);

  if (Number.isFinite(wristSize) && wristSize > 0) {
    State.wristSize = wristSize;
  }

  State.beadSize = normalizeBeadSizeOption(order?.beadSize || decodedConfig?.b || State.beadSize);
  State.mixedPlacingSize = getCurrentBeadSizeMm();
  State.ownerName = String(order?.customerName || decodedConfig?.n || State.ownerName || '').trim();
  State.lineUserId = typeof order?.lineUserId === 'string' ? order.lineUserId : State.lineUserId;
  State.shippingInfo = normalizeShippingInfo(order?.shippingInfo || {
    recipientName: order?.recipientName || '',
    phoneNumber: order?.phoneNumber || '',
    addressLine: order?.addressLine || '',
    province: order?.province || '',
    postalCode: order?.postalCode || ''
  });
  State.selectedCharmIds = normalizeSelectedCharmIds(getOrderCharmIds(order, decodedConfig));
  syncSelectedCharmState();
  State.selectedStones = buildLoopItemsFromOrder(order, decodedConfig);
  State.uniqueCounter = State.selectedStones.reduce(
    (maxId, item) => Math.max(maxId, Number(item.uniqueId) || 0),
    0
  );
  State.currentStep = 4;
  State.landingDismissed = true;
  State.orderDetailLoadError = '';
  State.orderDetailSnapshot = order;
  State.orderDetailMode = true;
  State.paymentCompletedView = isPaidOrder(order);
  State.checkoutSummarySnapshot = buildOrderDetailCheckoutSummary(order);

  if (DOM.braceletOwnerName) {
    DOM.braceletOwnerName.value = State.ownerName;
  }
}

async function loadOrderDetailFromUrlIfNeeded() {
  const orderId = getRequestedOrderId();
  if (!orderId) return false;

  State.currentStep = 4;
  State.landingDismissed = true;
  State.orderDetailSnapshot = null;
  State.orderDetailMode = true;
  State.paymentCompletedView = false;

  try {
    console.info(`[orders] direct detail requested ${orderId}`);
    const order = await findSavedOrderByRequestedId(orderId);
    console.info(`[orders] direct detail found ${orderId}: ${Boolean(order)}`);

    if (!order) {
      State.orderDetailLoadError = `We could not find order ${orderId}. Please check the link or contact Lucky Colorstone.`;
      return false;
    }

    hydrateStateFromOrder(order);
    return true;
  } catch (error) {
    console.error('Unable to load order detail from URL', error);
    State.orderDetailLoadError = `We could not load order ${orderId} right now. Please try again later.`;
    return false;
  }
}

// ==========================================
// 5. App Render Routing
// ==========================================
async function renderApp() {
  syncShellVisibility();
  renderStepper();
  await renderStepViews();
  saveState();
  persistLandingDismissed();
}

// Stepper bar rendering logic
function renderStepper() {
  // Update step node classes
  DOM.stepNodes.forEach((node, idx) => {
    const stepNum = idx + 1;
    node.className = 'step-node';
    if (stepNum < State.currentStep) {
      node.classList.add('completed');
      node.innerHTML = '&#10003;'; // Checkmark
    } else if (stepNum === State.currentStep) {
      node.classList.add('active');
      node.innerHTML = stepNum;
    } else {
      node.innerHTML = stepNum;
    }
  });

  // Calculate stepper line progress
  const progressPercent = ((State.currentStep - 1) / (DOM.stepNodes.length - 1)) * 100;
  DOM.stepProgressLine.style.width = `${progressPercent}%`;

  // Update text label above stepper
  const stepLabels = [
    "Step 1: Select Wrist Size",
    "Step 2: Bead Size Selection",
    "Step 3: Custom Bracelet Designer",
    "Step 4: Summary & Order"
  ];
  DOM.stepIndicatorLabel.innerText = stepLabels[State.currentStep - 1];
}

function getStep3ValidationState(resolvedLayout = createCurrentBraceletResolvedLayout()) {
  const {
    braceletLengthMm,
    charmFootprintMm,
    usableBeadLengthMm,
    stoneLengthMm,
    totalUsedLengthMm,
    uniformCapacity
  } = resolvedLayout.summary;
  const spaceLeftRaw = resolvedLayout.summary.spaceLeft;
  const remainingSpace = Math.max(0, spaceLeftRaw);
  const numPlaceholders = resolvedLayout.summary.numPlaceholders;
  const capacity = State.beadSize === 'mixed' ? null : uniformCapacity;
  const isOverflow = spaceLeftRaw < 0;
  const isFull = resolvedLayout.summary.placedCount > 0 && numPlaceholders === 0 && !isOverflow;

  return {
    braceletLengthMm,
    usableBeadLengthMm,
    charmFootprintMm,
    totalDiameter: stoneLengthMm,
    totalUsedLengthMm,
    spaceLeftRaw,
    remainingSpace,
    numPlaceholders,
    capacity,
    isOverflow,
    isFull,
    warningText: isFull ? '' : 'กรุณาเลือกหินให้เต็มวงกำไลก่อนดำเนินการต่อ'
  };
}

function ensureStep3WarningElement() {
  let warningEl = document.getElementById('step3NextWarning');
  if (warningEl) return warningEl;
  if (!DOM.appFooter) return null;

  warningEl = document.createElement('div');
  warningEl.id = 'step3NextWarning';
  warningEl.className = 'step3-next-warning';
  warningEl.setAttribute('aria-live', 'polite');
  warningEl.style.display = 'none';
  DOM.appFooter.appendChild(warningEl);
  return warningEl;
}

function syncStep3NextValidationUI(validationState = getStep3ValidationState()) {
  const warningEl = ensureStep3WarningElement();
  const isStep3 = State.currentStep === 3;

  if (DOM.appFooter) {
    DOM.appFooter.classList.toggle('step3-validation-active', isStep3 && !validationState.isFull);
  }

  if (!isStep3) {
    if (warningEl) {
      warningEl.textContent = '';
      warningEl.style.display = 'none';
    }
    return validationState;
  }

  DOM.btnNext.disabled = !validationState.isFull;

  if (warningEl) {
    warningEl.textContent = validationState.warningText;
    warningEl.style.display = validationState.isFull ? 'none' : 'block';
  }

  return validationState;
}

async function renderStepViews() {
  legacyCharmCatalogCache = await getLegacyCharmCatalog();
  migrateSlotPlaceableCharmSelectionsIntoLoop();
  State.selectedStones = normalizeSelectedLoopItems(State.selectedStones);
  syncSelectedCharmState();

  DOM.stepViews.forEach((view, idx) => {
    const stepNum = idx + 1;
    if (stepNum === State.currentStep) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  // Render specific step data
  if (State.currentStep === 1) {
    renderStep1();
  } else if (State.currentStep === 2) {
    renderStep2();
  } else if (State.currentStep === 3) {
    renderStep3();
  } else if (State.currentStep === 4) {
    await renderStep4();
    if (State.orderDetailLoadError) {
      return;
    }
  }

  if (State.currentStep !== 3 && DOM.charmSectionMount) {
    DOM.charmSectionMount.innerHTML = '';
  }

  if (State.currentStep !== 3) {
    if (DOM.appFooter) {
      DOM.appFooter.style.display = 'flex';
    }
    syncStep3NextValidationUI({
      isFull: true,
      warningText: ''
    });
  }

  configureFooterNavigation();
}

// Navigate to step
async function goToStep(step) {
  if (step < 1 || step > 4) return;
  State.currentStep = step;
  await renderApp();
}

function configureFooterNavigation() {
  if (DOM.appFooter) {
    DOM.appFooter.style.display = 'flex';
  }

  DOM.btnBack.style.display = '';
  DOM.btnBack.style.visibility = State.currentStep === 1 ? 'hidden' : 'visible';
  DOM.btnNext.disabled = false;

  if (State.currentStep === 1 || State.currentStep === 2) {
    DOM.btnNext.innerHTML = `ถัดไป &nbsp;
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6"/>
      </svg>`;
    DOM.btnNext.className = 'footer-btn btn-next';
    return;
  }

  if (State.currentStep === 3) {
    const validationState = syncStep3NextValidationUI();
    if (DOM.appFooter) {
      DOM.appFooter.style.display = validationState.isFull ? 'flex' : 'none';
    }
    DOM.btnBack.style.display = 'none';
    DOM.btnNext.className = 'footer-btn btn-next';
    DOM.btnNext.innerHTML = `ถัดไป &nbsp;
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6"/>
      </svg>`;
    return;
  }

  if (State.currentStep === 4) {
    if (State.paymentCompletedView) {
      DOM.btnBack.style.display = 'none';
      DOM.btnBack.style.visibility = 'hidden';
      DOM.btnNext.className = 'footer-btn btn-paid-complete';
      DOM.btnNext.disabled = true;
      DOM.btnNext.innerHTML = `การชำระเงินเสร็จสิ้น &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>`;
      return;
    }

    if (State.orderDetailMode) {
      DOM.btnBack.style.display = '';
      DOM.btnBack.style.visibility = 'visible';
      DOM.btnNext.className = 'footer-btn btn-paid-complete';
      DOM.btnNext.disabled = true;
      DOM.btnNext.innerHTML = `รายละเอียดคำสั่งซื้อ &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>`;
      return;
    }

    DOM.btnBack.style.display = '';
    DOM.btnBack.style.visibility = 'visible';
    DOM.btnNext.className = 'footer-btn btn-order';
    DOM.btnNext.innerHTML = `ชำระเงิน &nbsp;
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 7h20"/>
        <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>
        <path d="M16 15h2"/>
      </svg>`;
  }
}

// Setup Back/Next Events
function setupNavigationEvents() {
  DOM.btnBack.addEventListener('click', async () => {
    await goToStep(State.currentStep - 1);
  });
  
  DOM.btnNext.addEventListener('click', async () => {
    if (State.currentStep === 4) {
      if (State.orderDetailMode || State.paymentCompletedView) return;
      await handleStripeCheckout();
    } else {
      if (State.currentStep === 3) {
        const validationState = syncStep3NextValidationUI();
        if (!validationState.isFull) return;
      }
      await goToStep(State.currentStep + 1);
    }
  });

  // Home Button clicks
  const goHome = async (e) => {
    e.preventDefault();
    if (confirm("Go back to Step 1? Your current design will be saved.")) {
      await goToStep(1);
    }
  };
  DOM.btnHome.addEventListener('click', goHome);
  DOM.headerLogo.addEventListener('click', goHome);

  // CRM Sandbox direct submit button
  const btnSubmitCRM = document.getElementById('btnSubmitCRM');
  if (btnSubmitCRM) {
    btnSubmitCRM.addEventListener('click', () => {
      submitOrderToCRM();
    });
  }

  if (DOM.btnPayWithStripe) {
    DOM.btnPayWithStripe.addEventListener('click', async () => {
      await handleStripeCheckout();
    });
  }
}

function clearShippingValidation() {
  if (DOM.shippingValidationMessage) {
    DOM.shippingValidationMessage.textContent = '';
    DOM.shippingValidationMessage.hidden = true;
  }

  SHIPPING_FIELD_CONFIG.forEach(({ domKey }) => {
    const input = DOM[domKey];
    if (input) {
      input.classList.remove('is-invalid');
    }
  });
}

function updateShippingField(key, value) {
  State.shippingInfo = {
    ...normalizeShippingInfo(State.shippingInfo),
    [key]: value
  };
  saveState();
}

function renderShippingForm() {
  const shippingInfo = getShippingInfoSnapshot();

  SHIPPING_FIELD_CONFIG.forEach(({ key, domKey }) => {
    const input = DOM[domKey];
    if (input && input.value !== shippingInfo[key]) {
      input.value = shippingInfo[key];
    }
  });

  clearShippingValidation();
}

function validateShippingInfo() {
  const shippingInfo = getShippingInfoSnapshot({ trimValues: true });
  const missingFields = SHIPPING_FIELD_CONFIG.filter(({ key }) => !shippingInfo[key]);

  clearShippingValidation();

  if (missingFields.length === 0) {
    State.shippingInfo = shippingInfo;
    saveState();
    return shippingInfo;
  }

  const message = `กรุณากรอกข้อมูลสำหรับจัดส่งให้ครบ: ${missingFields.map(({ label }) => label).join(', ')}`;
  if (DOM.shippingValidationMessage) {
    DOM.shippingValidationMessage.textContent = message;
    DOM.shippingValidationMessage.hidden = false;
  }

  missingFields.forEach(({ domKey }) => {
    const input = DOM[domKey];
    if (input) {
      input.classList.add('is-invalid');
    }
  });

  const firstMissingInput = DOM[missingFields[0].domKey];
  if (firstMissingInput) {
    firstMissingInput.focus();
    firstMissingInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showToast(message);
  return null;
}

function setupShippingFormEvents() {
  SHIPPING_FIELD_CONFIG.forEach(({ key, domKey }) => {
    const input = DOM[domKey];
    if (!input) return;

    input.addEventListener('input', () => {
      updateShippingField(key, input.value);
      if (DOM.shippingValidationMessage && !DOM.shippingValidationMessage.hidden) {
        clearShippingValidation();
      }
    });

    input.addEventListener('blur', () => {
      updateShippingField(key, input.value.trim());
      renderShippingForm();
    });
  });
}

// ==========================================
// 6. Step 1: Wrist Size Logic
// ==========================================
function initWristSizeGrid() {
  document.querySelectorAll('[data-wrist-offset]').forEach((button) => {
    button.addEventListener('click', () => {
      const offset = Number(button.getAttribute('data-wrist-offset'));
      const nextSize = getWristSizeByOffset(offset);
      if (nextSize != null) {
        setWristSize(nextSize);
      }
    });
  });

  document.getElementById('wristSizePrev')?.addEventListener('click', () => {
    const nextSize = getWristSizeByOffset(-1);
    if (nextSize != null) {
      setWristSize(nextSize);
    }
  });

  document.getElementById('wristSizeNext')?.addEventListener('click', () => {
    const nextSize = getWristSizeByOffset(1);
    if (nextSize != null) {
      setWristSize(nextSize);
    }
  });

  setupWristWheelDrag();
  
  DOM.braceletOwnerName.addEventListener('input', (e) => {
    State.ownerName = e.target.value.trim();
    saveState();
  });
}

function getCurrentWristSizeIndex() {
  return WRIST_SIZES.findIndex((size) => size === State.wristSize);
}

function getWristSizeByOffset(offset) {
  const currentIndex = getCurrentWristSizeIndex();
  if (currentIndex < 0) return null;
  return WRIST_SIZES[currentIndex + offset] ?? null;
}

function setWristSize(size) {
  if (!WRIST_SIZES.includes(size) || State.wristSize === size) return;

  State.wristSize = size;
  syncWristSizeDisplay();

  // Save owner name
  State.ownerName = DOM.braceletOwnerName.value.trim();

  saveState();
  updateEstimationText();

  // If uniform bead size was set, we might need to adjust selectedStones loop capacity
  if (State.beadSize !== 'mixed') {
    adjustBeadsToNewCapacity();
  }
}

function moveWristSizeByOffset(offset) {
  const nextSize = getWristSizeByOffset(offset);
  if (nextSize != null) {
    setWristSize(nextSize);
  }
}

function setupWristWheelDrag() {
  const wheel = document.getElementById('wristWheelDisplay');
  if (!wheel || wheel.dataset.dragReady === 'true') return;

  const swipeThresholdPx = 24;
  let isDragging = false;
  let lastY = 0;

  const applyDragDelta = (currentY) => {
    const deltaY = currentY - lastY;
    if (Math.abs(deltaY) < swipeThresholdPx) return;

    moveWristSizeByOffset(deltaY < 0 ? 1 : -1);
    lastY = currentY;
  };

  wheel.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    isDragging = true;
    lastY = event.clientY;
    wheel.classList.add('is-dragging');
    wheel.setPointerCapture?.(event.pointerId);
  });

  wheel.addEventListener('pointermove', (event) => {
    if (!isDragging) return;
    event.preventDefault();
    applyDragDelta(event.clientY);
  });

  const stopDrag = (event) => {
    if (!isDragging) return;
    isDragging = false;
    wheel.classList.remove('is-dragging');
    wheel.releasePointerCapture?.(event.pointerId);
  };

  wheel.addEventListener('pointerup', stopDrag);
  wheel.addEventListener('pointercancel', stopDrag);
  wheel.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) < 10) return;
    event.preventDefault();
    moveWristSizeByOffset(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  wheel.dataset.dragReady = 'true';
}

function renderStep1() {
  syncWristSizeDisplay();
  DOM.braceletOwnerName.value = State.ownerName;
}

function syncWristSizeDisplay() {
  if (DOM.visualWristSizeText) {
    DOM.visualWristSizeText.textContent = `${State.wristSize.toFixed(1)} cm`;
  }
  if (DOM.displaySizeValue) {
    DOM.displaySizeValue.textContent = State.wristSize.toFixed(1);
  }
  document.querySelectorAll('[data-wrist-offset]').forEach((button) => {
    const offset = Number(button.getAttribute('data-wrist-offset'));
    const nextSize = getWristSizeByOffset(offset);
    button.textContent = nextSize == null ? '' : nextSize.toFixed(1);
    button.disabled = nextSize == null;
    button.setAttribute('aria-hidden', nextSize == null ? 'true' : 'false');
  });

  const prevButton = document.getElementById('wristSizePrev');
  const nextButton = document.getElementById('wristSizeNext');
  if (prevButton) {
    prevButton.disabled = getWristSizeByOffset(-1) == null;
  }
  if (nextButton) {
    nextButton.disabled = getWristSizeByOffset(1) == null;
  }
}

// ==========================================
// 7. Step 2: Bead Size Logic
// ==========================================
function initBeadSizeOptions() {
  DOM.beadSizeCards.forEach(card => {
    card.addEventListener('click', () => {
      const targetBeadSize = normalizeBeadSizeOption(card.getAttribute('data-bead-size'));
      
      if (State.beadSize === targetBeadSize) return;

      State.beadSize = targetBeadSize;
      State.mixedPlacingSize = getCurrentBeadSizeMm();
      
      DOM.beadSizeCards.forEach(c => {
        if (c.getAttribute('data-bead-size') === State.beadSize) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
      
      updateEstimationText();
      
      if (State.selectedStones.length > 0) {
        const newSize = getCurrentBeadSizeMm();
        State.selectedStones.forEach((item) => {
          if (isEmptyLoopSlot(item) || isSelectedSpacerItem(item) || isSelectedCharmItem(item)) return;
          item.size = newSize;
        });
        adjustBeadsToNewCapacity();
      }
      
      saveState();
    });
  });
}

function updateEstimationText() {
  if (!DOM.estimationWristSizeText && !DOM.estimationLengthText && !DOM.estimationCapacityText) {
    return;
  }

  const capacityMetrics = getCurrentBraceletCapacityMetrics();
  const braceletLenMm = capacityMetrics.braceletLengthMm;
  if (DOM.estimationWristSizeText) {
    DOM.estimationWristSizeText.textContent = `${State.wristSize.toFixed(1)} cm`;
  }
  if (DOM.estimationLengthText) {
    DOM.estimationLengthText.textContent = `${(State.wristSize + TOLERANCE_CM).toFixed(1)} cm (${braceletLenMm}mm)`;
  }
  
  const size = getCurrentBeadSizeMm();
  const capacity = capacityMetrics.uniformCapacity ?? Math.floor(capacityMetrics.usableBeadLengthMm / size);
  if (DOM.estimationCapacityText) {
    DOM.estimationCapacityText.textContent = `Fits approximately ${capacity} beads (${size}mm).`;
  }
}

function adjustBeadsToNewCapacity() {
  const { usableBeadLengthMm } = getCurrentBraceletCapacityMetrics();
  let usedLengthMm = 0;
  let keptCount = 0;

  for (const item of State.selectedStones) {
    const itemLengthMm = getLoopItemLengthMm(item);
    if ((usedLengthMm + itemLengthMm) > usableBeadLengthMm + 1.0) {
      break;
    }
    usedLengthMm += itemLengthMm;
    keptCount += 1;
  }

  if (keptCount < State.selectedStones.length) {
    State.selectedStones = State.selectedStones.slice(0, keptCount);
    State.activeSlotIndex = null;
    showToast(`Removed trailing components to fit new size capacity.`);
  }
}

function renderStep2() {
  DOM.beadSizeCards.forEach(c => {
    if (c.getAttribute('data-bead-size') === State.beadSize) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
  updateEstimationText();
}

function initCharmSelection() {
  // Charm cards attach their own click handlers when rendered.
  // Avoid duplicate selection by not binding a second delegated listener here.
}

function formatDisplayPrice(value) {
  return `฿${Number(value || 0).toLocaleString()}`;
}

function buildStoneCard({
  rootTag = 'div',
  dataAttributeName,
  dataAttributeValue,
  image,
  imageAlt,
  imageClassName = 'stone-img',
  imageStyle = null,
  mediaLabel = '',
  nameTh,
  nameEn,
  priceText,
  isSelected = false,
  selectedClassName = 'selected',
  onCardClick = null,
  onInfoClick = null,
  onActionClick = null,
  actionText = '+',
  actionTitle = '',
  actionAriaLabel = ''
}) {
  const card = document.createElement(rootTag);
  card.className = `stone-card${isSelected ? ` ${selectedClassName}` : ''}`;

  if (rootTag === 'button') {
    card.type = 'button';
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  }

  if (dataAttributeName) {
    card.setAttribute(`data-${dataAttributeName}`, dataAttributeValue ?? '');
  }

  if (onInfoClick) {
    const infoBtn = document.createElement('button');
    infoBtn.className = 'info-icon-btn';
    infoBtn.type = 'button';
    infoBtn.innerHTML = 'i';
    infoBtn.title = 'View Information';
    infoBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      onInfoClick();
    });
    card.appendChild(infoBtn);
  }

  const imgCont = document.createElement('div');
  imgCont.className = 'stone-img-container';

  if (image) {
    const img = document.createElement('img');
    img.src = withCatalogImageVersion(image);
    img.alt = imageAlt;
    img.className = imageClassName;
    if (imageStyle && typeof imageStyle === 'object') {
      Object.entries(imageStyle).forEach(([property, value]) => {
        img.style.setProperty(property, value);
      });
    }
    imgCont.appendChild(img);
  } else if (mediaLabel) {
    const label = document.createElement('span');
    label.className = 'stone-card-media-label';
    label.textContent = mediaLabel;
    imgCont.appendChild(label);
  }

  card.appendChild(imgCont);

  const details = document.createElement('div');
  details.className = 'stone-details';

  const thName = document.createElement('div');
  thName.className = 'stone-name-th';
  thName.textContent = nameTh;
  details.appendChild(thName);

  const enName = document.createElement('div');
  enName.className = 'stone-name-en';
  enName.textContent = nameEn;
  details.appendChild(enName);

  const priceRow = document.createElement('div');
  priceRow.className = 'stone-price-row';

  const priceTag = document.createElement('div');
  priceTag.className = 'stone-price-tag';
  priceTag.textContent = priceText;
  priceRow.appendChild(priceTag);

  if (onActionClick) {
    const actionBtn = document.createElement('button');
    actionBtn.className = `stone-add-btn${isSelected ? ' selected' : ''}`;
    actionBtn.type = 'button';
    actionBtn.innerHTML = actionText;
    if (actionTitle) actionBtn.title = actionTitle;
    if (actionAriaLabel) actionBtn.setAttribute('aria-label', actionAriaLabel);
    actionBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      onActionClick();
    });
    priceRow.appendChild(actionBtn);
  }

  details.appendChild(priceRow);
  card.appendChild(details);

  if (onCardClick) {
    card.addEventListener('click', onCardClick);
  }

  return card;
}

function getVisibleCharmCatalog() {
  return legacyCharmCatalogCache.filter((charm) => (
    charm &&
    charm.isActive !== false &&
    charm.inStock !== false &&
    charm.image &&
    charm.image !== CHARM_PLACEHOLDER_IMAGE
  ));
}

function getCharmCatalogThumbnailTargetRatio(charms = []) {
  const visibleRatios = charms
    .map((charm) => {
      const imageUrl = charm?.image || '';
      const bounds = imageUrl ? charmVisibleBoundsCache.get(imageUrl) : null;
      if (!bounds?.sourceWidth || !bounds?.sourceHeight) return null;
      return Math.max(bounds.width / bounds.sourceWidth, bounds.height / bounds.sourceHeight);
    })
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
    .sort((a, b) => a - b);

  if (visibleRatios.length === 0) return 0.8;
  const middleIndex = Math.floor(visibleRatios.length / 2);
  if (visibleRatios.length % 2 === 1) {
    return visibleRatios[middleIndex];
  }
  return (visibleRatios[middleIndex - 1] + visibleRatios[middleIndex]) / 2;
}

function getCharmCardThumbnailStyle(charm, targetVisibleRatio = 0.8) {
  const imageUrl = charm?.image || '';
  const bounds = imageUrl ? charmVisibleBoundsCache.get(imageUrl) : null;
  if (!bounds?.sourceWidth || !bounds?.sourceHeight) return null;

  const dominantRatio = Math.max(bounds.width / bounds.sourceWidth, bounds.height / bounds.sourceHeight);
  if (!Number.isFinite(dominantRatio) || dominantRatio <= 0) return null;

  const scale = Math.max(0.92, Math.min(1.18, targetVisibleRatio / dominantRatio));
  return {
    '--charm-thumb-scale': scale.toFixed(3)
  };
}

function getCharmDisplayMeta(charm) {
  const overrides = {
    tg02: {
      nameTh: '\u0E15\u0E30\u0E01\u0E23\u0E38\u0E14\u0E1E\u0E23\u0E30\u0E1E\u0E34\u0E06\u0E40\u0E19\u0E28 \u0E17\u0E2D\u0E07',
      nameEn: 'Takrud Ganesha Gold'
    },
    tl01: {
      nameTh: '\u0E15\u0E30\u0E01\u0E23\u0E38\u0E14\u0E1E\u0E23\u0E30\u0E25\u0E31\u0E01\u0E29\u0E21\u0E35 \u0E17\u0E2D\u0E07',
      nameEn: 'Takrud Lakshmi Gold'
    }
  };

  return {
    nameTh: overrides[charm.id]?.nameTh || charm.nameTh,
    nameEn: overrides[charm.id]?.nameEn || charm.nameEn
  };
}

function getSelectedCharmCatalogEntry() {
  return getSelectedCharmCatalogEntries()[0] || null;
}

function getSelectedAnchoredCharmCatalogEntries() {
  const selectedIds = normalizeSelectedCharmIds(State.selectedCharmIds);
  if (selectedIds.length === 0) return [];

  const visibleCharms = applyCatalogLayoutOrder(getVisibleCharmCatalog(), 'charms');
  const charmMap = new Map(visibleCharms.map((charm) => [charm.id, charm]));
  return selectedIds
    .map((charmId, selectionIndex) => {
      const charm = charmMap.get(charmId);
      if (!charm) return null;
      return {
        ...charm,
        selectionIndex,
        charmInstanceKey: `${charmId}_${selectionIndex}`
      };
    })
    .filter((charm) => charm && isAnchoredCharmType(charm.type));
}

function getSelectedCharmCatalogEntries() {
  const anchoredCharms = getSelectedAnchoredCharmCatalogEntries();
  const loopCharms = getSelectedLoopCharmItems().map((charm) => ({
    ...charm,
    selectionIndex: anchoredCharms.length + charm.sourceIndex,
    charmInstanceKey: `loop_${charm.id}_${charm.uniqueId}`
  }));

  return anchoredCharms
    .concat(loopCharms)
    .filter(Boolean);
}

function getSelectedCharmFootprintMm() {
  return getSelectedAnchoredCharmCatalogEntries().reduce((sum, charm) => sum + getCharmFootprintMm(charm), 0);
}

function getBraceletLengthMm() {
  return (State.wristSize + TOLERANCE_CM) * 10;
}

function getCharmFootprintMm(charm) {
  if (!charm) return 0;
  const explicitFootprintMm = Number(charm.footprintMm);
  if (Number.isFinite(explicitFootprintMm) && explicitFootprintMm > 0) {
    return explicitFootprintMm;
  }
  if (typeof charm.sizeCm !== 'number') return 0;
  return charm.sizeCm * 10;
}

const DEFAULT_CHARM_RENDER_TUNING = Object.freeze({
  visualScale: 0.9,
  visualOffsetX: 0,
  visualOffsetY: 0,
  maxWidthRatio: 1,
  maxHeightRatio: 0.92,
  edgeFitMode: 'contain',
  targetWidthFillRatio: 1,
  contactInsetLeft: 0,
  contactInsetRight: 0,
  rotation: 0,
  anchor: 'top'
});

function normalizeCharmVisualScale(value) {
  const fallback = DEFAULT_CHARM_RENDER_TUNING.visualScale;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(1, Math.max(0.1, numericValue));
}

function normalizeCharmVisualOffset(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(-0.5, Math.min(0.5, numericValue));
}

function normalizeCharmMaxRatio(value, fallback = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(1, Math.max(0.4, numericValue));
}

function normalizeCharmEdgeFitMode(value) {
  return value === 'horizontal_fill' ? 'horizontal_fill' : DEFAULT_CHARM_RENDER_TUNING.edgeFitMode;
}

function normalizeCharmTargetWidthFillRatio(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_CHARM_RENDER_TUNING.targetWidthFillRatio;
  return Math.min(1.1, Math.max(0.5, numericValue));
}

function normalizeCharmContactInset(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(0.4, Math.max(0, numericValue));
}

function normalizeCharmRotation(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeCharmAnchor(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : DEFAULT_CHARM_RENDER_TUNING.anchor;
}

function resolveCharmRenderTuning(source = null) {
  const tuningSource = source || {};
  return {
    visualScale: normalizeCharmVisualScale(tuningSource.visualScale),
    visualOffsetX: normalizeCharmVisualOffset(tuningSource.visualOffsetX),
    visualOffsetY: normalizeCharmVisualOffset(tuningSource.visualOffsetY),
    maxWidthRatio: normalizeCharmMaxRatio(tuningSource.maxWidthRatio, DEFAULT_CHARM_RENDER_TUNING.maxWidthRatio),
    maxHeightRatio: normalizeCharmMaxRatio(tuningSource.maxHeightRatio, DEFAULT_CHARM_RENDER_TUNING.maxHeightRatio),
    edgeFitMode: normalizeCharmEdgeFitMode(tuningSource.edgeFitMode),
    targetWidthFillRatio: normalizeCharmTargetWidthFillRatio(tuningSource.targetWidthFillRatio),
    contactInsetLeft: normalizeCharmContactInset(tuningSource.contactInsetLeft),
    contactInsetRight: normalizeCharmContactInset(tuningSource.contactInsetRight),
    rotation: normalizeCharmRotation(tuningSource.rotation),
    anchor: normalizeCharmAnchor(tuningSource.anchor)
  };
}

function getUsableBeadLengthMm() {
  return Math.max(0, getBraceletLengthMm() - getSelectedCharmFootprintMm());
}

function createBraceletCapacityMetrics(braceletConfig, braceletComponentList) {
  const loopComponents = braceletComponentList.filter((component) => component.layoutRole === 'loop');
  const anchoredCharmFootprintMm = loopComponents
    .filter((component) => component.type === 'charm' && isAnchoredCharmType(component.charmType))
    .reduce((sum, component) => sum + (component.footprintMm || component.sizeMm || 0), 0);
  const sequencedLengthMm = loopComponents
    .filter((component) => component.type !== 'charm' || isSlotPlaceableCharmType(component.charmType))
    .reduce((sum, component) => sum + component.sizeMm, 0);
  const totalUsedLengthMm = anchoredCharmFootprintMm + sequencedLengthMm;
  const braceletLengthMm = braceletConfig.braceletLengthMm;
  const usableBeadLengthMm = Math.max(0, braceletLengthMm - anchoredCharmFootprintMm);
  const remainingLengthMm = braceletLengthMm - totalUsedLengthMm;
  const uniformCapacity = braceletConfig.beadSizeMode === 'mixed'
    ? null
    : Math.floor(usableBeadLengthMm / braceletConfig.placingSizeMm);

  return {
    braceletLengthMm,
    charmFootprintMm: anchoredCharmFootprintMm,
    stoneLengthMm: sequencedLengthMm,
    totalUsedLengthMm,
    usableBeadLengthMm,
    remainingLengthMm,
    uniformCapacity,
    loopComponents
  };
}

function getCurrentBraceletCapacityMetrics() {
  return createBraceletCapacityMetrics(createBraceletConfig(), createBraceletComponentList());
}

function applySelectedCharm(charmId) {
  const nextCharmId = String(charmId || '').trim();
  const currentCharmIds = normalizeSelectedCharmIds(State.selectedCharmIds);
  const currentLoopCharms = getSelectedLoopCharmItems();

  if (!nextCharmId) {
    if (currentCharmIds.length === 0 && currentLoopCharms.length === 0) return;
    State.selectedCharmIds = [];
    State.selectedStones = State.selectedStones.map((item) => (
      isSelectedCharmItem(item)
        ? createEmptyLoopSlot(getLoopItemLengthMm(item), item?.uniqueId || null)
        : item
    ));
    syncSelectedCharmState();
    State.activeSlotIndex = null;
    adjustBeadsToNewCapacity();
    saveState();
    updateEstimationText();
    renderCharmOptions();

    if (State.currentStep === 3) {
      renderStep3();
      syncStep3NextValidationUI();
    }
    return;
  }

  const selectedCharm = getVisibleCharmCatalog().find((charm) => charm.id === nextCharmId);
  if (!selectedCharm) return;

  if (isSlotPlaceableCharmType(selectedCharm.type)) {
    if (currentLoopCharms.length >= 2) {
      showToast('You can select up to 2 Bee Heart charms.');
      return;
    }

    State.uniqueCounter += 1;
    const loopCharm = createCharmSelectionItem(selectedCharm.id, State.uniqueCounter);
    if (!loopCharm) return;
    const itemLabel = getCharmDisplayMeta(selectedCharm).nameEn || selectedCharm.nameEn || 'Bee Heart';
    const added = addLoopItemToBracelet(loopCharm, itemLabel, getCharmFootprintMm(selectedCharm));
    if (added) {
      updateEstimationText();
      renderCharmOptions();
    }
    return;
  }

  if (currentCharmIds.length >= 2) {
    showToast('You can select up to 2 anchored charms.');
    return;
  }

  if (currentCharmIds.length === 0) {
    State.selectedCharmIds = [nextCharmId];
  } else if (currentCharmIds.length === 1) {
    State.selectedCharmIds = [currentCharmIds[0], nextCharmId];
  } else {
    State.selectedCharmIds = [currentCharmIds[0], nextCharmId];
  }
  syncSelectedCharmState();
  adjustBeadsToNewCapacity();
  saveState();
  updateEstimationText();
  renderCharmOptions();

  if (State.currentStep === 3) {
    renderStep3();
    syncStep3NextValidationUI();
  }
}

function buildSelectedCharmOrderData() {
  const selectedCharms = getSelectedCharmCatalogEntries();
  if (selectedCharms.length === 0) {
    return {
      hasCharm: false,
      charmCount: 0,
      charmIds: [],
      charms: [],
      charmId: null,
      charmSku: null,
      charmNameTh: null,
      charmNameEn: null,
      charmType: null,
      charmSizeCm: null,
      charmPrice: 0,
      charmImage: null
    };
  }

  const charms = selectedCharms.map((charm) => {
    const charmMeta = getCharmDisplayMeta(charm);
    return {
      id: charm.id,
      selectionIndex: charm.selectionIndex,
      charmInstanceKey: charm.charmInstanceKey,
      sku: charm.sku || null,
      nameTh: charmMeta.nameTh,
      nameEn: charmMeta.nameEn,
      type: charm.type || null,
      sizeCm: charm.sizeCm || null,
      price: Number(charm.price || 0),
      image: charm.image || null,
      meaningTh: charm.meaningTh || '',
      meaningEn: charm.meaningEn || ''
    };
  });
  const primaryCharm = charms[0];
  return {
    hasCharm: true,
    charmCount: charms.length,
    charmIds: charms.map((charm) => charm.id),
    charms,
    charmId: primaryCharm.id,
    charmSku: primaryCharm.sku,
    charmNameTh: primaryCharm.nameTh,
    charmNameEn: primaryCharm.nameEn,
    charmType: primaryCharm.type,
    charmSizeCm: primaryCharm.sizeCm,
    charmPrice: primaryCharm.price,
    charmImage: primaryCharm.image
  };
}

function buildSelectedSpacerOrderData() {
  const selectedSpacers = getSelectedSpacerItems();
  if (selectedSpacers.length === 0) {
    return {
      hasSpacer: false,
      spacerCount: 0,
      spacerIds: [],
      spacers: []
    };
  }

  return {
    hasSpacer: true,
    spacerCount: selectedSpacers.length,
    spacerIds: selectedSpacers.map((spacer) => spacer.id),
    spacers: selectedSpacers.map((spacer) => ({
      spacerId: spacer.id,
      nameTh: spacer.nameTh,
      nameEn: spacer.nameEn,
      type: spacer.type,
      color: spacer.color,
      image: spacer.image,
      price: Number(spacer.price || 0),
      displaySizeMm: spacer.displaySizeMm,
      effectiveLengthMm: spacer.effectiveLengthMm,
      thicknessMm: spacer.thicknessMm || null
    }))
  };
}

function cloneCheckoutValue(value) {
  try {
    return JSON.parse(JSON.stringify(value, (_key, currentValue) => {
      if (currentValue instanceof Set) return Array.from(currentValue);
      if (currentValue instanceof Map) return Object.fromEntries(currentValue);
      return currentValue;
    }));
  } catch (error) {
    return value;
  }
}

function normalizeUniqueStoneIds(uniqueStoneIds) {
  let candidateIds = [];

  if (Array.isArray(uniqueStoneIds)) {
    candidateIds = uniqueStoneIds;
  } else if (uniqueStoneIds instanceof Set) {
    candidateIds = Array.from(uniqueStoneIds);
  } else if (uniqueStoneIds instanceof Map) {
    candidateIds = Array.from(uniqueStoneIds.keys());
  } else if (uniqueStoneIds && typeof uniqueStoneIds === 'object') {
    const stringValues = Object.values(uniqueStoneIds)
      .filter((value) => typeof value === 'string' && value.trim());
    candidateIds = stringValues.length > 0
      ? stringValues
      : Object.keys(uniqueStoneIds).filter((key) => uniqueStoneIds[key]);
  }

  const seenIds = new Set();
  return candidateIds
    .map((id) => String(id || '').trim())
    .filter((id) => {
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return STONES.some((stone) => stone.id === id);
    });
}

function isCheckoutCharmItem(item) {
  return String(item?.componentType || item?.type || '').trim().toLowerCase() === 'charm';
}

function isCheckoutSpacerItem(item) {
  return String(item?.componentType || item?.type || '').trim().toLowerCase() === 'spacer';
}

function buildCharmOrderDataFromItems(items = []) {
  const charms = items
    .filter(isCheckoutCharmItem)
    .flatMap((item, sourceIndex) => {
      const charmId = String(item?.charmId || item?.id || '').trim();
      if (!charmId) return [];
      const quantity = Math.max(1, Number.parseInt(item?.quantity ?? item?.count ?? 1, 10) || 1);
      return Array.from({ length: quantity }, (_, quantityIndex) => {
        const catalogCharm = getCharmCatalogEntry(charmId);
        const charmMeta = catalogCharm ? getCharmDisplayMeta(catalogCharm) : {};
        return {
          id: charmId,
          selectionIndex: sourceIndex + quantityIndex,
          charmInstanceKey: item?.charmInstanceKey || `${charmId}_${sourceIndex}_${quantityIndex}`,
          sku: item?.sku || catalogCharm?.sku || null,
          nameTh: item?.nameTh || charmMeta.nameTh || catalogCharm?.nameTh || '',
          nameEn: item?.nameEn || charmMeta.nameEn || catalogCharm?.nameEn || '',
          type: item?.type || item?.charmType || catalogCharm?.type || null,
          sizeCm: Number(item?.sizeCm || catalogCharm?.sizeCm || 0) || null,
          price: Number(item?.unitPrice ?? item?.price ?? item?.totalPrice ?? catalogCharm?.price ?? 0),
          image: item?.image || catalogCharm?.image || null,
          meaningTh: item?.meaningTh || catalogCharm?.meaningTh || '',
          meaningEn: item?.meaningEn || catalogCharm?.meaningEn || ''
        };
      });
    });

  if (charms.length === 0) {
    return buildSelectedCharmOrderData();
  }

  const primaryCharm = charms[0];
  return {
    hasCharm: true,
    charmCount: charms.length,
    charmIds: charms.map((charm) => charm.id),
    charms,
    charmId: primaryCharm.id,
    charmSku: primaryCharm.sku,
    charmNameTh: primaryCharm.nameTh,
    charmNameEn: primaryCharm.nameEn,
    charmType: primaryCharm.type,
    charmSizeCm: primaryCharm.sizeCm,
    charmPrice: primaryCharm.price,
    charmImage: primaryCharm.image
  };
}

function buildSpacerOrderDataFromItems(items = []) {
  const spacers = items
    .filter(isCheckoutSpacerItem)
    .flatMap((item) => {
      const spacerId = String(item?.spacerId || item?.id || '').trim();
      if (!spacerId) return [];
      const quantity = Math.max(1, Number.parseInt(item?.quantity ?? item?.count ?? 1, 10) || 1);
      return Array.from({ length: quantity }, () => ({
        spacerId,
        nameTh: item?.nameTh || '',
        nameEn: item?.nameEn || '',
        type: item?.type || null,
        color: item?.color || '',
        image: item?.image || '',
        price: Number(item?.unitPrice ?? item?.price ?? 0),
        displaySizeMm: item?.displaySizeMm || item?.size || null,
        effectiveLengthMm: item?.effectiveLengthMm || item?.size || null,
        thicknessMm: item?.thicknessMm || null
      }));
    });

  if (spacers.length === 0) {
    return buildSelectedSpacerOrderData();
  }

  return {
    hasSpacer: true,
    spacerCount: spacers.length,
    spacerIds: spacers.map((spacer) => spacer.spacerId),
    spacers
  };
}

function buildCharmOrderDataFromSavedCharms(charms = []) {
  const normalizedCharms = charms
    .map((charm, index) => {
      const charmId = String(charm?.id || charm?.charmId || '').trim();
      if (!charmId) return null;
      const catalogCharm = getCharmCatalogEntry(charmId);
      const charmMeta = catalogCharm ? getCharmDisplayMeta(catalogCharm) : {};
      return {
        id: charmId,
        selectionIndex: Number.isFinite(Number(charm?.selectionIndex)) ? Number(charm.selectionIndex) : index,
        charmInstanceKey: charm?.charmInstanceKey || `${charmId}_${index}`,
        sku: charm?.sku || catalogCharm?.sku || null,
        nameTh: charm?.nameTh || charmMeta.nameTh || catalogCharm?.nameTh || '',
        nameEn: charm?.nameEn || charmMeta.nameEn || catalogCharm?.nameEn || '',
        type: charm?.type || charm?.charmType || catalogCharm?.type || null,
        sizeCm: Number(charm?.sizeCm || catalogCharm?.sizeCm || 0) || null,
        price: Number(charm?.price ?? charm?.unitPrice ?? catalogCharm?.price ?? 0),
        image: charm?.image || catalogCharm?.image || null,
        meaningTh: charm?.meaningTh || catalogCharm?.meaningTh || '',
        meaningEn: charm?.meaningEn || catalogCharm?.meaningEn || ''
      };
    })
    .filter(Boolean);

  if (normalizedCharms.length === 0) return buildSelectedCharmOrderData();

  const primaryCharm = normalizedCharms[0];
  return {
    hasCharm: true,
    charmCount: normalizedCharms.length,
    charmIds: normalizedCharms.map((charm) => charm.id),
    charms: normalizedCharms,
    charmId: primaryCharm.id,
    charmSku: primaryCharm.sku,
    charmNameTh: primaryCharm.nameTh,
    charmNameEn: primaryCharm.nameEn,
    charmType: primaryCharm.type,
    charmSizeCm: primaryCharm.sizeCm,
    charmPrice: primaryCharm.price,
    charmImage: primaryCharm.image
  };
}

function buildSpacerOrderDataFromSavedSpacers(spacers = []) {
  const normalizedSpacers = spacers
    .map((spacer) => {
      const spacerId = String(spacer?.spacerId || spacer?.id || '').trim();
      if (!spacerId) return null;
      return {
        spacerId,
        nameTh: spacer?.nameTh || '',
        nameEn: spacer?.nameEn || '',
        type: spacer?.type || null,
        color: spacer?.color || '',
        image: spacer?.image || '',
        price: Number(spacer?.price ?? spacer?.unitPrice ?? 0),
        displaySizeMm: spacer?.displaySizeMm || spacer?.size || null,
        effectiveLengthMm: spacer?.effectiveLengthMm || spacer?.size || null,
        thicknessMm: spacer?.thicknessMm || null
      };
    })
    .filter(Boolean);

  if (normalizedSpacers.length === 0) return buildSelectedSpacerOrderData();

  return {
    hasSpacer: true,
    spacerCount: normalizedSpacers.length,
    spacerIds: normalizedSpacers.map((spacer) => spacer.spacerId),
    spacers: normalizedSpacers
  };
}

function normalizeCheckoutSummaryForOrder(summary) {
  if (!summary || typeof summary !== 'object') return summary;

  const nextSummary = cloneCheckoutValue(summary);
  nextSummary.uniqueStoneIds = normalizeUniqueStoneIds(nextSummary.uniqueStoneIds);
  const itemizedBilling = Array.isArray(nextSummary.itemizedBilling) ? nextSummary.itemizedBilling : [];
  const braceletSequence = Array.isArray(nextSummary.braceletSequence) ? nextSummary.braceletSequence : [];
  const existingCharms = Array.isArray(nextSummary.charmData?.charms) ? nextSummary.charmData.charms : [];
  const existingSpacers = Array.isArray(nextSummary.spacerData?.spacers) ? nextSummary.spacerData.spacers : [];

  if (existingCharms.length === 0) {
    const charmSource = itemizedBilling.some(isCheckoutCharmItem)
      ? itemizedBilling
      : braceletSequence;
    const derivedCharmData = buildCharmOrderDataFromItems(charmSource);
    if (derivedCharmData.charms.length > 0) {
      nextSummary.charmData = derivedCharmData;
    }
  }

  if (existingSpacers.length === 0) {
    const spacerSource = itemizedBilling.some(isCheckoutSpacerItem)
      ? itemizedBilling
      : braceletSequence;
    const derivedSpacerData = buildSpacerOrderDataFromItems(spacerSource);
    if (derivedSpacerData.spacers.length > 0) {
      nextSummary.spacerData = derivedSpacerData;
    }
  }

  return nextSummary;
}

function getOrderCanonicalMoney(order = {}, key) {
  const summary = order?.checkoutSummary && typeof order.checkoutSummary === 'object'
    ? order.checkoutSummary
    : {};
  const candidates = key === 'finalPrice'
    ? [summary.finalPrice, summary.totalPrice, summary.netPrice, order.finalPrice, order.totalPrice, order.netPrice]
    : [summary[key], order[key]];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value == null ? null : Number(value);
}

function isPaidOrder(order = {}) {
  const normalizedOrder = getOrderPayloadObject(order) || {};
  const status = String(normalizedOrder.status || order.status || '').trim().toLowerCase();
  const stripePaymentStatus = String(
    normalizedOrder.stripePaymentStatus ||
    normalizedOrder.paymentStatus ||
    order.stripe_payment_status ||
    order.stripePaymentStatus ||
    order.paymentStatus ||
    ''
  ).trim().toLowerCase();
  return status === 'payment received' ||
    status === 'paid' ||
    stripePaymentStatus === 'paid' ||
    Boolean(normalizedOrder.paidAt || normalizedOrder.paymentReceivedAt || normalizedOrder.notifications?.paymentReceivedSentAt);
}

function buildAggregatedStonesFromBilling(itemizedBilling = []) {
  return itemizedBilling
    .filter((item) => String(item?.componentType || item?.type || 'stone').trim().toLowerCase() === 'stone')
    .reduce((aggregated, item) => {
      const stoneId = String(item?.stoneId || item?.id || '').trim();
      if (!stoneId) return aggregated;
      const stoneData = STONES.find((stone) => stone.id === stoneId);
      const size = Number(item?.size || item?.sizeMm || State.beadSize || 6);
      const key = `${stoneId}_${size}`;
      const quantity = Math.max(1, Number.parseInt(item?.quantity ?? item?.count ?? 1, 10) || 1);
      const totalPrice = Number(item?.totalPrice ?? 0);
      const unitPrice = Number(item?.unitPrice ?? item?.price ?? item?.priceUnit ?? (quantity > 0 ? totalPrice / quantity : 0));

      if (!aggregated[key]) {
        aggregated[key] = {
          type: 'stone',
          stoneId,
          name: item?.name || stoneData?.name || 'Unknown Stone',
          nameTh: item?.nameTh || stoneData?.nameTh || '',
          color: item?.color || stoneData?.color || '#E2E8F0',
          image: item?.image || stoneData?.image || '',
          size,
          quantity: 0,
          count: 0,
          unitPrice,
          priceUnit: unitPrice,
          totalPrice: 0
        };
      }

      aggregated[key].quantity += quantity;
      aggregated[key].count += quantity;
      aggregated[key].totalPrice += Number.isFinite(totalPrice) && totalPrice > 0
        ? totalPrice
        : unitPrice * quantity;
      return aggregated;
    }, {});
}

function getOrderStoneItemsFromSequence(order = {}, fallbackItems = []) {
  const sequence = Array.isArray(order.braceletSequence)
    ? order.braceletSequence
    : Array.isArray(order.beadMap)
      ? order.beadMap
      : [];

  const sequenceStones = sequence
    .filter((item) => String(item?.componentType || item?.type || 'stone').trim().toLowerCase() === 'stone')
    .map((item, index) => ({
      componentType: 'stone',
      stoneId: String(item?.stoneId || item?.id || '').trim(),
      size: Number(item?.size || item?.sizeMm || order.beadSize || State.beadSize),
      uniqueId: index + 1
    }))
    .filter((item) => item.stoneId);

  if (sequenceStones.length > 0) return sequenceStones;
  return Array.isArray(fallbackItems) ? fallbackItems : [];
}

function buildOrderDetailCheckoutSummary(order = {}) {
  order = normalizeSavedOrder(order) || {};
  const liveSummary = normalizeCheckoutSummaryForOrder(buildCheckoutSummary());
  const itemizedBilling = Array.isArray(order.itemizedBilling) && order.itemizedBilling.length > 0
    ? order.itemizedBilling
    : liveSummary.itemizedBilling;
  const braceletSequence = Array.isArray(order.braceletSequence) && order.braceletSequence.length > 0
    ? order.braceletSequence
    : Array.isArray(order.beadMap) && order.beadMap.length > 0
      ? order.beadMap
      : liveSummary.braceletSequence;
  const aggregatedStones = itemizedBilling?.length
    ? buildAggregatedStonesFromBilling(itemizedBilling)
    : liveSummary.aggregatedStones;
  const uniqueStoneIds = normalizeUniqueStoneIds(
    Object.values(aggregatedStones || {}).map((item) => item.stoneId)
  );
  const charmSource = Array.isArray(order.selectedCharms) && order.selectedCharms.length > 0
    ? order.selectedCharms
    : itemizedBilling?.some(isCheckoutCharmItem)
      ? itemizedBilling
      : braceletSequence;
  const spacerSource = Array.isArray(order.selectedSpacers) && order.selectedSpacers.length > 0
    ? order.selectedSpacers
    : itemizedBilling?.some(isCheckoutSpacerItem)
      ? itemizedBilling
      : braceletSequence;
  const charmData = Array.isArray(order.selectedCharms) && order.selectedCharms.length > 0
    ? buildCharmOrderDataFromSavedCharms(order.selectedCharms)
    : buildCharmOrderDataFromItems(charmSource);
  const spacerData = Array.isArray(order.selectedSpacers) && order.selectedSpacers.length > 0
    ? buildSpacerOrderDataFromSavedSpacers(order.selectedSpacers)
    : buildSpacerOrderDataFromItems(spacerSource);
  const itemizedSubtotal = Array.isArray(itemizedBilling)
    ? itemizedBilling.reduce((sum, item) => {
      const itemTotal = Number(item?.totalPrice);
      if (Number.isFinite(itemTotal)) return sum + itemTotal;
      const unitPrice = Number(item?.unitPrice ?? item?.price ?? item?.priceUnit ?? 0);
      const quantity = Number(item?.quantity ?? item?.count ?? 1) || 1;
      return sum + (unitPrice * quantity);
    }, 0)
    : 0;
  const subtotal = getOrderCanonicalMoney(order, 'subtotal') ?? itemizedSubtotal ?? liveSummary.subtotal;
  const discountPercent = getOrderCanonicalMoney(order, 'discountPercent') ?? liveSummary.discountPercent ?? 20;
  const discountAmount = getOrderCanonicalMoney(order, 'discountAmount') ?? Math.round(subtotal * (discountPercent / 100));
  const finalPrice = getOrderCanonicalMoney(order, 'finalPrice') ?? subtotal - discountAmount;

  return normalizeCheckoutSummaryForOrder({
    ...liveSummary,
    selectedStoneItems: getOrderStoneItemsFromSequence(order, liveSummary.selectedStoneItems),
    aggregatedStones,
    uniqueStoneIds,
    itemizedBilling,
    braceletSequence,
    beadMap: braceletSequence,
    subtotal,
    discountPercent,
    discount: discountAmount,
    discountAmount,
    finalPrice,
    totalPrice: finalPrice,
    netPrice: finalPrice,
    charmData,
    spacerData
  });
}

function summaryHasCharmRows(summary) {
  return Boolean(
    summary?.charmData?.charms?.length ||
    summary?.itemizedBilling?.some(isCheckoutCharmItem) ||
    summary?.braceletSequence?.some(isCheckoutCharmItem)
  );
}

function rememberCheckoutSummary(summary) {
  const normalizedSummary = normalizeCheckoutSummaryForOrder(summary);
  State.checkoutSummarySnapshot = cloneCheckoutValue(normalizedSummary);
  try {
    localStorage.setItem(CHECKOUT_SUMMARY_STORAGE_KEY, JSON.stringify(State.checkoutSummarySnapshot));
  } catch (error) {
    console.warn('Unable to persist checkout summary snapshot', error);
  }
  return normalizedSummary;
}

function readStoredCheckoutSummary() {
  if (State.checkoutSummarySnapshot) {
    return cloneCheckoutValue(State.checkoutSummarySnapshot);
  }

  try {
    const storedSummary = JSON.parse(localStorage.getItem(CHECKOUT_SUMMARY_STORAGE_KEY) || 'null');
    return storedSummary && typeof storedSummary === 'object' ? storedSummary : null;
  } catch (error) {
    console.warn('Unable to read checkout summary snapshot', error);
    return null;
  }
}

function getEffectiveCheckoutSummary(currentSummary) {
  const normalizedCurrent = normalizeCheckoutSummaryForOrder(currentSummary);
  const storedSummary = normalizeCheckoutSummaryForOrder(readStoredCheckoutSummary());
  if (!summaryHasCharmRows(normalizedCurrent) && summaryHasCharmRows(storedSummary)) {
    return applyEffectiveDiscountToCheckoutSummary(storedSummary);
  }
  return applyEffectiveDiscountToCheckoutSummary(normalizedCurrent);
}

function rememberStripeOrderPayload(sessionId, orderPayload) {
  if (!sessionId || !orderPayload) return;
  try {
    const storedPayloads = JSON.parse(localStorage.getItem(STRIPE_ORDER_PAYLOAD_STORAGE_KEY) || '{}');
    storedPayloads[sessionId] = cloneCheckoutValue({
      ...orderPayload,
      stripeCheckoutSessionId: sessionId
    });
    localStorage.setItem(STRIPE_ORDER_PAYLOAD_STORAGE_KEY, JSON.stringify(storedPayloads));
  } catch (error) {
    console.warn('Unable to persist Stripe order payload snapshot', error);
  }
}

function readStripeOrderPayload(sessionId) {
  if (!sessionId) return null;
  try {
    const storedPayloads = JSON.parse(localStorage.getItem(STRIPE_ORDER_PAYLOAD_STORAGE_KEY) || '{}');
    const payload = storedPayloads?.[sessionId];
    return payload && typeof payload === 'object' ? payload : null;
  } catch (error) {
    console.warn('Unable to read Stripe order payload snapshot', error);
    return null;
  }
}

function clearStripeOrderPayload(sessionId) {
  if (!sessionId) return;
  try {
    const storedPayloads = JSON.parse(localStorage.getItem(STRIPE_ORDER_PAYLOAD_STORAGE_KEY) || '{}');
    delete storedPayloads[sessionId];
    localStorage.setItem(STRIPE_ORDER_PAYLOAD_STORAGE_KEY, JSON.stringify(storedPayloads));
  } catch (error) {
    console.warn('Unable to clear Stripe order payload snapshot', error);
  }
}

function calculateCurrentOrderPricing() {
  const summary = getEffectiveCheckoutSummary(buildCheckoutSummary());
  return buildOrderPricingFromSummary(summary);
}

function calculateLiveBraceletPricing() {
  const summary = normalizeCheckoutSummaryForOrder(buildCheckoutSummary());
  return buildOrderPricingFromSummary(summary);
}

function buildOrderPricingFromSummary(summary) {
  return {
    stonesSubtotal: summary.stonesSubtotal,
    charmSubtotal: summary.charmSubtotal,
    spacerSubtotal: summary.spacerSubtotal,
    subtotal: summary.subtotal,
    discountPercent: summary.discountPercent,
    discount: summary.discountAmount,
    discountAmount: summary.discountAmount,
    netPrice: summary.finalPrice,
    finalPrice: summary.finalPrice,
    totalPrice: summary.finalPrice,
    charmData: summary.charmData,
    spacerData: summary.spacerData,
    itemizedBilling: summary.itemizedBilling,
    braceletSequence: summary.braceletSequence
  };
}

function getEffectiveDiscountPercent() {
  if (State.discountEnabled === false) return 0;
  const configuredPercent = Number(State.globalDiscountPercent);
  if (!Number.isFinite(configuredPercent)) return 20;
  return Math.max(0, Math.min(100, configuredPercent));
}

function applyEffectiveDiscountToCheckoutSummary(summary = {}) {
  const nextSummary = { ...summary };
  const subtotal = Number(nextSummary.subtotal || 0);
  const discountPercent = getEffectiveDiscountPercent();
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const finalPrice = subtotal - discountAmount;
  nextSummary.discountEnabled = State.discountEnabled !== false;
  nextSummary.discountPercent = discountPercent;
  nextSummary.discount = discountAmount;
  nextSummary.discountAmount = discountAmount;
  nextSummary.netPrice = finalPrice;
  nextSummary.finalPrice = finalPrice;
  nextSummary.totalPrice = finalPrice;
  return nextSummary;
}

function buildCheckoutSummary() {
  const selectedStoneItems = getSelectedStoneItems();
  const charmData = buildSelectedCharmOrderData();
  const spacerData = buildSelectedSpacerOrderData();
  const aggregatedStones = {};
  const uniqueStoneIds = new Set();

  selectedStoneItems.forEach((placedBead) => {
    const key = `${placedBead.stoneId}_${placedBead.size}`;
    uniqueStoneIds.add(placedBead.stoneId);

    const stoneData = STONES.find((stone) => stone.id === placedBead.stoneId);
    const price = getStonePriceForSize(stoneData, placedBead.size);

    if (!aggregatedStones[key]) {
      aggregatedStones[key] = {
        type: 'stone',
        stoneId: placedBead.stoneId,
        name: stoneData ? stoneData.name : 'Unknown Stone',
        nameTh: stoneData ? stoneData.nameTh : 'หินธรรมชาติ',
        color: stoneData ? stoneData.color : '#E2E8F0',
        image: stoneData ? stoneData.image : '',
        size: placedBead.size,
        quantity: 0,
        count: 0,
        unitPrice: price,
        priceUnit: price,
        totalPrice: 0
      };
    }

    aggregatedStones[key].quantity += 1;
    aggregatedStones[key].count += 1;
    aggregatedStones[key].totalPrice += price;
  });

  const aggregatedSpacers = spacerData.spacers.reduce((spacerMap, spacer) => {
    const key = `${spacer.spacerId}_${spacer.effectiveLengthMm}`;
    if (!spacerMap[key]) {
      spacerMap[key] = {
        type: 'spacer',
        ...spacer,
        quantity: 0,
        count: 0,
        unitPrice: Number(spacer.price || 0),
        totalPrice: 0
      };
    }
    spacerMap[key].quantity += 1;
    spacerMap[key].count += 1;
    spacerMap[key].totalPrice += Number(spacer.price || 0);
    return spacerMap;
  }, {});

  const stoneBilling = Object.values(aggregatedStones);
  const charmBilling = charmData.charms.map((charm) => ({
    type: 'charm',
    id: charm.id,
    charmId: charm.id,
    sku: charm.sku,
    nameTh: charm.nameTh,
    nameEn: charm.nameEn,
    sizeCm: charm.sizeCm,
    footprintMm: getCharmFootprintMm(charm),
    image: charm.image,
    quantity: 1,
    count: 1,
    unitPrice: Number(charm.price || 0),
    price: Number(charm.price || 0),
    totalPrice: Number(charm.price || 0)
  }));
  const spacerBilling = Object.values(aggregatedSpacers);

  const stonesSubtotal = stoneBilling.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  const charmSubtotal = charmBilling.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  const spacerSubtotal = spacerBilling.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  const subtotal = stonesSubtotal + spacerSubtotal + charmSubtotal;
  const discountPercent = getEffectiveDiscountPercent();
  const discount = Math.round(subtotal * (discountPercent / 100));
  const finalPrice = subtotal - discount;
  const braceletSequence = createBraceletComponentList().map((component, index) => {
    if (component.type === 'empty') {
      return {
        type: 'empty',
        componentType: 'empty',
        sequenceIndex: index,
        size: component.sizeMm,
        uniqueId: component.uniqueId || component.id
      };
    }

    if (component.type === 'charm') {
      const charm = getCharmCatalogEntry(component.charmId);
      const charmMeta = charm ? getCharmDisplayMeta(charm) : {};
      return {
        type: 'charm',
        componentType: 'charm',
        sequenceIndex: index,
        charmId: component.charmId,
        id: component.charmId,
        sku: charm?.sku || null,
        nameTh: charmMeta.nameTh || charm?.nameTh || '',
        nameEn: charmMeta.nameEn || charm?.nameEn || '',
        charmType: component.charmType || charm?.type || null,
        image: component.image || charm?.image || '',
        sizeCm: component.sizeCm || charm?.sizeCm || null,
        footprintMm: component.footprintMm || (charm ? getCharmFootprintMm(charm) : component.sizeMm),
        size: component.sizeMm || component.footprintMm || null,
        price: Number(charm?.price || 0),
        uniqueId: component.uniqueId || component.id
      };
    }

    if (component.type === 'spacer') {
      return {
        type: 'spacer',
        componentType: 'spacer',
        sequenceIndex: index,
        spacerId: component.spacerId,
        id: component.spacerId,
        nameTh: component.nameTh,
        nameEn: component.nameEn,
        color: component.color,
        image: component.image,
        displaySizeMm: component.displaySizeMm,
        effectiveLengthMm: component.effectiveLengthMm,
        size: component.sizeMm,
        price: Number(component.price || 0),
        uniqueId: component.uniqueId || component.id
      };
    }

    const stoneData = STONES.find((stone) => stone.id === component.stoneId);
    return {
      type: 'stone',
      componentType: 'stone',
      sequenceIndex: index,
      stoneId: component.stoneId,
      id: component.stoneId,
      name: stoneData ? stoneData.name : 'Unknown Stone',
      nameTh: stoneData ? stoneData.nameTh : 'หินธรรมชาติ',
      color: stoneData ? stoneData.color : '#E2E8F0',
      image: stoneData ? stoneData.image : '',
      size: component.sizeMm,
      price: getStonePriceForSize(stoneData, component.sizeMm),
      uniqueId: component.uniqueId || component.id
    };
  });

  return applyEffectiveDiscountToCheckoutSummary({
    selectedStoneItems,
    aggregatedStones,
    aggregatedSpacers,
    uniqueStoneIds,
    itemizedBilling: [
      ...stoneBilling,
      ...charmBilling,
      ...spacerBilling
    ],
    braceletSequence,
    beadMap: braceletSequence,
    stonesSubtotal,
    charmSubtotal,
    spacerSubtotal,
    subtotal,
    discountPercent,
    discount,
    discountAmount: discount,
    netPrice: finalPrice,
    finalPrice,
    totalPrice: finalPrice,
    charmData,
    spacerData
  });
}

function getResolvedNodeRotationRad(node) {
  if (node?.component?.type === 'charm') {
    const isOutwardFacingBeeHeart = node.component.charmType === 'bee_heart';
    // Most charm assets are authored upright and need a quarter-turn to lie
    // across the bracelet. Bee heart pendants should hang outward instead.
    const baseRotation = isOutwardFacingBeeHeart
      ? node.centerAngle + (Math.PI * 1.5)
      : node.centerAngle + Math.PI;
    const rotationOffsetRad = (normalizeCharmRotation(node.component.rotation) * Math.PI) / 180;
    return baseRotation + rotationOffsetRad;
  }
  return node.centerAngle + Math.PI / 2;
}

function getCharmRenderFrameDimensions(component, scaleMmToPx) {
  const renderWidthMm = Number(component?.renderWidthMm);
  const renderHeightMm = Number(component?.renderHeightMm);
  if (Number.isFinite(renderWidthMm) && renderWidthMm > 0 && Number.isFinite(renderHeightMm) && renderHeightMm > 0) {
    return {
      widthPx: renderWidthMm * scaleMmToPx,
      heightPx: renderHeightMm * scaleMmToPx
    };
  }

  const renderSizeMm = Number(component?.renderSizeMm ?? component?.sizeMm);
  const frameSizePx = Math.max(0, renderSizeMm) * scaleMmToPx;
  return {
    widthPx: frameSizePx,
    heightPx: frameSizePx
  };
}

function getCharmOutwardOffsetPx(component, scaleMmToPx) {
  const offsetMm = Number(component?.outwardOffsetMm);
  return Number.isFinite(offsetMm) ? offsetMm * scaleMmToPx : 0;
}

async function removeSelectedCharm(selectionIndex = null, showToastNotification = true) {
  const normalizedSelectionIndex = Number.isInteger(selectionIndex)
    ? selectionIndex
    : Number.isFinite(Number(selectionIndex))
      ? Number(selectionIndex)
      : getSelectedCharmCatalogEntries().length - 1;
  const selectedCharms = getSelectedCharmCatalogEntries();
  if (normalizedSelectionIndex < 0 || normalizedSelectionIndex >= selectedCharms.length) return;

  const selectedCharm = selectedCharms[normalizedSelectionIndex];
  if (isSlotPlaceableCharmType(selectedCharm?.type)) {
    const loopCharm = getSelectedLoopCharmItems().find((charm) => charm.uniqueId === selectedCharm.uniqueId);
    if (!loopCharm) return;
    removeLoopItemFromBracelet(loopCharm.sourceIndex, false);
  } else {
    const currentCharmIds = normalizeSelectedCharmIds(State.selectedCharmIds);
    const anchoredIndex = currentCharmIds.findIndex((charmId, index) => (
      index === normalizedSelectionIndex && charmId === selectedCharm?.id
    ));
    if (anchoredIndex < 0) return;

    State.selectedCharmIds = currentCharmIds.filter((_, index) => index !== anchoredIndex);
    syncSelectedCharmState();
    State.activeSlotIndex = null;
    updateEstimationText();
    saveState();

    if (State.currentStep === 3) {
      renderCharmOptions();
      renderStep3();
      syncStep3NextValidationUI();
    } else if (State.currentStep === 4) {
      await renderStep4();
    }
  }

  if (showToastNotification) {
    showToast(`${CUSTOMER_COMPONENT_LABELS.charm} removed.`);
  }
}

function getMeaningThumbnailLabel({ nameTh = '', nameEn = '' } = {}) {
  const source = String(nameTh || '').trim() || String(nameEn || '').trim();
  return source ? source.charAt(0).toUpperCase() : 'LC';
}

function buildStep4MeaningEntries(uniqueStoneIds = new Set(), selectedCharms = getSelectedCharmCatalogEntries()) {
  const entries = [];
  const safeSelectedCharms = Array.isArray(selectedCharms) ? selectedCharms : [];
  const safeStoneIds = normalizeUniqueStoneIds(uniqueStoneIds);

  safeSelectedCharms.forEach((selectedCharm) => {
    const charmMeta = getCharmDisplayMeta(selectedCharm);
    const charmMeaningParts = [selectedCharm.meaningTh, selectedCharm.meaningEn]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    entries.push({
      key: `charm_${selectedCharm.id}_${selectedCharm.selectionIndex ?? 0}`,
      image: selectedCharm.image || '',
      nameTh: charmMeta.nameTh,
      nameEn: charmMeta.nameEn,
      meaning: charmMeaningParts.join(' - ') || 'ไม่มีคำอธิบายเพิ่มเติม',
      thumbnailLabel: getMeaningThumbnailLabel(charmMeta)
    });
  });

  safeStoneIds.forEach((id) => {
    const stone = STONES.find((entry) => entry.id === id);
    if (!stone) return;

    entries.push({
      key: `stone_${stone.id}`,
      image: stone.image || '',
      nameTh: stone.nameTh || '',
      nameEn: stone.name || '',
      meaning: [stone.meaningTh, stone.meaning]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' - ') || 'ไม่มีคำอธิบายเพิ่มเติม',
      thumbnailLabel: getMeaningThumbnailLabel({
        nameTh: stone.nameTh,
        nameEn: stone.name
      })
    });
  });

  return entries;
}

function createMeaningItemElement(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'meaning-item';

  const thumbnail = document.createElement('div');
  thumbnail.className = 'meaning-item-thumbnail';

  const image = document.createElement('img');
  image.className = 'meaning-item-thumbnail-img';
  image.alt = `${entry.nameEn || entry.nameTh} thumbnail`;

  const placeholder = document.createElement('div');
  placeholder.className = 'meaning-item-thumbnail-placeholder';
  placeholder.textContent = entry.thumbnailLabel;

  if (entry.image) {
    image.src = withCatalogImageVersion(entry.image, entry);
    image.addEventListener('load', () => {
      thumbnail.classList.add('has-image');
    });
    image.addEventListener('error', () => {
      thumbnail.classList.remove('has-image');
    });
  }

  thumbnail.append(image, placeholder);

  const content = document.createElement('div');
  content.className = 'meaning-item-content';

  const title = document.createElement('div');
  title.className = 'meaning-item-title';
  title.textContent = `${entry.nameTh} (${entry.nameEn})`;

  const desc = document.createElement('div');
  desc.className = 'meaning-item-desc';
  desc.textContent = entry.meaning;

  content.append(title, desc);
  wrapper.append(thumbnail, content);

  return wrapper;
}

function appendCatalogEmptyState(container, message = 'Coming soon') {
  const emptyState = document.createElement('div');
  emptyState.className = 'catalog-empty-state';
  emptyState.textContent = message;
  container.appendChild(emptyState);
}

function renderCharmOptions() {
  if (!DOM.charmSectionMount || State.currentStep !== 3) return;

  const visibleCharms = applyCatalogLayoutOrder(getVisibleCharmCatalog(), 'charms');
  const selectedCharms = getSelectedCharmCatalogEntries();
  const selectedCharmIdSet = new Set(selectedCharms.map((charm) => charm.id));
  const thumbnailTargetRatio = getCharmCatalogThumbnailTargetRatio(visibleCharms);
  DOM.charmSectionMount.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'component-section charm-component-section';

  const grid = document.createElement('div');
  grid.className = 'stone-catalog-grid';

  const selectCharm = (charmId) => {
    applySelectedCharm(charmId);
  };

  if (visibleCharms.length === 0) {
    appendCatalogEmptyState(grid, `${CUSTOMER_COMPONENT_LABELS.charm} coming soon`);
  }

  visibleCharms.forEach((charm) => {
    const isSelected = selectedCharmIdSet.has(charm.id);
    const charmMeta = getCharmDisplayMeta(charm);
    const charmImage = withCatalogImageVersion(charm.image, charm);
    if (charmImage) {
      scheduleCharmVisibleBoundsDetection(charmImage);
    }
    grid.appendChild(buildStoneCard({
      rootTag: 'div',
      dataAttributeName: 'charm-id',
      dataAttributeValue: charm.id,
      image: charmImage,
      imageAlt: charmMeta.nameEn,
      imageClassName: 'stone-img charm-card-img',
      imageStyle: getCharmCardThumbnailStyle(charm, thumbnailTargetRatio),
      nameTh: charmMeta.nameTh,
      nameEn: charmMeta.nameEn,
      priceText: formatDisplayPrice(charm.price),
      isSelected,
      onCardClick: () => selectCharm(charm.id),
      onInfoClick: () => openCharmInfoModal(charm),
      onActionClick: () => selectCharm(charm.id),
      actionText: '+',
      actionTitle: isSelected ? `Selected ${CUSTOMER_COMPONENT_LABELS.charm}` : `Select ${CUSTOMER_COMPONENT_LABELS.charm}`
    }));
  });

  section.appendChild(grid);
  DOM.charmSectionMount.appendChild(section);
  renderSpacerOptions();
}

function renderSpacerOptions() {
  if (!DOM.charmSectionMount || State.currentStep !== 3) return;

  const selectedSpacers = getSelectedSpacerItems();
  const spacerCounts = selectedSpacers.reduce((counts, spacer) => {
    counts[spacer.id] = (counts[spacer.id] || 0) + 1;
    return counts;
  }, {});

  const section = document.createElement('section');
  section.className = 'component-section spacer-component-section';

  const grid = document.createElement('div');
  grid.className = 'stone-catalog-grid';

  if (SPACER_CATALOG.length === 0) {
    appendCatalogEmptyState(grid, `${CUSTOMER_COMPONENT_LABELS.spacer} coming soon`);
  }

  applyCatalogLayoutOrder(SPACER_CATALOG, 'spacers').forEach((spacer) => {
    const quantity = spacerCounts[spacer.id] || 0;
    const spacerImage = withCatalogImageVersion(spacer.image, spacer);
    grid.appendChild(buildStoneCard({
      rootTag: 'div',
      dataAttributeName: 'spacer-id',
      dataAttributeValue: spacer.id,
      image: spacerImage,
      imageAlt: spacer.nameEn,
      imageClassName: 'stone-img spacer-card-img',
      imageStyle: {
        '--spacer-thumb-scale': spacer.type === 'flat-spacer' ? '0.78' : '0.96'
      },
      nameTh: spacer.nameTh,
      nameEn: spacer.nameEn,
      priceText: `${formatDisplayPrice(spacer.price)} • ${spacer.effectiveLengthMm}mm`,
      isSelected: quantity > 0,
      onCardClick: () => addSpacerToBracelet(spacer.id),
      onActionClick: () => addSpacerToBracelet(spacer.id),
      actionText: quantity > 0 ? String(quantity) : '+',
      actionTitle: quantity > 0 ? `Add Another ${CUSTOMER_COMPONENT_LABELS.spacer}` : `Add ${CUSTOMER_COMPONENT_LABELS.spacer}`
    }));
  });

  section.appendChild(grid);
  DOM.charmSectionMount.appendChild(section);
}

// ==========================================
// 8. Step 3: Interactive Canvas & Catalog
// ==========================================
function setupDesignerEvents() {
  // Reset Button
  DOM.btnResetBracelet.addEventListener('click', async () => {
    if (State.selectedStones.length > 0 || State.selectedCharmIds.length > 0) {
      const proceed = await showCustomConfirm(
        "Are you sure you want to clear your current bracelet design? (รีเซ็ตกำไล)",
        "Reset Bracelet"
      );
      if (proceed) {
        State.selectedStones = [];
        State.selectedCharmIds = [];
        syncSelectedCharmState();
        State.activeSlotIndex = null;
        State.newlyAddedIds = [];
        updateEstimationText();
        showToast("Bracelet cleared!");
        renderCharmOptions();
        renderStep3();
        saveState();
      }
    }
  });

  // Size toggles in mixed mode
  DOM.mixedToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.mixedToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.mixedPlacingSize = parseInt(btn.getAttribute('data-size'));
      renderStep3();
    });
  });

  // Back to step 2 selection in canvas control
  DOM.btnBackToSteps.addEventListener('click', () => {
    goToStep(2);
  });

  DOM.catalogTypeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const section = tab.getAttribute('data-catalog-section');
      if (!['stones', 'charms', 'spacer'].includes(section)) return;
      State.activeCatalogSection = section;
      syncCatalogSectionFilter();
    });
  });
}

function syncCatalogSectionFilter() {
  const activeSection = ['stones', 'charms', 'spacer'].includes(State.activeCatalogSection)
    ? State.activeCatalogSection
    : 'stones';

  DOM.catalogTypeTabs.forEach((tab) => {
    const isActive = tab.getAttribute('data-catalog-section') === activeSection;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  const catalogContainer = DOM.catalogFiltersContainer?.closest('.catalog-container');
  if (catalogContainer) {
    catalogContainer.hidden = activeSection !== 'stones';
    catalogContainer.style.display = activeSection === 'stones' ? '' : 'none';
  }

  if (DOM.mixedSizeSelectorBar) {
    DOM.mixedSizeSelectorBar.hidden = activeSection !== 'stones';
  }

  if (DOM.charmSectionMount) {
    DOM.charmSectionMount.hidden = activeSection === 'stones';
    DOM.charmSectionMount.style.display = activeSection === 'stones' ? 'none' : '';
    DOM.charmSectionMount
      .querySelectorAll('.component-section')
      .forEach((section) => {
        const isCharmSection = section.classList.contains('charm-component-section');
        const isSpacerSection = section.classList.contains('spacer-component-section');
        const shouldHide = (activeSection === 'charms' && !isCharmSection)
          || (activeSection === 'spacer' && !isSpacerSection);
        section.hidden = shouldHide;
        section.style.display = shouldHide ? 'none' : '';
      });
  }
}

function initCatalogFilters() {
  DOM.catalogFiltersContainer.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, nameObj]) => {
    const tab = document.createElement('button');
    tab.className = `filter-tab ${State.activeCategory === key ? 'active' : ''}`;
    tab.textContent = nameObj.th; // Using Thai text primarily for brand feel
    tab.setAttribute('data-category', key);
    
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      State.activeCategory = key;
      renderCatalogGrid();
    });
    
    DOM.catalogFiltersContainer.appendChild(tab);
  });
}

function renderCatalogGrid() {
  DOM.stoneCatalogGrid.innerHTML = '';
  const selectedStoneCounts = getSelectedStoneCountsById();
  
  // Filter out of stock items
  const availableStones = applyCatalogLayoutOrder(STONES.filter(s => s.inStock !== false), 'stones');
  
  const filtered = State.activeCategory === 'all' 
    ? availableStones 
    : availableStones.filter(s => (s.categoryId || s.category) === State.activeCategory);
    
  filtered.forEach(stone => {
    const catalogCurrentSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
    const catalogPrice = getStonePriceForSize(stone, catalogCurrentSize);
    const selectedCount = selectedStoneCounts[stone.id] || 0;
    DOM.stoneCatalogGrid.appendChild(buildStoneCard({
      dataAttributeName: 'stone-id',
      dataAttributeValue: stone.id,
      image: withCatalogImageVersion(stone.image, stone),
      imageAlt: stone.name,
      nameTh: stone.nameTh,
      nameEn: stone.name,
      priceText: formatDisplayPrice(catalogPrice),
      isSelected: selectedCount > 0,
      selectedClassName: 'stone-card-selected',
      onCardClick: () => addStoneToBracelet(stone.id),
      onInfoClick: () => openStoneInfoModal(stone),
      onActionClick: () => addStoneToBracelet(stone.id),
      actionText: selectedCount > 0 ? String(selectedCount) : '+',
      actionTitle: selectedCount > 0 ? `Add another stone (currently ${selectedCount} selected)` : 'Add Stone',
      actionAriaLabel: selectedCount > 0 ? `Add another stone. ${selectedCount} selected in bracelet.` : 'Add Stone'
    }));
  });
}

function getFirstEmptyLoopSlotIndex() {
  return State.selectedStones.findIndex((item) => isEmptyLoopSlot(item));
}

function getAvailableLengthForNewLoopItem() {
  const { usableBeadLengthMm } = getCurrentBraceletCapacityMetrics();
  const currentTotalDiameter = State.selectedStones.reduce((sum, item) => sum + getLoopItemLengthMm(item), 0);
  const emptySlotIndex = getFirstEmptyLoopSlotIndex();
  const reservedSlotLengthMm = emptySlotIndex >= 0
    ? getLoopItemLengthMm(State.selectedStones[emptySlotIndex])
    : 0;

  return {
    emptySlotIndex,
    availableLengthMm: usableBeadLengthMm - currentTotalDiameter + reservedSlotLengthMm
  };
}

function placeLoopItemInFirstAvailableSlot(loopItem) {
  const emptySlotIndex = getFirstEmptyLoopSlotIndex();
  State.activeSlotIndex = null;

  if (emptySlotIndex >= 0) {
    State.selectedStones[emptySlotIndex] = loopItem;
    return true;
  }

  State.selectedStones.push(loopItem);
  return false;
}

// Fill all currently available slots with one stone type.
function fillEntireBracelet(stoneId) {
  const stoneData = STONES.find(s => s.id === stoneId);
  if (!stoneData) return;
  
  const placedSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
  let { availableLengthMm } = getAvailableLengthForNewLoopItem();
  State.newlyAddedIds = [];
  
  while (availableLengthMm + 1.0 >= placedSize) {
    State.uniqueCounter++;
    placeLoopItemInFirstAvailableSlot(createStoneSelectionItem(stoneId, placedSize, State.uniqueCounter));
    State.newlyAddedIds.push(State.uniqueCounter);
    availableLengthMm = getAvailableLengthForNewLoopItem().availableLengthMm;
  }
  
  State.activeSlotIndex = null;
  showToast(`Filled entire bracelet with ${stoneData.nameTh}.`);
  renderStep3();
  saveState();
}

function addLoopItemToBracelet(loopItem, itemLabel, lengthMm) {
  const { availableLengthMm: remainingMm } = getAvailableLengthForNewLoopItem();

  if (remainingMm < lengthMm) {
    showToast(`กำไลเต็มแล้ว! เหลือพื้นที่ ${remainingMm.toFixed(1)}mm (ขนาดชิ้นที่จะใส่: ${lengthMm}mm)`);
    return false;
  }

  State.newlyAddedIds = [loopItem.uniqueId];
  State.activeSlotIndex = getFirstEmptyLoopSlotIndex();

  if (State.activeSlotIndex !== null && State.activeSlotIndex >= 0 && State.activeSlotIndex < State.selectedStones.length) {
    State.selectedStones[State.activeSlotIndex] = loopItem;
    State.activeSlotIndex = null;
    showToast(`Added ${itemLabel} in chosen position.`);
  } else {
    State.selectedStones.push(loopItem);
  }

  renderStep3();
  saveState();
  syncStep3NextValidationUI();
  return true;
}

// Add Stone Logic
function addStoneToBracelet(stoneId) {
  const stoneData = STONES.find(s => s.id === stoneId);
  if (!stoneData) return;
  
  const placedSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
  const { availableLengthMm: remainingMm } = getAvailableLengthForNewLoopItem();
  
  // Check if there is enough space left for this bead
  if (remainingMm < placedSize) {
    showToast(`กำไลเต็มแล้ว! เหลือพื้นที่ ${remainingMm.toFixed(1)}mm (ขนาดหินที่จะใส่: ${placedSize}mm)`);
    return;
  }
  
  State.uniqueCounter++;
  const newBead = createStoneSelectionItem(stoneId, placedSize, State.uniqueCounter);
  State.newlyAddedIds = [newBead.uniqueId];
  State.activeSlotIndex = getFirstEmptyLoopSlotIndex();
  
  if (State.activeSlotIndex !== null && State.activeSlotIndex >= 0 && State.activeSlotIndex < State.selectedStones.length) {
    // Fill the first retained empty slot before extending the sequence.
    State.selectedStones[State.activeSlotIndex] = newBead;
    State.activeSlotIndex = null; // Reset selection
    showToast(`Added ${stoneData.nameTh} in chosen position.`);
  } else {
    // Append to end
    State.selectedStones.push(newBead);
  }
  
  renderStep3();
  saveState();
  
  syncStep3NextValidationUI();
}

function addSpacerToBracelet(spacerId) {
  const spacer = getSpacerCatalogEntry(spacerId);
  if (!spacer) return;

  const { availableLengthMm: remainingMm } = getAvailableLengthForNewLoopItem();

  if (remainingMm < spacer.effectiveLengthMm) {
    showToast(`กำไลเต็มแล้ว! เหลือพื้นที่ ${remainingMm.toFixed(1)}mm (ขนาดชิ้นที่จะใส่: ${spacer.effectiveLengthMm}mm)`);
    return;
  }

  State.uniqueCounter++;
  const newSpacer = createSpacerSelectionItem(spacer.id, State.uniqueCounter);
  if (!newSpacer) return;
  State.newlyAddedIds = [newSpacer.uniqueId];
  State.activeSlotIndex = getFirstEmptyLoopSlotIndex();

  if (State.activeSlotIndex !== null && State.activeSlotIndex >= 0 && State.activeSlotIndex < State.selectedStones.length) {
    State.selectedStones[State.activeSlotIndex] = newSpacer;
    State.activeSlotIndex = null;
    showToast(`Added ${spacer.nameEn} in chosen position.`);
  } else {
    State.selectedStones.push(newSpacer);
  }

  renderStep3();
  saveState();
  syncStep3NextValidationUI();
}

function removeLoopItemFromBracelet(index, showToastNotification = true) {
  if (index < 0 || index >= State.selectedStones.length) return;
  const removed = State.selectedStones[index];
  if (isEmptyLoopSlot(removed)) return;
  State.selectedStones[index] = createEmptyLoopSlot(getLoopItemLengthMm(removed), removed?.uniqueId || null);
  State.activeSlotIndex = null;
  if (showToastNotification) {
    if (isSelectedSpacerItem(removed)) {
      showToast(`${CUSTOMER_COMPONENT_LABELS.spacer} removed.`);
    } else if (isSelectedCharmItem(removed)) {
      showToast(`${CUSTOMER_COMPONENT_LABELS.charm} removed.`);
    } else {
      showToast("Bead removed.");
    }
  }

  updateEstimationText();
  renderCharmOptions();
  renderStep3();
  saveState();
  syncStep3NextValidationUI();
}

// Remove Stone Logic
function removeStoneFromBracelet(index) {
  removeLoopItemFromBracelet(index);
}

function createBraceletConfig() {
  return {
    wristSizeCm: State.wristSize,
    toleranceCm: TOLERANCE_CM,
    braceletLengthMm: getBraceletLengthMm(),
    beadSizeMode: State.beadSize,
    placingSizeMm: State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize),
    activeSlotIndex: State.activeSlotIndex,
    newlyAddedIds: State.newlyAddedIds || [],
    svg: {
      centerX: 125,
      centerY: 125,
      radiusPx: 82
    }
  };
}

function createBraceletComponentList() {
  const loopComponents = State.selectedStones
    .map((item, index) => {
      if (isEmptyLoopSlot(item)) {
        return {
          id: item.uniqueId || `empty-${index}`,
          type: 'empty',
          layoutRole: 'loop',
          sourceIndex: index,
          sizeMm: getLoopItemLengthMm(item),
          uniqueId: item.uniqueId || `empty-${index}`
        };
      }

      if (isSelectedSpacerItem(item)) {
        const spacer = getSpacerCatalogEntry(item.spacerId);
        if (!spacer) return null;

        return {
          id: item.uniqueId,
          type: 'spacer',
          layoutRole: 'loop',
          sourceIndex: index,
          spacerId: spacer.id,
          spacerShape: spacer.type,
          nameTh: spacer.nameTh,
          nameEn: spacer.nameEn,
          image: spacer.image,
          color: spacer.color,
          displaySizeMm: spacer.displaySizeMm,
          effectiveLengthMm: spacer.effectiveLengthMm,
          renderSizeMm: spacer.renderSizeMm || spacer.displaySizeMm,
          thicknessMm: spacer.thicknessMm || null,
          price: Number(spacer.price || 0),
          sizeMm: spacer.effectiveLengthMm,
          uniqueId: item.uniqueId
        };
      }

      if (isSelectedCharmItem(item)) {
        const charm = getCharmCatalogEntry(item.charmId);
        if (!charm || !isSlotPlaceableCharmType(charm.type)) return null;

        const renderTuning = resolveCharmRenderTuning(charm);
        return {
          id: item.uniqueId,
          type: 'charm',
          layoutRole: 'loop',
          placementMode: 'sequence',
          track: 'main_loop',
          sourceIndex: index,
          sourceId: charm.id,
          charmId: charm.id,
          charmType: charm.type || null,
          selectionIndex: index,
          charmInstanceKey: `loop_${charm.id}_${item.uniqueId}`,
          image: charm.image,
          sizeCm: charm.sizeCm,
          footprintMm: getCharmFootprintMm(charm),
          sizeMm: getCharmFootprintMm(charm),
          renderSizeMm: 18,
          renderWidthMm: 12.5,
          renderHeightMm: 18,
          ...renderTuning,
          visualScale: 1.3225,
          outwardOffsetMm: 7.2,
          uniqueId: item.uniqueId
        };
      }

      return {
        id: item.uniqueId,
        type: 'stone',
        layoutRole: 'loop',
        sourceIndex: index,
        stoneId: item.stoneId,
        sizeMm: item.size,
        uniqueId: item.uniqueId
      };
    })
    .filter(Boolean);

  const selectedCharms = getSelectedAnchoredCharmCatalogEntries();
  if (selectedCharms.length === 0) {
    return loopComponents;
  }

  const charmComponents = selectedCharms.map((charm) => {
    const renderTuning = resolveCharmRenderTuning(charm);
    const footprintMm = getCharmFootprintMm(charm);
    return {
      id: `charm-${charm.id}-${charm.selectionIndex}`,
      type: 'charm',
      layoutRole: 'loop',
      placementMode: 'sequence',
      track: 'main_loop',
      sourceId: charm.id,
      charmId: charm.id,
      charmType: charm.type || null,
      selectionIndex: charm.selectionIndex,
      charmInstanceKey: charm.charmInstanceKey,
      image: charm.image,
      sizeCm: charm.sizeCm,
      footprintMm,
      sizeMm: footprintMm,
      ...renderTuning,
      uniqueId: `charm-${charm.id}-${charm.selectionIndex}`
    };
  });

  if (charmComponents.length === 1) {
    return [
      charmComponents[0],
      ...loopComponents
    ];
  }

  return [
    ...charmComponents,
    ...loopComponents
  ];
}

function createResolvedBraceletLayout(braceletConfig, braceletComponentList) {
  const capacityMetrics = createBraceletCapacityMetrics(braceletConfig, braceletComponentList);
  const loopComponents = capacityMetrics.loopComponents;
  const placedCount = loopComponents.filter((component) => component.type !== 'empty').length;
  const sumPlacedDiameter = capacityMetrics.totalUsedLengthMm;
  const spaceLeft = capacityMetrics.remainingLengthMm;
  const trailingPlaceholderCount = Math.max(0, Math.floor(spaceLeft / braceletConfig.placingSizeMm));
  const emptySlotCount = loopComponents.filter((component) => component.type === 'empty').length;
  const numPlaceholders = emptySlotCount + trailingPlaceholderCount;

  const loopItems = [
    ...loopComponents.map((component) => component.type === 'empty'
      ? {
        kind: 'placeholder',
        sourceIndex: component.sourceIndex,
        sizeMm: component.sizeMm
      }
      : {
        kind: 'component',
        component,
        sizeMm: component.sizeMm
      }),
    ...Array.from({ length: trailingPlaceholderCount }, (_, index) => ({
      kind: 'placeholder',
      placeholderIndex: index,
      sizeMm: braceletConfig.placingSizeMm
    }))
  ];

  const totalVirtualDiameter = loopItems.reduce((sum, item) => sum + item.sizeMm, 0);
  const loopCircumferenceMm = totalVirtualDiameter > 0 ? totalVirtualDiameter : braceletConfig.braceletLengthMm;
  const scaleMmToPx = (2 * Math.PI * braceletConfig.svg.radiusPx) / loopCircumferenceMm;
  const buildResolvedNode = (item, index, itemAngleWidth, centerAngle, isFirstPlaceholder = false) => {
    const centerX = braceletConfig.svg.centerX + braceletConfig.svg.radiusPx * Math.cos(centerAngle);
    const centerY = braceletConfig.svg.centerY + braceletConfig.svg.radiusPx * Math.sin(centerAngle);
    const visualSizeMm = item.kind === 'component' && Number.isFinite(Number(item.component?.renderSizeMm))
      ? Number(item.component.renderSizeMm)
      : item.sizeMm;
    const radiusPx = (visualSizeMm / 2) * scaleMmToPx;
    const resolvedNode = {
      index,
      kind: item.kind,
      sizeMm: item.sizeMm,
      itemAngleWidth,
      centerAngle,
      centerX,
      centerY,
      radiusPx,
      isPlaced: item.kind === 'component',
      isFirstPlaceholder
    };

    const sourceIndex = item.kind === 'component'
      ? item.component.sourceIndex
      : item.sourceIndex;
    if (Number.isInteger(sourceIndex)) {
      resolvedNode.sourceIndex = sourceIndex;
      resolvedNode.isActiveSlot = sourceIndex === braceletConfig.activeSlotIndex;
    }

    if (item.kind === 'component') {
      resolvedNode.component = item.component;
      resolvedNode.uniqueClipId = `clip-${item.component.uniqueId}`;
      resolvedNode.isNewlyAdded = braceletConfig.newlyAddedIds.includes(item.component.uniqueId);
    }

    return resolvedNode;
  };

  const charmComponents = loopComponents.filter((component) => component.type === 'charm' && isAnchoredCharmType(component.charmType));
  if (charmComponents.length === 2) {
    const [topCharm, bottomCharm] = charmComponents;
    const fillerItems = [
      ...loopComponents
        .filter((component) => component.type !== 'charm' || isSlotPlaceableCharmType(component.charmType))
        .map((component) => component.type === 'empty'
          ? {
            kind: 'placeholder',
            sourceIndex: component.sourceIndex,
            sizeMm: component.sizeMm
          }
          : {
            kind: 'component',
            component,
            sizeMm: component.sizeMm
          }),
      ...Array.from({ length: trailingPlaceholderCount }, (_, index) => ({
        kind: 'placeholder',
        placeholderIndex: index,
        sizeMm: braceletConfig.placingSizeMm
      }))
    ];
    const fillerTotalSizeMm = fillerItems.reduce((sum, item) => sum + item.sizeMm, 0);
    const targetFirstArcSizeMm = fillerTotalSizeMm / 2;
    let splitIndex = 0;
    let bestSplitDelta = Infinity;
    let accumulatedFillerSizeMm = 0;

    for (let index = 0; index <= fillerItems.length; index += 1) {
      const delta = Math.abs(accumulatedFillerSizeMm - targetFirstArcSizeMm);
      if (delta < bestSplitDelta) {
        bestSplitDelta = delta;
        splitIndex = index;
      }

      if (index < fillerItems.length) {
        accumulatedFillerSizeMm += fillerItems[index].sizeMm;
      }
    }

    const firstArcItems = fillerItems.slice(0, splitIndex);
    const secondArcItems = fillerItems.slice(splitIndex);
    const topCharmAngleWidth = (topCharm.sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    const bottomCharmAngleWidth = (bottomCharm.sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    const availableArcAngle = Math.max(0, Math.PI - (topCharmAngleWidth / 2) - (bottomCharmAngleWidth / 2));
    const firstArcTotalSizeMm = firstArcItems.reduce((sum, item) => sum + item.sizeMm, 0);
    const secondArcTotalSizeMm = secondArcItems.reduce((sum, item) => sum + item.sizeMm, 0);
    const firstArcAnglePerMm = firstArcTotalSizeMm > 0 ? availableArcAngle / firstArcTotalSizeMm : 0;
    const secondArcAnglePerMm = secondArcTotalSizeMm > 0 ? availableArcAngle / secondArcTotalSizeMm : 0;
    const nodes = [];
    let nodeIndex = 0;
    let firstPlaceholderAssigned = false;
    const pushArcItems = (items, startAngle, anglePerMm) => {
      let currentAngle = startAngle;
      items.forEach((item) => {
        const itemAngleWidth = item.sizeMm * anglePerMm;
        const centerAngle = currentAngle + (itemAngleWidth / 2);
        const isFirstPlaceholder = item.kind === 'placeholder' && !firstPlaceholderAssigned;
        if (isFirstPlaceholder) {
          firstPlaceholderAssigned = true;
        }
        nodes.push(buildResolvedNode(item, nodeIndex, itemAngleWidth, centerAngle, isFirstPlaceholder));
        nodeIndex += 1;
        currentAngle += itemAngleWidth;
      });
    };

    nodes.push(buildResolvedNode({
      kind: 'component',
      component: topCharm,
      sizeMm: topCharm.sizeMm
    }, nodeIndex, topCharmAngleWidth, -Math.PI / 2));
    nodeIndex += 1;
    pushArcItems(firstArcItems, -Math.PI / 2 + (topCharmAngleWidth / 2), firstArcAnglePerMm);
    nodes.push(buildResolvedNode({
      kind: 'component',
      component: bottomCharm,
      sizeMm: bottomCharm.sizeMm
    }, nodeIndex, bottomCharmAngleWidth, Math.PI / 2));
    nodeIndex += 1;
    pushArcItems(secondArcItems, Math.PI / 2 + (bottomCharmAngleWidth / 2), secondArcAnglePerMm);

    return {
      braceletConfig,
      braceletComponentList,
      summary: {
        placedCount,
        braceletLengthMm: capacityMetrics.braceletLengthMm,
        charmFootprintMm: capacityMetrics.charmFootprintMm,
        stoneLengthMm: capacityMetrics.stoneLengthMm,
        totalUsedLengthMm: capacityMetrics.totalUsedLengthMm,
        usableBeadLengthMm: capacityMetrics.usableBeadLengthMm,
        uniformCapacity: capacityMetrics.uniformCapacity,
        sumPlacedDiameter,
        spaceLeft,
        numPlaceholders,
        totalItems: loopItems.length,
        totalVirtualDiameter,
        loopCircumferenceMm,
        scaleMmToPx
      },
      nodes
    };
  }

  let accumulatedAngle = -Math.PI / 2;
  if (
    loopItems.length > 0 &&
    loopItems[0].kind === 'component' &&
    loopItems[0].component.type === 'charm' &&
    isAnchoredCharmType(loopItems[0].component.charmType)
  ) {
    const firstItemAngleWidth = (loopItems[0].sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    accumulatedAngle -= firstItemAngleWidth / 2;
  }
  let firstPlaceholderAssigned = false;
  const nodes = loopItems.map((item, index) => {
    const itemAngleWidth = (item.sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    const centerAngle = accumulatedAngle + itemAngleWidth / 2;
    const isFirstPlaceholder = item.kind === 'placeholder' && !firstPlaceholderAssigned;
    if (isFirstPlaceholder) firstPlaceholderAssigned = true;
    const resolvedNode = buildResolvedNode(item, index, itemAngleWidth, centerAngle, isFirstPlaceholder);
    accumulatedAngle += itemAngleWidth;
    return resolvedNode;
  });

  return {
    braceletConfig,
    braceletComponentList,
    summary: {
      placedCount,
      braceletLengthMm: capacityMetrics.braceletLengthMm,
      charmFootprintMm: capacityMetrics.charmFootprintMm,
      stoneLengthMm: capacityMetrics.stoneLengthMm,
      totalUsedLengthMm: capacityMetrics.totalUsedLengthMm,
      usableBeadLengthMm: capacityMetrics.usableBeadLengthMm,
      uniformCapacity: capacityMetrics.uniformCapacity,
      sumPlacedDiameter,
      spaceLeft,
      numPlaceholders,
      totalItems: loopItems.length,
      totalVirtualDiameter,
      loopCircumferenceMm,
      scaleMmToPx
    },
    nodes
  };
}

function createCurrentBraceletResolvedLayout() {
  const braceletConfig = createBraceletConfig();
  const braceletComponentList = createBraceletComponentList();
  return createResolvedBraceletLayout(braceletConfig, braceletComponentList);
}

function getPlacedResolvedLayoutNodes(resolvedLayout, allowedComponentTypes = null) {
  return resolvedLayout.nodes.filter((node) => {
    if (!node.isPlaced) return false;
    if (!allowedComponentTypes) return true;
    return allowedComponentTypes.includes(node.component?.type);
  });
}

function projectResolvedLayoutToCircle(resolvedLayout, surfaceConfig) {
  const placedNodes = getPlacedResolvedLayoutNodes(resolvedLayout, surfaceConfig.componentTypes || ['stone', 'spacer']);
  const baseRadiusPx = resolvedLayout.braceletConfig.svg.radiusPx;
  const radiusScale = baseRadiusPx > 0 ? surfaceConfig.radiusPx / baseRadiusPx : 1;

  return placedNodes.map((node) => ({
    ...node,
    renderCenterX: surfaceConfig.centerX + surfaceConfig.radiusPx * Math.cos(node.centerAngle),
    renderCenterY: surfaceConfig.centerY + surfaceConfig.radiusPx * Math.sin(node.centerAngle),
    renderRadiusPx: node.radiusPx * radiusScale,
    renderScalePxPerMm: resolvedLayout.summary.scaleMmToPx * radiusScale,
    renderRotationRad: getResolvedNodeRotationRad(node)
  }));
}

function projectResolvedLayoutToLinearMap(resolvedLayout, surfaceConfig) {
  const placedNodes = getPlacedResolvedLayoutNodes(resolvedLayout, surfaceConfig.componentTypes || ['stone', 'spacer']);
  const totalBeadSizeMm = placedNodes.reduce((sum, node) => sum + node.sizeMm, 0);
  const widthScale = totalBeadSizeMm > 0 ? (surfaceConfig.availableWidth / totalBeadSizeMm) : 5;
  const linearScale = Math.min(widthScale, surfaceConfig.maxRadiusPx * 2 / surfaceConfig.referenceSizeMm);

  let accumulatedX = surfaceConfig.centerX - (totalBeadSizeMm * linearScale) / 2;
  return placedNodes.map((node) => {
    const renderRadiusPx = (node.sizeMm / 2) * linearScale;
    const renderCenterX = accumulatedX + renderRadiusPx;
    accumulatedX += node.sizeMm * linearScale;

    return {
      ...node,
      renderCenterX,
      renderCenterY: surfaceConfig.centerY,
      renderRadiusPx,
      renderScalePxPerMm: linearScale
    };
  });
}

// Core Loop Rendering (Dynamic SVG circular path)
function renderBraceletCanvas(resolvedLayout = createCurrentBraceletResolvedLayout()) {
  const svg = DOM.braceletSvg;
  // Clear SVG first, keeping defs
  let defs = svg.querySelector('defs');
  if (defs) {
    const oldClips = defs.querySelectorAll('clipPath');
    oldClips.forEach(clip => clip.remove());
  } else {
    defs = createSvgDefs();
  }
  svg.innerHTML = '';
  svg.appendChild(defs);

  const {
    braceletConfig,
    nodes,
    summary
  } = resolvedLayout;
  const { centerX: cx, centerY: cy, radiusPx: rCanvas } = braceletConfig.svg;
  
  // Draw subtle Cream-to-White gradient placeholder rail ring
  const bgRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  bgRing.setAttribute("cx", cx);
  bgRing.setAttribute("cy", cy);
  bgRing.setAttribute("r", rCanvas);
  bgRing.setAttribute("fill", "none");
  bgRing.setAttribute("stroke", "url(#creamWhiteGradient)");
  bgRing.setAttribute("stroke-width", "10");
  bgRing.setAttribute("opacity", "0.6");
  svg.appendChild(bgRing);

  nodes.forEach((node) => {
    const bx = node.centerX;
    const by = node.centerY;
    const bRadiusPx = node.radiusPx;

    // Group element for bead visual nodes
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

    if (node.isPlaced) {
      const component = node.component;
      group.setAttribute("class", `bead-node placed ${node.isNewlyAdded ? 'newly-added' : ''}`);

      if (component.type === 'charm') {
        const { widthPx: charmFrameWidthPx, heightPx: charmFrameHeightPx } = getCharmRenderFrameDimensions(component, summary.scaleMmToPx);
        const charmOutwardOffsetPx = getCharmOutwardOffsetPx(component, summary.scaleMmToPx);
        const charmCenterX = bx + (Math.cos(node.centerAngle) * charmOutwardOffsetPx);
        const charmCenterY = by + (Math.sin(node.centerAngle) * charmOutwardOffsetPx);
        const halfCharmWidth = charmFrameWidthPx / 2;
        const halfCharmHeight = charmFrameHeightPx / 2;
        const charmImageUrl = withCatalogImageVersion(component.image || '', component);
        const charmBounds = charmImageUrl ? charmVisibleBoundsCache.get(charmImageUrl) : null;
        const useCharmClip = component.edgeFitMode !== 'horizontal_fill';
        let clipId = '';
        if (useCharmClip) {
          clipId = `clip-${component.uniqueId}`;
          const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
          clip.setAttribute("id", clipId);
          const clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          clipRect.setAttribute("x", charmCenterX - halfCharmWidth);
          clipRect.setAttribute("y", charmCenterY - halfCharmHeight);
          clipRect.setAttribute("width", charmFrameWidthPx);
          clipRect.setAttribute("height", charmFrameHeightPx);
          clip.appendChild(clipRect);
          defs.appendChild(clip);
        }

        const charmImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
        charmImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", charmImageUrl);
        if (useCharmClip) {
          charmImage.setAttribute("clip-path", `url(#${clipId})`);
        }
        charmImage.setAttribute("preserveAspectRatio", "none");
        const rotationRad = getResolvedNodeRotationRad(node);
        const angleDeg = rotationRad * 180 / Math.PI;
        if (charmBounds) {
          const placement = getCharmRenderPlacement(
            component,
            charmFrameWidthPx,
            charmFrameHeightPx,
            { naturalWidth: charmBounds.sourceWidth, naturalHeight: charmBounds.sourceHeight },
            charmBounds,
            rotationRad,
            node.centerAngle,
          );
          charmImage.setAttribute("x", charmCenterX - halfCharmWidth + placement.x);
          charmImage.setAttribute("y", charmCenterY - halfCharmHeight + placement.y);
          charmImage.setAttribute("width", placement.width);
          charmImage.setAttribute("height", placement.height);
        } else {
          const fallbackPlacement = getCharmRenderPlacement(
            component,
            charmFrameWidthPx,
            charmFrameHeightPx,
            null,
            null,
            rotationRad,
            node.centerAngle
          );
          charmImage.setAttribute("x", charmCenterX - halfCharmWidth + fallbackPlacement.x);
          charmImage.setAttribute("y", charmCenterY - halfCharmHeight + fallbackPlacement.y);
          charmImage.setAttribute("width", fallbackPlacement.width);
          charmImage.setAttribute("height", fallbackPlacement.height);
          charmImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
          if (charmImageUrl) {
            scheduleCharmVisibleBoundsDetection(charmImageUrl);
          }
        }
        charmImage.setAttribute("transform", `rotate(${angleDeg}, ${charmCenterX}, ${charmCenterY})`);
        group.appendChild(charmImage);
        group.addEventListener('click', async () => {
          if (isSlotPlaceableCharmType(component.charmType)) {
            removeLoopItemFromBracelet(node.sourceIndex);
          } else {
            await removeSelectedCharm(component.selectionIndex);
          }
        });
      } else if (component.type === 'spacer') {
        const spacerSizePx = (component.renderSizeMm || component.sizeMm) * summary.scaleMmToPx;
        const halfSpacer = spacerSizePx / 2;
        const spacerImageUrl = withCatalogImageVersion(component.image || '', component);
        const angleDeg = getResolvedNodeRotationRad(node) * 180 / Math.PI;

        if (component.spacerShape === 'ball') {
          const uniqueClipId = node.uniqueClipId;
          const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
          clip.setAttribute("id", uniqueClipId);
          const clipCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          clipCircle.setAttribute("cx", bx);
          clipCircle.setAttribute("cy", by);
          clipCircle.setAttribute("r", bRadiusPx);
          clip.appendChild(clipCircle);
          defs.appendChild(clip);

          const baseCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          baseCircle.setAttribute("cx", bx);
          baseCircle.setAttribute("cy", by);
          baseCircle.setAttribute("r", bRadiusPx);
          baseCircle.setAttribute("fill", component.color === 'white' ? '#F5F3EE' : '#E8DCC7');
          group.appendChild(baseCircle);

          const imgGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
          imgGroup.setAttribute("clip-path", `url(#${uniqueClipId})`);
          const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
          img.setAttributeNS("http://www.w3.org/1999/xlink", "href", spacerImageUrl);
          const spacerBounds = spacerImageUrl ? charmVisibleBoundsCache.get(spacerImageUrl) : null;
          if (spacerBounds) {
            const placement = getVisibleBoundsPlacement(spacerSizePx, spacerSizePx, null, spacerBounds);
            img.setAttribute("x", bx - halfSpacer + placement.x);
            img.setAttribute("y", by - halfSpacer + placement.y);
            img.setAttribute("width", placement.width);
            img.setAttribute("height", placement.height);
            img.setAttribute("preserveAspectRatio", "none");
          } else {
            img.setAttribute("x", bx - halfSpacer);
            img.setAttribute("y", by - halfSpacer);
            img.setAttribute("width", spacerSizePx);
            img.setAttribute("height", spacerSizePx);
            img.setAttribute("preserveAspectRatio", "xMidYMid meet");
            if (spacerImageUrl) {
              scheduleCharmVisibleBoundsDetection(spacerImageUrl);
            }
          }
          img.setAttribute("transform", `rotate(${angleDeg}, ${bx}, ${by})`);
          imgGroup.appendChild(img);
          group.appendChild(imgGroup);
        } else {
          const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
          img.setAttributeNS("http://www.w3.org/1999/xlink", "href", spacerImageUrl);
          img.setAttribute("x", bx - halfSpacer);
          img.setAttribute("y", by - halfSpacer);
          img.setAttribute("width", spacerSizePx);
          img.setAttribute("height", spacerSizePx);
          img.setAttribute("preserveAspectRatio", "xMidYMid meet");
          img.setAttribute("transform", `rotate(${angleDeg}, ${bx}, ${by})`);
          group.appendChild(img);
        }

        group.addEventListener('click', () => removeLoopItemFromBracelet(node.sourceIndex));
      } else {
        const stoneId = component.stoneId;
        const stoneData = STONES.find(s => s.id === stoneId) || STONES[0];
        const uniqueClipId = node.uniqueClipId;
        
        const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clip.setAttribute("id", uniqueClipId);
        const clipCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        clipCircle.setAttribute("cx", bx);
        clipCircle.setAttribute("cy", by);
        clipCircle.setAttribute("r", bRadiusPx);
        clip.appendChild(clipCircle);
        defs.appendChild(clip);
        
        const baseCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        baseCircle.setAttribute("cx", bx);
        baseCircle.setAttribute("cy", by);
        baseCircle.setAttribute("r", bRadiusPx);
        baseCircle.setAttribute("fill", stoneData.color || '#E2E8F0');
        group.appendChild(baseCircle);
        
        const imgGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        imgGroup.setAttribute("clip-path", `url(#${uniqueClipId})`);
        
        const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttributeNS("http://www.w3.org/1999/xlink", "href", withCatalogImageVersion(stoneData.image, stoneData));
        const scaleFactor = 1.3;
        const imgSize = bRadiusPx * 2 * scaleFactor;
        img.setAttribute("x", bx - imgSize / 2);
        img.setAttribute("y", by - imgSize / 2);
        img.setAttribute("width", imgSize);
        img.setAttribute("height", imgSize);
        img.setAttribute("class", "bead-image");
        const angleDeg = (node.centerAngle * 180 / Math.PI) + 90;
        img.setAttribute("transform", `rotate(${angleDeg}, ${bx}, ${by})`);
        imgGroup.appendChild(img);
        group.appendChild(imgGroup);
        
        const sheenCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        sheenCircle.setAttribute("cx", bx);
        sheenCircle.setAttribute("cy", by);
        sheenCircle.setAttribute("r", bRadiusPx);
        sheenCircle.setAttribute("fill", "url(#sphericalShading)");
        sheenCircle.setAttribute("opacity", "0.38");
        sheenCircle.setAttribute("pointer-events", "none");
        group.appendChild(sheenCircle);
        
        const border = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        border.setAttribute("cx", bx);
        border.setAttribute("cy", by);
        border.setAttribute("r", bRadiusPx - 0.5);
        border.setAttribute("fill", "none");
        border.setAttribute("stroke", stoneData.color);
        border.setAttribute("stroke-width", "1");
        border.setAttribute("opacity", "0.5");
        group.appendChild(border);
        
        if (node.isActiveSlot) {
          const activeRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          activeRing.setAttribute("cx", bx);
          activeRing.setAttribute("cy", by);
          activeRing.setAttribute("r", bRadiusPx + 2.5);
          activeRing.setAttribute("fill", "none");
          activeRing.setAttribute("stroke", "var(--color-accent-velvet)");
          activeRing.setAttribute("stroke-width", "2.5");
          activeRing.setAttribute("stroke-dasharray", "3 2");
          activeRing.setAttribute("class", "active-bead-glow");
          activeRing.setAttribute("filter", "drop-shadow(0 0 4px var(--color-accent-velvet))");
          group.appendChild(activeRing);
        }
        
        const currentIdx = node.sourceIndex;
        group.addEventListener('click', () => removeLoopItemFromBracelet(currentIdx));
      }
      
    } else {
      group.setAttribute("class", "bead-node placeholder");
      // It is a placeholder empty slot, rendered as a Pastel Purple dotted circle outline
      const isFirstPlaceholder = node.isFirstPlaceholder;
      
      // Dotted/dashed circle slot
      const slot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      slot.setAttribute("cx", bx);
      slot.setAttribute("cy", by);
      slot.setAttribute("r", bRadiusPx - 1);
      slot.setAttribute("fill", "none");
      // Use Velvet Red for the active target placeholder, and Pastel Purple (var(--color-lavender-dark)) for other empty slots
      slot.setAttribute("stroke", isFirstPlaceholder ? "var(--color-accent-velvet)" : "var(--color-lavender-dark)");
      slot.setAttribute("stroke-width", isFirstPlaceholder ? "2.5" : "1.5");
      slot.setAttribute("stroke-dasharray", isFirstPlaceholder ? "4 2" : "3 3");
      slot.setAttribute("class", "bead-slot-border");
      
      if (isFirstPlaceholder) {
        slot.setAttribute("filter", "drop-shadow(0 0 5px var(--color-accent-velvet))");
        // Pulse glow for target insertion slot
        group.classList.add("active");
      }
      group.appendChild(slot);
      
      // Little plus icon inside target slot
      if (isFirstPlaceholder && bRadiusPx > 8) {
        const plus1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        plus1.setAttribute("x1", bx - 4);
        plus1.setAttribute("y1", by);
        plus1.setAttribute("x2", bx + 4);
        plus1.setAttribute("y2", by);
        plus1.setAttribute("stroke", "var(--color-accent-velvet)");
        plus1.setAttribute("stroke-width", "1.5");
        
        const plus2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        plus2.setAttribute("x1", bx);
        plus2.setAttribute("y1", by - 4);
        plus2.setAttribute("x2", bx);
        plus2.setAttribute("y2", by + 4);
        plus2.setAttribute("stroke", "var(--color-accent-velvet)");
        plus2.setAttribute("stroke-width", "1.5");
        
        group.appendChild(plus1);
        group.appendChild(plus2);
      }
      
      // Add active index slot choice
      group.addEventListener('click', () => {
        State.activeSlotIndex = Number.isInteger(node.sourceIndex) ? node.sourceIndex : null;
        showToast("Select a stone or spacer from the catalog below to add!");
      });
    }
    
    svg.appendChild(group);
  });

}

// Setup SVG defs for sheen gradient
function createSvgDefs() {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  
  const radGrad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
  radGrad.setAttribute("id", "sphericalShading");
  radGrad.setAttribute("cx", "32%");
  radGrad.setAttribute("cy", "32%");
  radGrad.setAttribute("r", "68%");
  
  const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#ffffff");
  stop1.setAttribute("stop-opacity", "0.65");
  
  const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop2.setAttribute("offset", "45%");
  stop2.setAttribute("stop-color", "#ffffff");
  stop2.setAttribute("stop-opacity", "0.15");
  
  const stop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop3.setAttribute("offset", "85%");
  stop3.setAttribute("stop-color", "#000000");
  stop3.setAttribute("stop-opacity", "0.16");
  
  const stop4 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop4.setAttribute("offset", "100%");
  stop4.setAttribute("stop-color", "#000000");
  stop4.setAttribute("stop-opacity", "0.28");
  
  radGrad.appendChild(stop1);
  radGrad.appendChild(stop2);
  radGrad.appendChild(stop3);
  radGrad.appendChild(stop4);
  defs.appendChild(radGrad);
  
  // Cream to White linear gradient for the placeholder rail ring
  const creamWhiteGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  creamWhiteGrad.setAttribute("id", "creamWhiteGradient");
  creamWhiteGrad.setAttribute("x1", "0%");
  creamWhiteGrad.setAttribute("y1", "0%");
  creamWhiteGrad.setAttribute("x2", "100%");
  creamWhiteGrad.setAttribute("y2", "100%");
  
  const gStop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  gStop1.setAttribute("offset", "0%");
  gStop1.setAttribute("stop-color", "#FFFDF9");
  
  const gStop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  gStop2.setAttribute("offset", "50%");
  gStop2.setAttribute("stop-color", "#E8E2D5");
  
  const gStop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  gStop3.setAttribute("offset", "100%");
  gStop3.setAttribute("stop-color", "#FAF6EE");
  
  creamWhiteGrad.appendChild(gStop1);
  creamWhiteGrad.appendChild(gStop2);
  creamWhiteGrad.appendChild(gStop3);
  defs.appendChild(creamWhiteGrad);
  
  return defs;
}

// Render step 3 workspace elements
function renderStep3() {
  const resolvedLayout = createCurrentBraceletResolvedLayout();
  const validationState = getStep3ValidationState(resolvedLayout);
  const pricing = calculateLiveBraceletPricing();
  
  const braceletLengthMm = validationState.braceletLengthMm;
  const totalDiameter = validationState.totalDiameter;
  const remainingSpace = validationState.remainingSpace;
  
  if (DOM.mixedSizeSelectorBar) {
    DOM.mixedSizeSelectorBar.style.display = 'none';
  }
  
  // Render statistics text
  DOM.canvasPriceText.textContent = `฿${pricing.subtotal.toLocaleString()}`;
  const canvasInfoRow = document.querySelector('#stepView3 .canvas-info-row');
  if (canvasInfoRow) {
    const helperText = canvasInfoRow.querySelector('.helper-tooltip');
    if (helperText) {
      helperText.textContent = '\u0e41\u0e15\u0e30\u0e17\u0e35\u0e48\u0e2b\u0e34\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e25\u0e1a';
    }

    let inlinePrice = canvasInfoRow.querySelector('.canvas-inline-price');
    if (!inlinePrice) {
      inlinePrice = document.createElement('span');
      inlinePrice.className = 'canvas-inline-price';
      canvasInfoRow.appendChild(inlinePrice);
    }
    inlinePrice.textContent = `Price \u0e3f${pricing.subtotal.toLocaleString()}`;
  }
  if (false) {
  
  const capText = `${State.selectedStones.length} / ${validationState.capacity} เน€เธกเนเธ”`;
  if (false) {
    capText = `${State.selectedStones.length} เม็ด`;
  } else {
    const size = parseInt(State.beadSize);
    const capacity = Math.floor(braceletLengthMm / size);
    capText = `${State.selectedStones.length} / ${capacity} เม็ด`;
  }
  if (false) {
    capText = `${State.selectedStones.length} / ${validationState.capacity} เม็ด`;
  }
  DOM.canvasBeadCountText.textContent = capText;
  }
  DOM.canvasBeadCountText.textContent = `${getSelectedStoneItems().length} / ${validationState.capacity} beads`;
  
  const remainingSpaceText = `เหลือ ${remainingSpace.toFixed(1)} mm`;
  DOM.canvasSpaceText.textContent = remainingSpaceText;
  
  // Update mixed space context if exists
  const mixedSpaceText = document.getElementById('mixedSpaceText');
  if (mixedSpaceText) {
    mixedSpaceText.textContent = remainingSpaceText;
  }
  
  // Update wrist context label
  const wristContext = document.getElementById('canvasWristContext');
  if (wristContext) {
    wristContext.textContent = `ข้อมือ ${State.wristSize.toFixed(1)} cm`;
  }
  
  // Center label inside circular design canvas
  DOM.canvasCenterValue.textContent = `${State.wristSize.toFixed(1)} cm`;
  if (validationState.isOverflow || remainingSpace <= 1.0) {
    DOM.canvasCenterSub.textContent = "Full Capacity";
    DOM.canvasCenterSub.className = "center-subvalue overflow";
  } else {
    DOM.canvasCenterSub.textContent = "Perfect Fit";
    DOM.canvasCenterSub.className = "center-subvalue fit";
  }
  
  // Render SVG loop and catalog
  renderBraceletCanvas(resolvedLayout);
  renderCatalogGrid();
  renderCharmOptions();
  syncCatalogSectionFilter();
  syncStep3NextValidationUI(validationState);
  
  // Clear newly added IDs after rendering so they only animate on insertion
  State.newlyAddedIds = [];
}

// ==========================================
// 9. Step 4: Final Summary & Commercial Logic
// ==========================================
function renderOrderDetailErrorState(message) {
  const step4View = document.getElementById('stepView4');
  if (!step4View) return;

  step4View.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'summary-card';
  const header = document.createElement('div');
  header.className = 'summary-header';
  const title = document.createElement('h2');
  title.textContent = 'Order not found';
  const body = document.createElement('p');
  body.textContent = message || 'We could not load this order. Please check the link or contact Lucky Colorstone.';

  header.appendChild(title);
  header.appendChild(body);
  card.appendChild(header);
  step4View.appendChild(card);

  if (DOM.appFooter) {
    DOM.appFooter.style.display = 'none';
  }
}

async function renderStep4() {
  if (State.orderDetailLoadError) {
    renderOrderDetailErrorState(State.orderDetailLoadError);
    return;
  }

  // Set today's date formatted
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const today = new Date();
  DOM.summaryDateText.textContent = `Date: ${today.toLocaleDateString('en-US', options)}`;
  if (DOM.summaryTitleText) {
    DOM.summaryTitleText.textContent = '';
  }
  renderBraceletShowcaseCard();

  const currentPreviewKey = getBraceletShowcaseRenderKey();
  braceletShowcaseRenderKey = currentPreviewKey;
  const heroPreview = document.getElementById('exportHeroPreview');
  const heroLoading = document.getElementById('exportHeroLoading');
  const btnHero = document.getElementById('btnDownloadHero');
  const savedPreviewImage = State.orderDetailMode && State.orderDetailSnapshot
    ? getSavedOrderBraceletPreviewImage(State.orderDetailSnapshot)
    : '';
  if (savedPreviewImage && heroPreview) {
    State.braceletPreviewImage = savedPreviewImage;
    State.braceletPreviewKey = currentPreviewKey;
    heroPreview.src = savedPreviewImage;
    heroPreview.style.display = 'block';
    heroPreview.dataset.previewKey = currentPreviewKey;
    if (heroLoading) heroLoading.style.display = 'none';
    if (btnHero) btnHero.disabled = false;
  }
  const isPreviewReady = heroPreview && heroPreview.dataset.previewKey === currentPreviewKey && heroPreview.src;

  if (isPreviewReady) {
    if (heroLoading) heroLoading.style.display = 'none';
    if (btnHero) btnHero.disabled = false;
  } else if (!braceletShowcaseGenerationInFlight) {
    if (heroPreview) heroPreview.style.display = 'none';
    if (heroLoading) heroLoading.style.display = 'block';
    if (btnHero) btnHero.disabled = true;
  }
  
  // Specs boxes
  DOM.specWristSize.textContent = `${State.wristSize.toFixed(1)} cm`;
  DOM.specLength.textContent = `${(State.wristSize + TOLERANCE_CM).toFixed(1)} cm`;
  
  DOM.specBeadSize.textContent = `${getCurrentBeadSizeMm()}mm`;
  const checkoutSummary = State.orderDetailMode && State.orderDetailSnapshot
    ? buildOrderDetailCheckoutSummary(State.orderDetailSnapshot)
    : rememberCheckoutSummary(buildCheckoutSummary());
  const selectedStoneItems = Array.isArray(checkoutSummary.selectedStoneItems) ? checkoutSummary.selectedStoneItems : [];
  const spacerData = checkoutSummary.spacerData || buildSelectedSpacerOrderData();
  DOM.specBeadsCount.textContent = `${selectedStoneItems.length} เม็ด`;
  renderShippingForm();
  
  // Aggregate stones selected for receipt and meanings
  const aggregatedStones = checkoutSummary.aggregatedStones || {};
  const uniqueStoneIds = normalizeUniqueStoneIds(checkoutSummary.uniqueStoneIds);
  const charmData = checkoutSummary.charmData || buildSelectedCharmOrderData();
  const selectedCharms = Array.isArray(charmData.charms) ? charmData.charms : [];
  
  [].forEach((placedBead) => {
    const key = `${placedBead.stoneId}_${placedBead.size}`;
    uniqueStoneIds.add(placedBead.stoneId);
    
    const stoneData = STONES.find(s => s.id === placedBead.stoneId);
    const price = getStonePriceForSize(stoneData, placedBead.size);
    
    if (aggregatedStones[key]) {
      aggregatedStones[key].count++;
      aggregatedStones[key].totalPrice += price;
    } else {
      aggregatedStones[key] = {
        stoneId: placedBead.stoneId,
        name: stoneData ? stoneData.name : 'Unknown Stone',
        nameTh: stoneData ? stoneData.nameTh : 'หินธรรมชาติ',
        image: stoneData ? stoneData.image : '',
        size: placedBead.size,
        count: 1,
        priceUnit: price,
        totalPrice: price
      };
    }
  });
  
  // Populate billing items list
  DOM.billingItemsList.innerHTML = '';
  let subtotal = 0;
  
  Object.values(aggregatedStones).forEach(item => {
    subtotal += item.totalPrice;
    
    const div = document.createElement('div');
    div.className = 'billing-item';
    
    div.innerHTML = `
      <div class="billing-item-info">
        <div class="billing-item-thumbnail">
          <img class="billing-thumbnail-img" src="${withCatalogImageVersion(item.image, item)}" alt="${item.name}">
        </div>
        <div class="billing-item-name">
          <h5>${item.nameTh} (${item.name})</h5>
          <p>${item.size}mm x ${item.count} เม็ด</p>
        </div>
      </div>
      <div class="billing-item-price">฿${item.totalPrice.toLocaleString()}</div>
    `;
    
    DOM.billingItemsList.appendChild(div);
  });

  selectedCharms.forEach((selectedCharm) => {
    subtotal += Number(selectedCharm.price || 0);

    const div = document.createElement('div');
    div.className = 'billing-item';
    div.innerHTML = `
      <div class="billing-item-info">
        <div class="billing-item-thumbnail">
          <img class="billing-thumbnail-img" src="${withCatalogImageVersion(selectedCharm.image, selectedCharm)}" alt="${selectedCharm.nameEn}">
        </div>
        <div class="billing-item-name">
          <h5>${selectedCharm.nameTh} (${selectedCharm.nameEn})</h5>
          <p>${Number(selectedCharm.sizeCm || 0).toFixed(1)} cm (${getCharmFootprintMm(selectedCharm)}mm) x 1 ชิ้น</p>
        </div>
      </div>
      <div class="billing-item-price">฿${Number(selectedCharm.price || 0).toLocaleString()}</div>
    `;

    DOM.billingItemsList.appendChild(div);
  });

  const aggregatedSpacers = spacerData.spacers.reduce((spacerMap, spacer) => {
    const key = `${spacer.spacerId}_${spacer.effectiveLengthMm}`;
    if (!spacerMap[key]) {
      spacerMap[key] = {
        ...spacer,
        count: 0,
        totalPrice: 0
      };
    }
    spacerMap[key].count += 1;
    spacerMap[key].totalPrice += Number(spacer.price || 0);
    return spacerMap;
  }, {});

  Object.values(aggregatedSpacers).forEach((spacer) => {
    subtotal += Number(spacer.totalPrice || 0);

    const div = document.createElement('div');
    div.className = 'billing-item';
    div.innerHTML = `
      <div class="billing-item-info">
        <div class="billing-item-thumbnail">
          <img class="billing-thumbnail-img" src="${withCatalogImageVersion(spacer.image, spacer)}" alt="${spacer.nameEn}">
        </div>
        <div class="billing-item-name">
          <h5>${spacer.nameTh} (${spacer.nameEn})</h5>
          <p>${spacer.displaySizeMm}mm visual / ${spacer.effectiveLengthMm}mm length x ${spacer.count} ชิ้น</p>
        </div>
      </div>
      <div class="billing-item-price">฿${Number(spacer.totalPrice || 0).toLocaleString()}</div>
    `;

    DOM.billingItemsList.appendChild(div);
  });
  
  // Use saved order pricing in order-detail mode; otherwise use the current effective discount settings.
  const savedOrderSnapshot = State.orderDetailSnapshot;
  const savedSubtotal = Number(savedOrderSnapshot?.subtotal);
  const savedDiscountPercent = Number(savedOrderSnapshot?.discountPercent);
  const savedDiscountAmount = Number(savedOrderSnapshot?.discountAmount);
  const savedFinalPrice = Number(
    savedOrderSnapshot?.finalPrice ??
    savedOrderSnapshot?.totalPrice ??
    savedOrderSnapshot?.netPrice
  );
  subtotal = Number.isFinite(savedSubtotal) ? savedSubtotal : checkoutSummary.subtotal;
  const discountPercent = Number.isFinite(savedDiscountPercent) ? savedDiscountPercent : checkoutSummary.discountPercent;
  const discount = Number.isFinite(savedDiscountAmount) ? savedDiscountAmount : checkoutSummary.discountAmount;
  const finalPrice = Number.isFinite(savedFinalPrice) ? savedFinalPrice : checkoutSummary.finalPrice;
  
  DOM.priceSubtotal.textContent = `฿${subtotal.toLocaleString()}`;
  DOM.priceSubtotal.style.textDecoration = discount > 0 ? '' : 'none';
  DOM.priceDiscount.textContent = `-฿${discount.toLocaleString()}`;
  
  // Update discount badge text dynamically
  const discountBadge = document.getElementById('priceDiscountBadge');
  if (discountBadge) {
    discountBadge.textContent = `LINE SPECIAL DISCOUNT ${discountPercent}%`;
  }
  const discountBox = discountBadge?.closest('.discount-box');
  if (discountBox) {
    discountBox.style.display = State.showDiscountBanner === false || discountPercent <= 0 || discount <= 0 ? 'none' : '';
  }
  
  DOM.priceTotal.textContent = `฿${finalPrice.toLocaleString()}`;
  
  // Populate charm + stone meanings
  DOM.meaningsList.innerHTML = '';
  buildStep4MeaningEntries(uniqueStoneIds, selectedCharms).forEach((entry) => {
    DOM.meaningsList.appendChild(createMeaningItemElement(entry));
  });

  // Trigger HTML5 Canvas image compilation in the background asynchronously
  if (isPreviewReady) {
    return;
  }

  braceletShowcaseGenerationInFlight = true;
  setTimeout(async () => {
    try {
      await generateImageExports(subtotal, discount, finalPrice, aggregatedStones, uniqueStoneIds, currentPreviewKey);
    } catch (e) {
      console.error("Canvas compilation failed", e);
      renderBraceletShowcaseFallback(currentPreviewKey);
    } finally {
      braceletShowcaseGenerationInFlight = false;
      if (braceletShowcaseRenderKey !== currentPreviewKey) {
        await renderStep4();
      }
    }
  }, 100);
}

function buildDesignConfigurationCode() {
  const selectedStoneItems = getSelectedStoneItems();
  const selectedSpacerItems = getSelectedSpacerItems();
  const designData = {
    w: State.wristSize,
    b: State.beadSize,
    n: State.ownerName,
    c: normalizeSelectedCharmIds(State.selectedCharmIds),
    s: selectedStoneItems.map((stone) => ({ i: stone.stoneId, z: stone.size })),
    p: selectedSpacerItems.map((spacer) => ({ i: spacer.id, l: spacer.effectiveLengthMm })),
    l: State.selectedStones.map((item) => serializeSelectedLoopItem(item))
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(designData))));
}

function getSavedOrderBraceletPreviewImage(order = {}) {
  order = normalizeSavedOrder(order) || {};
  const candidates = [
    order.braceletPreviewImage,
    order.braceletPreviewDataUrl,
    order.braceletPreviewSnapshot,
    order.checkoutSummary?.braceletPreviewImage,
    order.checkoutSummary?.braceletPreviewDataUrl,
    order.checkoutSummary?.braceletPreviewSnapshot
  ];
  return candidates.find((value) => typeof value === 'string' && value.startsWith('data:image/')) || '';
}

function getCurrentBraceletPreviewImage() {
  const currentPreviewKey = State.currentStep === 4 ? getBraceletShowcaseRenderKey() : '';
  if (
    typeof State.braceletPreviewImage === 'string' &&
    State.braceletPreviewImage.startsWith('data:image/') &&
    (!currentPreviewKey || State.braceletPreviewKey === currentPreviewKey)
  ) {
    return State.braceletPreviewImage;
  }

  const heroPreview = document.getElementById('exportHeroPreview');
  const previewSrc = heroPreview?.src || '';
  if (
    previewSrc.startsWith('data:image/') &&
    (!currentPreviewKey || heroPreview?.dataset.previewKey === currentPreviewKey)
  ) {
    State.braceletPreviewImage = previewSrc;
    State.braceletPreviewKey = currentPreviewKey;
    return previewSrc;
  }

  return '';
}

function createCompactBraceletPreviewDataUrl(sourceDataUrl, targetSize = 420) {
  if (typeof sourceDataUrl !== 'string' || !sourceDataUrl.startsWith('data:image/')) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sourceWidth = img.naturalWidth || img.width || targetSize;
      const sourceHeight = img.naturalHeight || img.height || targetSize;
      const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight, 1);
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const webpDataUrl = canvas.toDataURL('image/webp', 0.86);
      resolve(webpDataUrl.startsWith('data:image/webp') ? webpDataUrl : canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = sourceDataUrl;
  });
}

async function rememberBraceletPreviewImage(sourceDataUrl) {
  const compactPreview = await createCompactBraceletPreviewDataUrl(sourceDataUrl);
  if (compactPreview) {
    State.braceletPreviewImage = compactPreview;
    State.braceletPreviewKey = getBraceletShowcaseRenderKey();
  }
  return compactPreview;
}

async function ensureBraceletPreviewImage(timeoutMs = 1800) {
  const existingPreview = getCurrentBraceletPreviewImage();
  if (existingPreview) return existingPreview;

  if (State.currentStep === 4 && !braceletShowcaseGenerationInFlight) {
    const summary = getEffectiveCheckoutSummary(buildCheckoutSummary());
    const uniqueStoneIds = normalizeUniqueStoneIds(summary.uniqueStoneIds);
    const previewKey = braceletShowcaseRenderKey || getBraceletShowcaseRenderKey();
    braceletShowcaseRenderKey = previewKey;
    braceletShowcaseGenerationInFlight = true;
    try {
      await generateImageExports(
        summary.subtotal,
        summary.discountAmount,
        summary.finalPrice,
        summary.aggregatedStones || {},
        uniqueStoneIds,
        previewKey
      );
    } catch (error) {
      console.warn('Unable to generate bracelet preview snapshot before saving order', error);
    } finally {
      braceletShowcaseGenerationInFlight = false;
    }
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const readyPreview = getCurrentBraceletPreviewImage();
    if (readyPreview) return readyPreview;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  return '';
}

function buildCurrentOrderPayload(overrides = {}) {
  const pricing = getEffectiveCheckoutSummary(buildCheckoutSummary());
  const charmData = pricing.charmData || buildCharmOrderDataFromItems(pricing.itemizedBilling || pricing.braceletSequence || []);
  const spacerData = pricing.spacerData || buildSpacerOrderDataFromItems(pricing.itemizedBilling || pricing.braceletSequence || []);
  const shippingInfo = getShippingInfoSnapshot({ trimValues: true });
  const selectedStoneItems = Array.isArray(pricing.selectedStoneItems) ? pricing.selectedStoneItems : [];
  const braceletPreviewImage = getCurrentBraceletPreviewImage();

  return {
    customerName: State.ownerName || "Khun Guest",
    lineUserId: State.lineUserId || '',
    wristSize: State.wristSize,
    beadSize: State.beadSize,
    totalBeads: selectedStoneItems.length,
    beads: selectedStoneItems.map((stone) => {
      const stoneData = STONES.find((entry) => entry.id === stone.stoneId);
      return {
        stoneId: stone.stoneId,
        name: stoneData ? stoneData.name : 'Unknown Stone',
        nameTh: stoneData ? stoneData.nameTh : 'หินธรรมชาติ',
        color: stoneData ? stoneData.color : '#E2E8F0',
        image: stoneData ? stoneData.image : '',
        size: stone.size
      };
    }),
    subtotal: pricing.subtotal,
    discountPercent: pricing.discountPercent,
    discountAmount: pricing.discountAmount,
    netPrice: pricing.finalPrice,
    finalPrice: pricing.finalPrice,
    totalPrice: pricing.finalPrice,
    checkoutSummary: {
      subtotal: pricing.subtotal,
      discountPercent: pricing.discountPercent,
      discountAmount: pricing.discountAmount,
      finalPrice: pricing.finalPrice,
      totalPrice: pricing.finalPrice,
      netPrice: pricing.finalPrice
    },
    braceletPreviewImage,
    itemizedBilling: pricing.itemizedBilling,
    braceletSequence: pricing.braceletSequence,
    beadMap: pricing.beadMap,
    selectedCharms: charmData.charms,
    selectedSpacers: spacerData.spacers,
    configurationCode: buildDesignConfigurationCode(),
    shippingInfo,
    recipientName: shippingInfo.recipientName,
    phoneNumber: shippingInfo.phoneNumber,
    addressLine: shippingInfo.addressLine,
    province: shippingInfo.province,
    postalCode: shippingInfo.postalCode,
    ...charmData,
    ...spacerData,
    ...overrides
  };
}

function cleanupStripeReturnParams() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('stripe');
  nextUrl.searchParams.delete('session_id');
  if (nextUrl.searchParams.get('step') === '4') {
    nextUrl.searchParams.delete('step');
  }

  window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

function activatePaymentCompletedView(savedOrder = null) {
  State.currentStep = 4;
  State.landingDismissed = true;
  State.paymentCompletedView = true;
  savedOrder = normalizeSavedOrder(savedOrder);

  if (savedOrder && typeof savedOrder === 'object') {
    State.orderDetailSnapshot = savedOrder;
    State.checkoutSummarySnapshot = buildOrderDetailCheckoutSummary(savedOrder);
    if (savedOrder.shippingInfo || savedOrder.recipientName || savedOrder.phoneNumber || savedOrder.addressLine) {
      State.shippingInfo = normalizeShippingInfo(savedOrder.shippingInfo || {
        recipientName: savedOrder.recipientName || '',
        phoneNumber: savedOrder.phoneNumber || '',
        addressLine: savedOrder.addressLine || '',
        province: savedOrder.province || '',
        postalCode: savedOrder.postalCode || ''
      });
    }
  }

  saveState();
  persistLandingDismissed();
}

async function handleStripeReturnIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const stripeState = params.get('stripe');
  if (!stripeState) return;

  State.currentStep = 4;
  State.landingDismissed = true;

  if (stripeState === 'cancel') {
    cleanupStripeReturnParams();
    showToast("Stripe payment cancelled. You can continue from Step 4.");
    return;
  }

  if (stripeState !== 'success') return;

  const sessionId = params.get('session_id');
  if (!sessionId) {
    showToast("Stripe return is missing the checkout session.");
    return;
  }

  const processedKey = `stripe_checkout_processed_${sessionId}`;
  if (localStorage.getItem(processedKey) === 'true') {
    const existingOrders = await getSharedOrders();
    const processedOrder = Array.isArray(existingOrders)
      ? existingOrders.map((order) => normalizeSavedOrder(order)).find((order) => order?.stripeCheckoutSessionId === sessionId)
      : null;
    activatePaymentCompletedView(processedOrder || null);
    cleanupStripeReturnParams();
    showToast("Stripe payment already confirmed.");
    return;
  }

  try {
    const response = await fetch(`/api/stripe/checkout-session?session_id=${encodeURIComponent(sessionId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Unable to verify Stripe payment.");
    }

    if (payload.paymentStatus !== 'paid') {
      throw new Error("Stripe payment is not marked as paid yet.");
    }

    const existingOrders = await getSharedOrders();
    const existingOrder = Array.isArray(existingOrders)
      ? existingOrders.map((order) => normalizeSavedOrder(order)).find((order) => order?.stripeCheckoutSessionId === sessionId)
      : null;
    const shippingInfo = resolveShippingInfoFromCheckoutPayload(payload);
    const phoneNumber = typeof payload.phoneNumber === 'string' && payload.phoneNumber.trim()
      ? payload.phoneNumber.trim()
      : shippingInfo.phoneNumber;
    const persistedShippingInfo = {
      ...shippingInfo,
      phoneNumber
    };
    State.shippingInfo = persistedShippingInfo;
    saveState();
    const shippingDetails = payload.shippingDetails && typeof payload.shippingDetails === 'object'
      ? payload.shippingDetails
      : getShippingDetailsFromInfo(persistedShippingInfo);
    const shippingAddress = shippingDetails?.address || getShippingAddressFromInfo(persistedShippingInfo);
    let savedOrder = existingOrder || null;

    if (!existingOrder) {
      const paymentUpdates = {
        status: 'Payment Received',
        paymentMethod: 'stripe_checkout',
        stripeCheckoutSessionId: sessionId,
        stripeCheckoutStatus: payload.status || '',
        stripePaymentStatus: payload.paymentStatus || '',
        shippingInfo: persistedShippingInfo,
        recipientName: persistedShippingInfo.recipientName,
        shippingDetails,
        shippingAddress,
        phoneNumber,
        addressLine: persistedShippingInfo.addressLine,
        province: persistedShippingInfo.province,
        postalCode: persistedShippingInfo.postalCode
      };
      const pendingStripeOrderPayload = readStripeOrderPayload(sessionId);
      savedOrder = pendingStripeOrderPayload
        ? await addSharedOrder({
          ...pendingStripeOrderPayload,
          ...paymentUpdates
        })
        : await submitOrderToCRM(false, paymentUpdates);

      if (!savedOrder) {
        throw new Error("Payment succeeded, but the order could not be saved from the current design state.");
      }
    }

    activatePaymentCompletedView(savedOrder);
    localStorage.setItem(processedKey, 'true');
    clearStripeOrderPayload(sessionId);
    cleanupStripeReturnParams();
    showToast("Stripe payment received. Your order was saved to CRM.");
  } catch (error) {
    console.error("Stripe return verification failed", error);
    showToast(error.message || "Stripe payment verification failed.");
  }
}

async function handleStripeCheckout() {
  if (State.orderDetailMode || State.paymentCompletedView) {
    showToast("This order has already been created.");
    return;
  }

  if (getSelectedStoneItems().length === 0) {
    showToast("Bracelet is empty!");
    return;
  }

  const hasLineLogin = await requireLineLoginForCustomization();
  if (!hasLineLogin) {
    return;
  }

  const shippingInfo = validateShippingInfo();
  if (!shippingInfo) {
    return;
  }

  const checkoutButton = State.currentStep === 4 ? DOM.btnNext : DOM.btnPayWithStripe;
  if (!checkoutButton) return;

  const originalMarkup = checkoutButton.innerHTML;
  checkoutButton.disabled = true;
  checkoutButton.textContent = 'กำลังพาไปชำระเงิน...';
  State.landingDismissed = true;
  saveState();

  try {
    await ensureBraceletPreviewImage();
    const orderPayload = buildCurrentOrderPayload({
      shippingInfo,
      recipientName: shippingInfo.recipientName,
      phoneNumber: shippingInfo.phoneNumber,
      addressLine: shippingInfo.addressLine,
      province: shippingInfo.province,
      postalCode: shippingInfo.postalCode,
      paymentMethod: 'stripe_checkout',
      stripePaymentStatus: 'pending'
    });
    const response = await fetch('/api/stripe/checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: window.location.origin,
        order: orderPayload
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Unable to create Stripe Checkout session.");
    }

    if (!payload.url) {
      throw new Error("Stripe Checkout session did not include a redirect URL.");
    }

    rememberStripeOrderPayload(payload.id, orderPayload);
    window.location.assign(payload.url);
  } catch (error) {
    console.error("Stripe checkout creation failed", error);
    checkoutButton.disabled = false;
    checkoutButton.innerHTML = originalMarkup;
    showToast(error.message || "Stripe Checkout could not be started.");
  }
}

function renderBraceletShowcaseCard() {
  const step4 = document.getElementById('stepView4');
  if (!step4) return;

  const showcaseCard = step4.querySelector('.billing-card');
  if (!showcaseCard || showcaseCard.dataset.braceletShowcaseReady === '1') return;

  showcaseCard.classList.add('bracelet-showcase-card');
  showcaseCard.innerHTML = `
    <div class="bracelet-showcase-frame">
      <img id="exportHeroPreview" class="bracelet-showcase-image" style="display: none;" alt="Bracelet Preview">
      <span id="exportHeroLoading" class="bracelet-showcase-loading">Generating...</span>
    </div>
  `;
  showcaseCard.dataset.braceletShowcaseReady = '1';
}

function getBraceletShowcaseRenderKey() {
  return JSON.stringify({
    wristSize: State.wristSize,
    beadSize: State.beadSize,
    mixedPlacingSize: State.mixedPlacingSize,
    selectedCharmIds: normalizeSelectedCharmIds(State.selectedCharmIds),
    selectedStones: State.selectedStones.map((item) => getSelectedLoopItemRenderKey(item))
  });
}

function getComponentRenderImageUrl(component) {
  if (!component) return '';
  if (component.type === 'charm') {
    return withCatalogImageVersion(component.image || '', component);
  }
  if (component.type === 'spacer') {
    return withCatalogImageVersion(component.image || '', component);
  }
  if (component.type === 'stone') {
    const stoneData = STONES.find((stone) => stone.id === component.stoneId) || STONES[0];
    return withCatalogImageVersion(stoneData?.image || '', stoneData);
  }
  return '';
}

function normalizeImageBounds(bounds, sourceWidth, sourceHeight) {
  const safeWidth = Math.max(1, sourceWidth || 0);
  const safeHeight = Math.max(1, sourceHeight || 0);
  const minX = Math.min(Math.max(0, bounds?.minX ?? 0), safeWidth - 1);
  const minY = Math.min(Math.max(0, bounds?.minY ?? 0), safeHeight - 1);
  const maxX = Math.min(Math.max(minX, bounds?.maxX ?? (safeWidth - 1)), safeWidth - 1);
  const maxY = Math.min(Math.max(minY, bounds?.maxY ?? (safeHeight - 1)), safeHeight - 1);
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  return { minX, minY, maxX, maxY, width, height, sourceWidth: safeWidth, sourceHeight: safeHeight };
}

function detectVisibleImageBounds(image) {
  const sourceWidth = image?.naturalWidth || image?.width || 0;
  const sourceHeight = image?.naturalHeight || image?.height || 0;
  if (!sourceWidth || !sourceHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.clearRect(0, 0, sourceWidth, sourceHeight);
    ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
    const { data } = ctx.getImageData(0, 0, sourceWidth, sourceHeight);

    let minX = sourceWidth;
    let minY = sourceHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < sourceHeight; y++) {
      for (let x = 0; x < sourceWidth; x++) {
        const alpha = data[(y * sourceWidth + x) * 4 + 3];
        if (alpha > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return normalizeImageBounds(null, sourceWidth, sourceHeight);
    }

    return normalizeImageBounds({ minX, minY, maxX, maxY }, sourceWidth, sourceHeight);
  } catch (error) {
    console.warn('Failed to detect visible charm bounds.', error);
    return null;
  }
}

function getVisibleImageBounds(image, cacheKey = '') {
  const sourceWidth = image?.naturalWidth || image?.width || 0;
  const sourceHeight = image?.naturalHeight || image?.height || 0;
  const fallbackBounds = normalizeImageBounds(null, sourceWidth || 1, sourceHeight || 1);
  if (!sourceWidth || !sourceHeight) {
    return fallbackBounds;
  }

  if (cacheKey && charmVisibleBoundsCache.has(cacheKey)) {
    return charmVisibleBoundsCache.get(cacheKey);
  }

  const detectedBounds = detectVisibleImageBounds(image) || fallbackBounds;
  if (cacheKey) {
    charmVisibleBoundsCache.set(cacheKey, detectedBounds);
  }
  return detectedBounds;
}

function scheduleCharmVisibleBoundsDetection(imageUrl) {
  if (!imageUrl) return Promise.resolve(null);
  if (charmVisibleBoundsCache.has(imageUrl)) {
    return Promise.resolve(charmVisibleBoundsCache.get(imageUrl));
  }
  if (charmVisibleBoundsPromiseCache.has(imageUrl)) {
    return charmVisibleBoundsPromiseCache.get(imageUrl);
  }

  const pending = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const bounds = getVisibleImageBounds(img, imageUrl);
      resolve(bounds);
      if (State.currentStep === 3) {
        renderStep3();
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  }).finally(() => {
    charmVisibleBoundsPromiseCache.delete(imageUrl);
  });

  charmVisibleBoundsPromiseCache.set(imageUrl, pending);
  return pending;
}

function getRotatedBoundsMetrics(bounds, sourceWidth, sourceHeight, rotationRad = 0) {
  const visibleBounds = normalizeImageBounds(bounds, sourceWidth, sourceHeight);
  const corners = [
    { x: visibleBounds.minX, y: visibleBounds.minY },
    { x: visibleBounds.maxX + 1, y: visibleBounds.minY },
    { x: visibleBounds.maxX + 1, y: visibleBounds.maxY + 1 },
    { x: visibleBounds.minX, y: visibleBounds.maxY + 1 }
  ];
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const rotatedCorners = corners.map((point) => ({
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  }));
  const minX = Math.min(...rotatedCorners.map((point) => point.x));
  const maxX = Math.max(...rotatedCorners.map((point) => point.x));
  const minY = Math.min(...rotatedCorners.map((point) => point.y));
  const maxY = Math.max(...rotatedCorners.map((point) => point.y));

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function getContactEdgeMetrics(rotatedBoundsMetrics, tuning = DEFAULT_CHARM_RENDER_TUNING) {
  const contactInsetLeftRatio = normalizeCharmContactInset(tuning.contactInsetLeft);
  const contactInsetRightRatio = normalizeCharmContactInset(tuning.contactInsetRight);
  const contactInsetLeftPx = rotatedBoundsMetrics.width * contactInsetLeftRatio;
  const contactInsetRightPx = rotatedBoundsMetrics.width * contactInsetRightRatio;
  const contactMinX = Math.min(
    rotatedBoundsMetrics.maxX,
    rotatedBoundsMetrics.minX + contactInsetLeftPx
  );
  const contactMaxX = Math.max(
    contactMinX + 1,
    rotatedBoundsMetrics.maxX - contactInsetRightPx
  );

  return {
    minX: contactMinX,
    maxX: contactMaxX,
    width: Math.max(1, contactMaxX - contactMinX),
    centerX: (contactMinX + contactMaxX) / 2
  };
}

function getFixedBeeHeartPlacement(frameWidth, frameHeight, sourceWidth, sourceHeight, bounds = null, tuning = DEFAULT_CHARM_RENDER_TUNING) {
  const safeTuning = resolveCharmRenderTuning(tuning);
  const rawVisualScale = Number(tuning?.visualScale);
  const safeVisualScale = Number.isFinite(rawVisualScale)
    ? Math.min(1.4, Math.max(0.1, rawVisualScale))
    : safeTuning.visualScale;
  const maxFrameWidth = frameWidth * safeTuning.maxWidthRatio;
  const maxFrameHeight = frameHeight * safeTuning.maxHeightRatio;

  if (!sourceWidth || !sourceHeight) {
    const scaledWidth = maxFrameWidth * safeVisualScale;
    const scaledHeight = maxFrameHeight * safeVisualScale;
    return {
      width: scaledWidth,
      height: scaledHeight,
      x: (frameWidth - scaledWidth) / 2 + (frameWidth * safeTuning.visualOffsetX),
      y: (frameHeight - scaledHeight) / 2 + (frameHeight * safeTuning.visualOffsetY)
    };
  }

  const visibleBounds = normalizeImageBounds(bounds, sourceWidth, sourceHeight);
  const widthFitScale = maxFrameWidth / visibleBounds.width;
  const heightFitScale = maxFrameHeight / visibleBounds.height;
  const scale = Math.min(widthFitScale, heightFitScale) * safeVisualScale;
  const visibleWidth = visibleBounds.width * scale;
  const visibleHeight = visibleBounds.height * scale;

  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
    x: ((frameWidth - visibleWidth) / 2) - (visibleBounds.minX * scale) + (frameWidth * safeTuning.visualOffsetX),
    y: ((frameHeight - visibleHeight) / 2) - (visibleBounds.minY * scale) + (frameHeight * safeTuning.visualOffsetY)
  };
}

function getInlineCharmPlacement(frameWidth, frameHeight, sourceWidth, sourceHeight, bounds = null, tuning = DEFAULT_CHARM_RENDER_TUNING, rotationRad = 0, centerAngle = 0) {
  const safeTuning = resolveCharmRenderTuning(tuning);
  const safeVisualScale = safeTuning.visualScale;
  const safeMaxWidthRatio = safeTuning.maxWidthRatio;
  const safeMaxHeightRatio = safeTuning.maxHeightRatio;
  const safeEdgeFitMode = safeTuning.edgeFitMode;
  const safeTargetWidthFillRatio = safeTuning.targetWidthFillRatio;
  const safeOffsetX = safeTuning.visualOffsetX;
  const safeOffsetY = safeTuning.visualOffsetY;
  const maxFrameWidth = frameWidth * safeMaxWidthRatio;
  const maxFrameHeight = frameHeight * safeMaxHeightRatio;

  if (!sourceWidth || !sourceHeight) {
    const scaledWidth = maxFrameWidth * safeVisualScale;
    const scaledHeight = maxFrameHeight * safeVisualScale;
    return {
      width: scaledWidth,
      height: scaledHeight,
      x: (frameWidth - scaledWidth) / 2 + (frameWidth * safeOffsetX),
      y: (frameHeight - scaledHeight) / 2 + (frameHeight * safeOffsetY)
    };
  }

  const rotatedBoundsMetrics = getRotatedBoundsMetrics(bounds, sourceWidth, sourceHeight, rotationRad);
  const contactEdgeMetrics = getContactEdgeMetrics(rotatedBoundsMetrics, safeTuning);
  const widthFitScale = maxFrameWidth / rotatedBoundsMetrics.width;
  const heightFitScale = maxFrameHeight / rotatedBoundsMetrics.height;
  const tangentialFillScale = (maxFrameWidth * safeTargetWidthFillRatio) / contactEdgeMetrics.width;
  const baseScale = safeEdgeFitMode === 'horizontal_fill'
    ? tangentialFillScale
    : Math.min(widthFitScale, heightFitScale);
  const scale = baseScale * safeVisualScale;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const radialOverflowPx = safeEdgeFitMode === 'horizontal_fill'
    ? Math.max(0, rotatedBoundsMetrics.height * scale - maxFrameHeight)
    : 0;
  const desiredCenterX = frameWidth / 2 + (frameWidth * safeOffsetX) + (Math.cos(centerAngle) * radialOverflowPx / 2);
  const desiredCenterY = frameHeight / 2 + (frameHeight * safeOffsetY) + (Math.sin(centerAngle) * radialOverflowPx / 2);
  const scaledRotatedCenterX = (safeEdgeFitMode === 'horizontal_fill' ? contactEdgeMetrics.centerX : rotatedBoundsMetrics.centerX) * scale;
  const scaledRotatedCenterY = rotatedBoundsMetrics.centerY * scale;
  const cos = Math.cos(-rotationRad);
  const sin = Math.sin(-rotationRad);
  const translatedCenterX = desiredCenterX - (frameWidth / 2) - scaledRotatedCenterX;
  const translatedCenterY = desiredCenterY - (frameHeight / 2) - scaledRotatedCenterY;
  const x = frameWidth / 2 + (translatedCenterX * cos - translatedCenterY * sin);
  const y = frameHeight / 2 + (translatedCenterX * sin + translatedCenterY * cos);

  return {
    width,
    height,
    x,
    y
  };
}

function getCharmRenderPlacement(component, frameWidth, frameHeight, image = null, bounds = null, rotationRad = 0, centerAngle = 0) {
  const sourceWidth = image?.naturalWidth || image?.width || 0;
  const sourceHeight = image?.naturalHeight || image?.height || 0;
  if (isSlotPlaceableCharmType(component?.charmType)) {
    return getFixedBeeHeartPlacement(frameWidth, frameHeight, sourceWidth, sourceHeight, bounds, component);
  }

  return getInlineCharmPlacement(
    frameWidth,
    frameHeight,
    sourceWidth,
    sourceHeight,
    bounds,
    component,
    rotationRad,
    centerAngle
  );
}

function getVisibleBoundsPlacement(frameWidth, frameHeight, image = null, bounds = null) {
  const sourceWidth = image?.naturalWidth || image?.width || bounds?.sourceWidth || 0;
  const sourceHeight = image?.naturalHeight || image?.height || bounds?.sourceHeight || 0;

  if (!sourceWidth || !sourceHeight) {
    return {
      width: frameWidth,
      height: frameHeight,
      x: 0,
      y: 0
    };
  }

  const visibleBounds = normalizeImageBounds(bounds, sourceWidth, sourceHeight);
  const scale = Math.min(frameWidth / visibleBounds.width, frameHeight / visibleBounds.height);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    width,
    height,
    x: ((frameWidth - visibleBounds.width * scale) / 2) - (visibleBounds.minX * scale),
    y: ((frameHeight - visibleBounds.height * scale) / 2) - (visibleBounds.minY * scale)
  };
}

// Asynchronously pre-load render texture images
async function preloadRenderImages(urls) {
  const cache = {};
  const promises = urls.map(url => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        cache[url] = img;
        resolve();
      };
      img.onerror = () => {
        console.error("Failed to preload canvas image:", url);
        resolve();
      };
      img.crossOrigin = "anonymous";
      img.src = url;
    });
  });
  await Promise.all(promises);
  return cache;
}

// Draw the designed bracelet and invoice to canvas
async function generateImageExports(subtotal, discount, finalPrice, aggregatedStones, uniqueStoneIds, previewKey = '') {
  const receiptDiscountPercent = subtotal > 0 ? Math.round((discount / subtotal) * 100) : 0;
  const safeUniqueStoneIds = normalizeUniqueStoneIds(uniqueStoneIds);
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load("400 16px 'Noto Sans Thai'"),
      document.fonts.load("700 16px 'Noto Sans Thai'"),
      document.fonts.load("italic 400 16px 'Noto Sans Thai'")
    ]);
  }

  const resolvedLayout = createCurrentBraceletResolvedLayout();
  const uniqueUrls = [];
  getPlacedResolvedLayoutNodes(resolvedLayout, ['stone', 'spacer', 'charm']).forEach((node) => {
    const imageUrl = getComponentRenderImageUrl(node.component);
    if (imageUrl && !uniqueUrls.includes(imageUrl)) {
      uniqueUrls.push(imageUrl);
    }
  });

  const imageCache = await preloadRenderImages(uniqueUrls);

  // 1. Hero Shot (1080x1080)
  const heroCanvas = document.createElement("canvas");
  heroCanvas.width = 1080;
  heroCanvas.height = 1080;
  const ctx = heroCanvas.getContext("2d");

  // Transparent canvas background; the showcase frame provides the neutral surface.
  ctx.clearRect(0, 0, 1080, 1080);

  const cx = 540;
  const cy = 540;
  const rCanvas = 360;

  const heroNodes = projectResolvedLayoutToCircle(resolvedLayout, {
    centerX: cx,
    centerY: cy,
    radiusPx: rCanvas,
    componentTypes: ['stone', 'spacer', 'charm']
  });

  heroNodes.forEach((node) => {
    const bx = node.renderCenterX;
    const by = node.renderCenterY;
    const component = node.component;
    const bRadiusPx = node.renderRadiusPx;
    const imgUrl = getComponentRenderImageUrl(component);
    const imgObj = imageCache[imgUrl];
    const outwardOffsetPx = component.type === 'charm'
      ? getCharmOutwardOffsetPx(component, node.renderScalePxPerMm || 0)
      : 0;
    const renderCenterX = bx + (Math.cos(node.centerAngle) * outwardOffsetPx);
    const renderCenterY = by + (Math.sin(node.centerAngle) * outwardOffsetPx);

    ctx.save();
    ctx.translate(renderCenterX, renderCenterY);
    ctx.rotate(node.renderRotationRad); // Rotate to face outward

    if (component.type === 'charm') {
      if (imgObj) {
        const { widthPx: charmFrameWidthPx, heightPx: charmFrameHeightPx } = getCharmRenderFrameDimensions(component, node.renderScalePxPerMm || 0);
        const charmBounds = getVisibleImageBounds(imgObj, imgUrl);
        const placement = getCharmRenderPlacement(component, charmFrameWidthPx, charmFrameHeightPx, imgObj, charmBounds, node.renderRotationRad, node.centerAngle);
        const useCharmClip = component.edgeFitMode !== 'horizontal_fill';
        ctx.save();
        if (useCharmClip) {
          ctx.beginPath();
          ctx.rect(-charmFrameWidthPx / 2, -charmFrameHeightPx / 2, charmFrameWidthPx, charmFrameHeightPx);
          ctx.clip();
        }
        ctx.drawImage(
          imgObj,
          -charmFrameWidthPx / 2 + placement.x,
          -charmFrameHeightPx / 2 + placement.y,
          placement.width,
          placement.height
        );
        ctx.restore();
      }
    } else if (component.type === 'spacer' && imgObj) {
      if (component.spacerShape === 'ball') {
        const spacerSizePx = bRadiusPx * 2;
        const spacerBounds = getVisibleImageBounds(imgObj, imgUrl);
        const placement = getVisibleBoundsPlacement(spacerSizePx, spacerSizePx, imgObj, spacerBounds);
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, bRadiusPx, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(
          imgObj,
          -bRadiusPx + placement.x,
          -bRadiusPx + placement.y,
          placement.width,
          placement.height
        );
        ctx.restore();
      } else {
        const spacerSizePx = bRadiusPx * 2;
        ctx.drawImage(imgObj, -spacerSizePx / 2, -spacerSizePx / 2, spacerSizePx, spacerSizePx);
      }
    } else if (imgObj) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, bRadiusPx, 0, 2 * Math.PI);
      ctx.clip();
      const scaleFactor = 1.3;
      const imgSize = bRadiusPx * 2 * scaleFactor;
      ctx.drawImage(imgObj, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    ctx.restore();
  });

  const heroDataUrl = heroCanvas.toDataURL("image/png");
  const heroPreview = document.getElementById("exportHeroPreview");
  const heroLoading = document.getElementById("exportHeroLoading");
  const btnHero = document.getElementById("btnDownloadHero");

  if (previewKey && braceletShowcaseRenderKey !== previewKey) {
    return;
  }

  await rememberBraceletPreviewImage(heroDataUrl);

  if (heroPreview) {
    heroPreview.src = heroDataUrl;
    heroPreview.style.display = "block";
    heroPreview.dataset.previewKey = previewKey;
  }
  if (heroLoading) {
    heroLoading.style.display = "none";
  }
  if (btnHero) {
    btnHero.disabled = false;
    btnHero.onclick = () => triggerDownload(heroDataUrl, `lucky-colorstone-hero-${State.ownerName || "design"}.png`);
  }

  return;

  // 2. Receipt Image (800x1200)
  const receiptCanvas = document.createElement("canvas");
  receiptCanvas.width = 800;
  receiptCanvas.height = 1200;
  const rCtx = receiptCanvas.getContext("2d");

  // Background
  rCtx.fillStyle = "#FDF5E6";
  rCtx.fillRect(0, 0, 800, 1200);

  // Border outline
  rCtx.strokeStyle = "#E6E6FA";
  rCtx.lineWidth = 6;
  rCtx.strokeRect(20, 20, 760, 1160);

  // Header Title
  rCtx.fillStyle = "#40304D";
  rCtx.font = "700 36px 'Noto Sans Thai'";
  rCtx.textAlign = "center";
  rCtx.fillText("LUCKY.COLORSTONE", 400, 90);

  rCtx.fillStyle = "#8B0000";
  rCtx.font = "700 13px 'Noto Sans Thai'";
  rCtx.fillText("CUSTOM BRACELET ORDER RECEIPT", 400, 125);

  function drawDashedDivider(y) {
    rCtx.strokeStyle = "#B5A9DB";
    rCtx.lineWidth = 1.5;
    rCtx.setLineDash([5, 5]);
    rCtx.beginPath();
    rCtx.moveTo(50, y);
    rCtx.lineTo(750, y);
    rCtx.stroke();
    rCtx.setLineDash([]);
  }

  drawDashedDivider(155);

  // Customer metadata
  rCtx.textAlign = "left";
  rCtx.fillStyle = "#554466";
  rCtx.font = "400 14px 'Noto Sans Thai'";
  const formattedDate = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  rCtx.fillText(`👤 Customer:  ${State.ownerName || "Khun Guest"}`, 70, 195);
  rCtx.fillText(`📅 Date:           ${formattedDate}`, 70, 225);

  // Specs block card background
  rCtx.fillStyle = "#FFFDF5";
  rCtx.fillRect(70, 260, 660, 75);
  rCtx.strokeStyle = "#E8E1D5";
  rCtx.lineWidth = 1;
  rCtx.strokeRect(70, 260, 660, 75);

  rCtx.textAlign = "center";
  rCtx.fillStyle = "#40304D";
  rCtx.font = "700 14px 'Noto Sans Thai'";
  rCtx.fillText("Wrist Size", 150, 285);
  rCtx.fillText("Length", 310, 285);
  rCtx.fillText("Bead Size", 470, 285);
  rCtx.fillText("Beads Count", 630, 285);

  rCtx.fillStyle = "#8B0000";
  rCtx.font = "700 18px 'Noto Sans Thai'";
  rCtx.fillText(`${State.wristSize.toFixed(1)} cm`, 150, 315);
  rCtx.fillText(`${(State.wristSize + TOLERANCE_CM).toFixed(1)} cm`, 310, 315);
  rCtx.fillText(`${getCurrentBeadSizeMm()}mm`, 470, 315);
  rCtx.fillText(`${getSelectedStoneItems().length} beads`, 630, 315);

  drawDashedDivider(370);

  // Stringing Map Header
  rCtx.textAlign = "center";
  rCtx.fillStyle = "#40304D";
  rCtx.font = "700 15px 'Noto Sans Thai'";
  rCtx.fillText("VISUAL STRINGING MAP (ลำดับการร้อย)", 400, 410);

  const mapY = 465;
  const linearMapNodes = projectResolvedLayoutToLinearMap(resolvedLayout, {
    centerX: 400,
    centerY: mapY,
    availableWidth: 800 - 160,
    maxRadiusPx: 18,
    referenceSizeMm: 6
  });

  linearMapNodes.forEach((node) => {
    const bRad = node.renderRadiusPx;
    const bx = node.renderCenterX;

    const stoneData = STONES.find(s => s.id === node.component.stoneId) || STONES[0];
    const imgUrl = stoneData ? stoneData.image : "";
    const imgObj = imageCache[imgUrl];

    rCtx.save();
    rCtx.translate(bx, mapY);

    rCtx.beginPath();
    rCtx.arc(0, 0, bRad, 0, 2 * Math.PI);
    rCtx.fillStyle = stoneData.color || "#E2E8F0";
    rCtx.fill();

    if (imgObj) {
      rCtx.save();
      rCtx.beginPath();
      rCtx.arc(0, 0, bRad, 0, 2 * Math.PI);
      rCtx.clip();
      const scaleFactor = 1.3;
      const imgSize = bRad * 2 * scaleFactor;
      rCtx.drawImage(imgObj, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      rCtx.restore();
    }

    const sheen = rCtx.createRadialGradient(-bRad * 0.36, -bRad * 0.36, bRad * 0.1, 0, 0, bRad);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.6)");
    sheen.addColorStop(0.45, "rgba(255, 255, 255, 0.15)");
    sheen.addColorStop(0.85, "rgba(0, 0, 0, 0.3)");
    sheen.addColorStop(1, "rgba(0, 0, 0, 0.7)");
    rCtx.fillStyle = sheen;
    rCtx.beginPath();
    rCtx.arc(0, 0, bRad, 0, 2 * Math.PI);
    rCtx.fill();

    rCtx.restore();
  });

  drawDashedDivider(525);

  // Pricing lines
  rCtx.textAlign = "left";
  rCtx.fillStyle = "#554466";
  rCtx.font = "400 15px 'Noto Sans Thai'";
  rCtx.fillText("Original Subtotal:", 70, 570);
  if (discount > 0) {
    rCtx.fillText(`LINE Special Promotion (${receiptDiscountPercent}% Discount):`, 70, 605);
  }
  
  rCtx.font = "700 20px 'Noto Sans Thai'";
  rCtx.fillStyle = "#40304D";
  rCtx.fillText("Total Net Price:", 70, 650);

  rCtx.textAlign = "right";
  rCtx.font = "400 15px 'Noto Sans Thai'";
  rCtx.fillStyle = "#554466";
  rCtx.fillText(`฿${subtotal.toLocaleString()}`, 730, 570);
  rCtx.fillStyle = "#8B0000";
  if (discount > 0) {
    rCtx.fillText(`-฿${discount.toLocaleString()}`, 730, 605);
  }

  rCtx.font = "700 24px 'Noto Sans Thai'";
  rCtx.fillStyle = "#8B0000";
  rCtx.fillText(`฿${finalPrice.toLocaleString()}`, 730, 650);

  drawDashedDivider(690);

  // Meanings list
  rCtx.textAlign = "left";
  rCtx.fillStyle = "#40304D";
  rCtx.font = "700 16px 'Noto Sans Thai'";
  rCtx.fillText("✨ STONE MEANINGS & METAPHYSICAL BENEFITS", 70, 735);

  let meaningY = 770;
  safeUniqueStoneIds.forEach(id => {
    const stone = STONES.find(s => s.id === id);
    if (stone && meaningY < 1120) {
      rCtx.fillStyle = "#8B0000";
      rCtx.font = "700 14px 'Noto Sans Thai'";
      rCtx.fillText(`• ${stone.nameTh} (${stone.name})`, 70, meaningY);
      
      rCtx.fillStyle = "#554466";
      rCtx.font = "italic 400 12px 'Noto Sans Thai'";
      const desc = `${stone.meaningTh} - ${stone.meaning}`;
      
      const maxTextWidth = 660;
      const words = desc.split(' ');
      let currentLine = '';
      const linesArr = [];
      
      words.forEach(w => {
        const testLine = currentLine ? `${currentLine} ${w}` : w;
        const testWidth = rCtx.measureText(testLine).width;
        if (testWidth > maxTextWidth) {
          linesArr.push(currentLine);
          currentLine = w;
        } else {
          currentLine = testLine;
        }
      });
      if (currentLine) {
        linesArr.push(currentLine);
      }

      meaningY += 20;
      linesArr.forEach(lineStr => {
        rCtx.fillText(lineStr, 85, meaningY);
        meaningY += 18;
      });
      meaningY += 10;
    }
  });

  rCtx.textAlign = "center";
  rCtx.fillStyle = "#9E8DAE";
  rCtx.font = "italic 400 13px 'Noto Sans Thai'";
  rCtx.fillText("Thank you for designing with LUCKY.COLORSTONE!", 400, 1160);

  const receiptDataUrl = receiptCanvas.toDataURL("image/png");
  const receiptPreview = document.getElementById("exportReceiptPreview");
  const receiptLoading = document.getElementById("exportReceiptLoading");
  const btnReceipt = document.getElementById("btnDownloadReceipt");

  receiptPreview.src = receiptDataUrl;
  receiptPreview.style.display = "block";
  receiptLoading.style.display = "none";
  btnReceipt.disabled = false;
  btnReceipt.onclick = () => triggerDownload(receiptDataUrl, `lucky-colorstone-receipt-${State.ownerName || "design"}.png`);
}

function triggerDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderBraceletShowcaseFallback(previewKey = '') {
  if (previewKey && braceletShowcaseRenderKey !== previewKey) return;

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const resolvedLayout = createCurrentBraceletResolvedLayout();
  const nodes = projectResolvedLayoutToCircle(resolvedLayout, {
    centerX: 540,
    centerY: 540,
    radiusPx: 360,
    componentTypes: ['stone', 'spacer', 'charm']
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(181, 169, 219, 0.28)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(540, 540, 360, 0, Math.PI * 2);
  ctx.stroke();

  nodes.forEach((node) => {
    const component = node.component;
    const x = node.renderCenterX;
    const y = node.renderCenterY;
    const radius = Math.max(10, node.renderRadiusPx);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(node.renderRotationRad || 0);

    if (component.type === 'charm') {
      const frame = getCharmRenderFrameDimensions(component, node.renderScalePxPerMm || 0);
      ctx.fillStyle = '#D7B56D';
      ctx.strokeStyle = '#8B6A2B';
      ctx.lineWidth = 5;
      ctx.fillRect(-frame.widthPx / 2, -frame.heightPx / 2, frame.widthPx, frame.heightPx);
      ctx.strokeRect(-frame.widthPx / 2, -frame.heightPx / 2, frame.widthPx, frame.heightPx);
    } else if (component.type === 'spacer') {
      ctx.fillStyle = component.color || '#D7C7A0';
      ctx.strokeStyle = '#8B7B5B';
      ctx.lineWidth = 4;
      if (component.spacerShape === 'ball') {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(-radius * 0.45, -radius, radius * 0.9, radius * 2);
        ctx.strokeRect(-radius * 0.45, -radius, radius * 0.9, radius * 2);
      }
    } else {
      ctx.fillStyle = component.color || '#B5A9DB';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  });

  const fallbackDataUrl = canvas.toDataURL('image/png');
  const heroPreview = document.getElementById('exportHeroPreview');
  const heroLoading = document.getElementById('exportHeroLoading');
  const btnHero = document.getElementById('btnDownloadHero');

  rememberBraceletPreviewImage(fallbackDataUrl);

  if (heroPreview) {
    heroPreview.src = fallbackDataUrl;
    heroPreview.style.display = 'block';
    heroPreview.dataset.previewKey = previewKey;
  }
  if (heroLoading) {
    heroLoading.style.display = 'none';
  }
  if (btnHero) {
    btnHero.disabled = false;
    btnHero.onclick = () => triggerDownload(fallbackDataUrl, `lucky-colorstone-hero-${State.ownerName || "design"}.png`);
  }
}

// Submit Order to CRM backend database
async function submitOrderToCRM(showToastNotification = true, overrides = {}) {
  if (getSelectedStoneItems().length === 0) {
    if (showToastNotification) showToast("Bracelet is empty!");
    return null;
  }

  const hasLineLogin = await requireLineLoginForCustomization();
  if (!hasLineLogin) {
    return null;
  }

  await ensureBraceletPreviewImage();
  const nextOrderPayload = buildCurrentOrderPayload({
    configurationCode: buildDesignConfigurationCode(),
    ...overrides
  });

  if (nextOrderPayload.stripeCheckoutSessionId) {
    const existingOrders = await getSharedOrders();
    const existingOrder = Array.isArray(existingOrders)
      ? existingOrders.find((order) => order?.stripeCheckoutSessionId === nextOrderPayload.stripeCheckoutSessionId)
      : null;
    if (existingOrder) {
      return existingOrder;
    }
  }

  const savedOrder = await addSharedOrder(nextOrderPayload);
  if (showToastNotification && savedOrder) {
    showToast(`Order ${savedOrder.id} submitted to CRM!`);
  }
  return savedOrder;

  const pricing = calculateCurrentOrderPricing();
  const discountPercent = pricing.discountPercent;
  const discount = pricing.discount;
  const netPrice = pricing.netPrice;
  const charmData = pricing.charmData;
  const spacerData = pricing.spacerData;
  const selectedStoneItems = getSelectedStoneItems();
  
  // Design details encoded payload
  const base64Code = buildDesignConfigurationCode();
  
  const orderPayload = {
    customerName: State.ownerName || "Khun Guest",
    lineUserId: State.lineUserId || '',
    wristSize: State.wristSize,
    beadSize: State.beadSize,
    totalBeads: State.selectedStones.length,
    beads: State.selectedStones.map(s => {
      const stoneData = STONES.find(st => st.id === s.stoneId);
      return {
        stoneId: s.stoneId,
        name: stoneData ? stoneData.name : 'Unknown Stone',
        nameTh: stoneData ? stoneData.nameTh : 'หินธรรมชาติ',
        color: stoneData ? stoneData.color : '#E2E8F0',
        image: stoneData ? stoneData.image : '',
        size: s.size
      };
    }),
    subtotal: pricing.subtotal,
    discountPercent: discountPercent,
    discountAmount: discount,
    netPrice: netPrice,
    configurationCode: base64Code,
    ...charmData
  };

  orderPayload.totalBeads = selectedStoneItems.length;
  orderPayload.beads = selectedStoneItems.map((stone) => {
    const stoneData = STONES.find((st) => st.id === stone.stoneId);
    return {
      stoneId: stone.stoneId,
      name: stoneData ? stoneData.name : 'Unknown Stone',
      nameTh: stoneData ? stoneData.nameTh : 'หินธรรมชาติ',
      color: stoneData ? stoneData.color : '#E2E8F0',
      image: stoneData ? stoneData.image : '',
      size: stone.size
    };
  });
  Object.assign(orderPayload, spacerData);

  Object.assign(orderPayload, overrides);

  if (orderPayload.stripeCheckoutSessionId) {
    const existingOrders = await getSharedOrders();
    const existingOrder = Array.isArray(existingOrders)
      ? existingOrders.find((order) => order?.stripeCheckoutSessionId === orderPayload.stripeCheckoutSessionId)
      : null;
    if (existingOrder) {
      return existingOrder;
    }
  }
  
  const order = await addSharedOrder(orderPayload);
  if (showToastNotification && order) {
    showToast(`Order ${order.id} submitted to CRM!`);
  }
  return order;
}

// Generate Formatted LINE Order Message & Redirection
async function handleLineOrder() {
  // First, submit order to CRM database so it syncs immediately
  const savedOrder = await submitOrderToCRM(false);
  if (!savedOrder) return;
  
  const dateFormatted = DOM.summaryDateText.textContent.replace('Date: ', '');
  const ownerLabel = State.ownerName ? State.ownerName : "Khun Guest";
  const lenCm = State.wristSize + TOLERANCE_CM;
  
  // Aggregate summary
  const lines = [];
  lines.push(`🔮 *LUCKY.COLORSTONE Order* 🔮`);
  lines.push(`Custom Bracelet Designer (LINE LIFF)`);
  lines.push(`----------------------------------`);
  lines.push(`👤 *Customer:* ${ownerLabel}`);
  lines.push(`📅 *Date:* ${dateFormatted}`);
  lines.push(``);
  lines.push(`📏 *Specifications:*`);
  lines.push(`- Wrist Size: ${State.wristSize.toFixed(1)} cm`);
  lines.push(`- Bracelet Length: ${lenCm.toFixed(1)} cm`);
  
  const beadSizeText = `${getCurrentBeadSizeMm()} mm`;
  lines.push(`- Bead Selection: ${beadSizeText}`);
  const charmData = buildSelectedCharmOrderData();
  const spacerData = buildSelectedSpacerOrderData();
  const selectedStoneItems = getSelectedStoneItems();
  lines.push(`- Total Beads: ${selectedStoneItems.length} beads`);
  lines.push(`- ${CUSTOMER_COMPONENT_LABELS.charm}: ${charmData.hasCharm ? charmData.charms.map((charm) => `${charm.nameEn} (${Number(charm.sizeCm || 0).toFixed(1)} cm)`).join(' + ') : `No ${CUSTOMER_COMPONENT_LABELS.charm}`}`);
  lines.push(`- ${CUSTOMER_COMPONENT_LABELS.spacer}: ${spacerData.hasSpacer ? `${spacerData.spacerCount} selected` : `No ${CUSTOMER_COMPONENT_LABELS.spacer}`}`);
  lines.push(``);
  
  // Aggregate items
  lines.push(`💎 *Design Details:*`);
  const counts = {};
  selectedStoneItems.forEach((b) => {
    const key = `${b.stoneId} (${b.size}mm)`;
    counts[key] = (counts[key] || 0) + 1;
  });
  
  Object.entries(counts).forEach(([item, count]) => {
    lines.push(`- ${item} x ${count} beads`);
  });
  charmData.charms.forEach((charm) => {
    lines.push(`- ${charm.nameEn} x 1 ${CUSTOMER_COMPONENT_LABELS.charm}`);
  });
  if (spacerData.hasSpacer) {
    const spacerCounts = spacerData.spacers.reduce((spacerMap, spacer) => {
      const key = `${spacer.nameEn} (${spacer.displaySizeMm}mm visual / ${spacer.effectiveLengthMm}mm length)`;
      spacerMap[key] = (spacerMap[key] || 0) + 1;
      return spacerMap;
    }, {});

    Object.entries(spacerCounts).forEach(([item, count]) => {
      lines.push(`- ${item} x ${count} ${CUSTOMER_COMPONENT_LABELS.spacer}`);
    });
  }
  lines.push(``);
  
  // Pricing
  const pricing = calculateCurrentOrderPricing();
  const totalStonesPrice = pricing.subtotal;
  const discount = pricing.discount;
  const netPrice = pricing.netPrice;
  
  lines.push(`💳 *Pricing Summary:*`);
  lines.push(`Subtotal: ฿${totalStonesPrice.toLocaleString()}`);
  if (discount > 0) {
    lines.push(`LINE Order ${pricing.discountPercent}% Discount: -฿${discount.toLocaleString()}`);
  }
  lines.push(`*Net Total:* ฿${netPrice.toLocaleString()}`);
  lines.push(``);
  
  // Design details encoded payload
  const designData = {
    w: State.wristSize,
    b: State.beadSize,
    n: State.ownerName,
    c: normalizeSelectedCharmIds(State.selectedCharmIds),
    s: selectedStoneItems.map((stone) => ({ i: stone.stoneId, z: stone.size })),
    p: spacerData.spacers.map((spacer) => ({ i: spacer.spacerId, l: spacer.effectiveLengthMm })),
    l: State.selectedStones.map((item) => serializeSelectedLoopItem(item))
  };
  const jsonString = JSON.stringify(designData);
  const base64Code = btoa(unescape(encodeURIComponent(jsonString)));
  
  lines.push(`🔗 *Design Configuration Code:*`);
  lines.push(base64Code);
  lines.push(``);
  lines.push(`Thank you for designing with LUCKY.COLORSTONE! We will verify details and send a confirmation photo shortly.`);
  
  const finalMessage = lines.join('\n');
  console.log("Formed Message:\n", finalMessage);
  
  // Send via LIFF message if inside client
  if (typeof liff !== 'undefined' && liff.isInClient()) {
    liff.sendMessages([
      {
        type: 'text',
        text: finalMessage
      }
    ]).then(() => {
      showToast("Order sent inside LINE chat!");
      setTimeout(() => {
        liff.closeWindow();
      }, 1500);
    }).catch((err) => {
      console.error("LIFF sendMessages failed, fallback to copy/link", err);
      fallbackLineOrder(finalMessage);
    });
  } else {
    // Desktop/Normal browser fallback
    fallbackLineOrder(finalMessage);
  }
}

// Fallback LINE ordering: copy to clipboard and open LINE OA link
function fallbackLineOrder(messageText) {
  // Try clipboard copy
  navigator.clipboard.writeText(messageText)
    .then(() => {
      showToast("Order details copied to clipboard!");
      setTimeout(() => {
        // Open LINE OA URL (sharing text standard command or direct friend link)
        // Add LINE Official Account ID (e.g. @lucky.colorstone)
        const lineOALink = `https://line.me/R/share?text=${encodeURIComponent(messageText)}`;
        window.open(lineOALink, '_blank');
      }, 1200);
    })
    .catch((err) => {
      console.warn("Clipboard copy failed, redirecting straight to LINE share...", err);
      const lineOALink = `https://line.me/R/share?text=${encodeURIComponent(messageText)}`;
      window.open(lineOALink, '_blank');
    });
}

// ==========================================
// 10. Modals & Detail Popups
// ==========================================
let currentModalStone = null;

function configureInfoModal({
  heading,
  image,
  titleTh,
  titleEn,
  meaning
}) {
  DOM.modalStoneName.textContent = heading;
  DOM.modalStoneImg.src = withCatalogImageVersion(image);
  DOM.modalStoneTitleTh.textContent = titleTh;
  DOM.modalStoneTitleEn.textContent = titleEn;
  DOM.modalStoneMeaning.textContent = meaning;
  DOM.modalStonePrice.textContent = '';
  DOM.btnModalAdd.textContent = '';
  DOM.btnModalFillAll.textContent = '';
  DOM.modalStonePrice.style.display = 'none';
  DOM.btnModalAdd.style.display = 'none';
  DOM.btnModalFillAll.style.display = 'none';
}

function openStoneInfoModal(stone) {
  currentModalStone = stone;
  configureInfoModal({
    heading: stone.name,
    image: stone.image,
    titleTh: stone.nameTh,
    titleEn: stone.name,
    meaning: `${stone.meaningTh} / ${stone.meaning}`
  });
  DOM.modalStonePrice.textContent = '';
  DOM.btnModalAdd.textContent = '';
  DOM.btnModalFillAll.textContent = '';
  DOM.stoneInfoModal.classList.add('show');
}

function openCharmInfoModal(charm) {
  currentModalStone = null;
  const charmMeta = getCharmDisplayMeta(charm);

  const meaning = charm.meaningTh || charm.meaningEn
    ? `${charm.meaningTh || '-'} / ${charm.meaningEn || '-'}`
    : 'No additional charm details available.';

  configureInfoModal({
    heading: `${CUSTOMER_COMPONENT_LABELS.charm} Information`,
    image: charm.image,
    titleTh: charmMeta.nameTh,
    titleEn: charmMeta.nameEn,
    meaning,
    priceText: formatDisplayPrice(charm.price),
    showAddButton: false,
    showFillButton: false
  });
  DOM.stoneInfoModal.classList.add('show');
}

function closeStoneInfoModal() {
  DOM.stoneInfoModal.classList.remove('show');
  currentModalStone = null;
}

function renderInspirationGallery() {
  if (!DOM.inspirationGalleryGrid || DOM.inspirationGalleryGrid.dataset.rendered === 'true') return;

  INSPIRATION_SAMPLE_IMAGES.slice(0, 4).forEach((src, index) => {
    const card = document.createElement('figure');
    card.className = 'inspiration-gallery-item';

    const img = document.createElement('img');
    img.src = src;
    img.alt = `Bracelet inspiration ${index + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      card.classList.add('is-missing');
      img.remove();
    }, { once: true });

    const captionWrap = document.createElement('figcaption');
    captionWrap.className = 'inspiration-gallery-caption';

    const styleName = document.createElement('span');
    styleName.className = 'inspiration-gallery-style-name';
    styleName.textContent = `Style ${String(index + 1).padStart(2, '0')}`;

    const actionText = document.createElement('button');
    actionText.className = 'inspiration-gallery-style-action';
    actionText.type = 'button';
    actionText.textContent = 'ใช้สไตล์นี้';
    actionText.addEventListener('click', () => {
      closeInspirationGallery();
      showToast('เลือกหินจากแคตตาล็อกเพื่อใช้สไตล์นี้');
    });

    const fallback = document.createElement('figcaption');
    fallback.className = 'inspiration-gallery-fallback';
    fallback.textContent = 'Image unavailable';

    card.appendChild(img);
    captionWrap.appendChild(styleName);
    captionWrap.appendChild(actionText);
    card.appendChild(captionWrap);
    card.appendChild(fallback);
    DOM.inspirationGalleryGrid.appendChild(card);
  });

  DOM.inspirationGalleryGrid.dataset.rendered = 'true';
}

function openInspirationGallery() {
  renderInspirationGallery();
  if (inspirationGalleryCloseTimer) {
    window.clearTimeout(inspirationGalleryCloseTimer);
    inspirationGalleryCloseTimer = null;
  }
  DOM.inspirationGalleryModal?.classList.remove('is-closing');
  DOM.inspirationGalleryModal?.classList.add('show');
  DOM.inspirationGalleryModal?.setAttribute('aria-hidden', 'false');
}

function closeInspirationGallery() {
  if (!DOM.inspirationGalleryModal?.classList.contains('show')) return;
  DOM.inspirationGalleryModal?.setAttribute('aria-hidden', 'true');
  DOM.inspirationGalleryModal?.classList.add('is-closing');
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  inspirationGalleryCloseTimer = window.setTimeout(() => {
    DOM.inspirationGalleryModal?.classList.remove('show', 'is-closing');
    inspirationGalleryCloseTimer = null;
  }, prefersReducedMotion ? 0 : 220);
}

function setupModalEvents() {
  DOM.btnModalClose.addEventListener('click', closeStoneInfoModal);
  
  DOM.stoneInfoModal.addEventListener('click', (e) => {
    if (e.target === DOM.stoneInfoModal) {
      closeStoneInfoModal();
    }
  });

  DOM.btnInspirationGallery?.addEventListener('click', openInspirationGallery);
  DOM.btnInspirationGalleryClose?.addEventListener('click', closeInspirationGallery);
  DOM.btnInspirationGalleryBottomClose?.addEventListener('click', closeInspirationGallery);
  DOM.inspirationGalleryModal?.addEventListener('click', (e) => {
    if (e.target === DOM.inspirationGalleryModal) {
      closeInspirationGallery();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.inspirationGalleryModal?.classList.contains('show')) {
      closeInspirationGallery();
    }
  });
}

// Toast Helper
function showToast(message) {
  const toast = DOM.toastMessage;
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Custom Confirmation Dialog Helper
function showCustomConfirm(message, title = "Confirm") {
  return new Promise((resolve) => {
    DOM.confirmModalTitle.textContent = title;
    DOM.confirmModalMessage.textContent = message;
    DOM.confirmModal.classList.add('show');

    const cleanUp = (value) => {
      DOM.confirmModal.classList.remove('show');
      DOM.btnConfirmOK.removeEventListener('click', onOK);
      DOM.btnConfirmCancel.removeEventListener('click', onCancel);
      DOM.btnConfirmClose.removeEventListener('click', onCancel);
      DOM.confirmModal.removeEventListener('click', onBackdrop);
      resolve(value);
    };

    const onOK = () => cleanUp(true);
    const onCancel = () => cleanUp(false);
    const onBackdrop = (e) => {
      if (e.target === DOM.confirmModal) {
        cleanUp(false);
      }
    };

    DOM.btnConfirmOK.addEventListener('click', onOK);
    DOM.btnConfirmCancel.addEventListener('click', onCancel);
    DOM.btnConfirmClose.addEventListener('click', onCancel);
    DOM.confirmModal.addEventListener('click', onBackdrop);
  });
}
