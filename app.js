import { STONES, CATEGORIES, CHARM_PLACEHOLDER_IMAGE, refreshCatalog, refreshCharmCatalog, getLegacyCharmCatalog, getSharedSettings, addSharedOrder, getSharedOrders, getStonePriceForSize } from './data.js';

// Clear session helper for testing/debugging
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('clear') || urlParams.has('logout') || urlParams.has('clearStorage')) {
  localStorage.clear();
  sessionStorage.removeItem('lucky_colorstone_landing_dismissed');
  window.location.href = window.location.pathname;
}

const LANDING_DISMISSED_KEY = 'lucky_colorstone_landing_dismissed';

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
  activeSlotIndex: null,    // Index of selected slot in Step 3 (-1 or null for append)
  uniqueCounter: 0,         // For generating unique IDs for animation keys
  newlyAddedIds: []         // Track newly added bead unique IDs for pop animation
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
  wristSizeGrid: document.getElementById('wristSizeGrid'),
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
  mixedSizeSelectorBar: document.getElementById('mixedSizeSelectorBar'),
  mixedToggleBtns: document.querySelectorAll('.mixed-toggle-btn'),
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
    if ((item?.componentType || 'stone') === 'spacer') return;
    item.size = normalizedBeadSize;
  });
}

function getSpacerCatalogEntry(spacerId) {
  return SPACER_CATALOG_MAP.get(String(spacerId || '').trim()) || null;
}

function normalizeSelectedLoopItem(item, normalizedBeadSize = getCurrentBeadSizeMm()) {
  if (!item || typeof item !== 'object') return null;

  const componentType = String(item.componentType || 'stone').trim().toLowerCase();
  const uniqueId = Number.isFinite(Number(item.uniqueId)) ? Number(item.uniqueId) : null;

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
    .filter(Boolean);
}

function getSelectedLoopItems() {
  return normalizeSelectedLoopItems(State.selectedStones);
}

function isSelectedSpacerItem(item) {
  return (item?.componentType || 'stone') === 'spacer';
}

function isSelectedStoneItem(item) {
  return !isSelectedSpacerItem(item);
}

function getSelectedStoneItems() {
  return getSelectedLoopItems().filter((item) => isSelectedStoneItem(item));
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

function getLoopItemLengthMm(item) {
  if (isSelectedSpacerItem(item)) {
    const spacer = getSpacerCatalogEntry(item.spacerId);
    return spacer ? spacer.effectiveLengthMm : 0;
  }
  return Number(item?.size || 0);
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
  State.selectedCharmIds = normalizeSelectedCharmIds(State.selectedCharmIds);
  State.selectedCharmId = State.selectedCharmIds[0] || null;
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
  if (returnParams.get('step') === '4' || returnParams.has('stripe')) {
    State.currentStep = 4;
    State.landingDismissed = true;
  }

  // Show loading overlay during LIFF boot
  const loader = document.getElementById('liffLoadingOverlay');
  if (loader) loader.style.display = 'flex';

  // Load persisted state if exists
  loadPersistedState();
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
  
  // Fetch initial catalog from shared persistence
  await Promise.all([
    refreshCatalog(),
    refreshCharmCatalog()
  ]);

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
});

// LIFF Initialization
async function initLIFF() {
  const loader = document.getElementById('liffLoadingOverlay');
  if (typeof liff !== 'undefined') {
    try {
      await liff.init({ liffId: "2010525799-qImIuhla" });
      console.log("LIFF Initialized successfully");
      State.liffInitialized = true;
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        State.lineUserId = String(profile.userId || '').trim();
        if (profile.displayName) {
          State.ownerName = profile.displayName;
          DOM.braceletOwnerName.value = profile.displayName;
        }
      }
    } catch (err) {
      console.warn("LIFF Initialization failed. Fallback URL will be used.", err);
      State.liffInitialized = false;
    } finally {
      if (loader) loader.style.display = 'none';
    }
  } else {
    State.liffInitialized = false;
    if (loader) loader.style.display = 'none';
  }
}

function setupLandingEvents() {
  DOM.btnLandingLogin.addEventListener('click', () => {
    // ซ่อน Landing Page
    const landingView = document.getElementById('landingView');
    if (landingView) {
      landingView.style.display = 'none';
    }
    
    // แสดง App Container (Stepper & Steps)
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.style.display = 'flex';
    }
    State.landingDismissed = true;
    persistLandingDismissed();
    
    const loader = DOM.liffLoadingOverlay;
    if (loader) loader.style.display = 'flex';
    
    if (typeof liff !== 'undefined' && State.liffInitialized) {
      liff.login();
    } else {
      // Mock desktop login fallback
      setTimeout(() => {
        if (loader) loader.style.display = 'none';
        
        // Bypass native prompt in automated/headless testing or when query param is present
        if (window.navigator.webdriver || urlParams.has('webdriver') || urlParams.has('test') || urlParams.has('mock')) {
          State.ownerName = "Somchai";
          DOM.braceletOwnerName.value = State.ownerName;
          showToast(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับคุณ ${State.ownerName}`);
          renderApp();
          return;
        }
        
        const testName = prompt("กรุณากรอกชื่อของคุณเพื่อเข้าสู่ระบบ (จำลอง LINE Login):", State.ownerName || "Aou");
        if (testName && testName.trim()) {
          State.ownerName = testName.trim();
          DOM.braceletOwnerName.value = State.ownerName;
          showToast(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับคุณ ${State.ownerName}`);
          renderApp();
        } else {
          // If prompt cancelled/dismissed, hide spinner
          if (loader) loader.style.display = 'none';
        }
      }, 600);
    }
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

  const nextUrl = `${window.location.pathname}${window.location.hash || ''}`;
  window.history.replaceState({}, document.title, nextUrl);
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
  const isFull = State.selectedStones.length > 0 && numPlaceholders === 0 && !isOverflow;

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
  }

  if (State.currentStep !== 3 && DOM.charmSectionMount) {
    DOM.charmSectionMount.innerHTML = '';
  }

  // Configure navigation buttons in sticky footer
  if (State.currentStep === 1) {
    DOM.btnBack.style.visibility = 'hidden';
    DOM.btnNext.innerHTML = `ถัดไป &nbsp;
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6"/>
      </svg>`;
    DOM.btnNext.className = 'footer-btn btn-next';
    DOM.btnNext.disabled = false;
  } else {
    DOM.btnBack.style.visibility = 'visible';
    
    if (State.currentStep === 2) {
      DOM.btnNext.innerHTML = `ถัดไป &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>`;
      DOM.btnNext.className = 'footer-btn btn-next';
      DOM.btnNext.disabled = false;
    } else if (State.currentStep === 3) {
      DOM.btnNext.innerHTML = `ถัดไป &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>`;
      DOM.btnNext.className = 'footer-btn btn-next';
      syncStep3NextValidationUI();
    } else if (State.currentStep === 4) {
      DOM.btnNext.innerHTML = `สั่งซื้อผ่าน LINE &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>`;
      DOM.btnNext.className = 'footer-btn btn-order';
      DOM.btnNext.disabled = false;
      DOM.btnNext.innerHTML = `ชำระเงิน &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 7h20"/>
          <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>
          <path d="M16 15h2"/>
        </svg>`;
    }
  }

  if (State.currentStep !== 3) {
    syncStep3NextValidationUI({
      isFull: true,
      warningText: ''
    });
  }
}

// Navigate to step
async function goToStep(step) {
  if (step < 1 || step > 4) return;
  State.currentStep = step;
  await renderApp();
}

// Setup Back/Next Events
function setupNavigationEvents() {
  DOM.btnBack.addEventListener('click', async () => {
    await goToStep(State.currentStep - 1);
  });
  
  DOM.btnNext.addEventListener('click', async () => {
    if (State.currentStep === 4) {
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
  DOM.wristSizeGrid.innerHTML = '';
  WRIST_SIZES.forEach(size => {
    const btn = document.createElement('button');
    btn.className = `size-btn ${State.wristSize === size ? 'active' : ''}`;
    btn.setAttribute('data-size', size);
    btn.innerHTML = `${size.toFixed(1)} <span>cm</span>`;
    
    btn.addEventListener('click', () => {
      // Set active button
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
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
    });
    
    DOM.wristSizeGrid.appendChild(btn);
  });
  
  DOM.braceletOwnerName.addEventListener('input', (e) => {
    State.ownerName = e.target.value.trim();
    saveState();
  });
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
  document.querySelectorAll('.size-btn').forEach((button) => {
    const buttonSize = Number(button.getAttribute('data-size'));
    button.classList.toggle('active', buttonSize === State.wristSize);
  });
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
          if (isSelectedSpacerItem(item)) return;
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
  onCardClick = null,
  onInfoClick = null,
  onActionClick = null,
  actionText = '+',
  actionTitle = ''
}) {
  const card = document.createElement(rootTag);
  card.className = `stone-card${isSelected ? ' selected' : ''}`;

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
    img.src = image;
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

function getSelectedCharmCatalogEntries() {
  const selectedIds = normalizeSelectedCharmIds(State.selectedCharmIds);
  if (selectedIds.length === 0) return [];

  const visibleCharms = getVisibleCharmCatalog();
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
    .filter(Boolean);
}

function getSelectedCharmFootprintMm() {
  return getSelectedCharmCatalogEntries().reduce((sum, charm) => sum + getCharmFootprintMm(charm), 0);
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
  const charmFootprintMm = loopComponents
    .filter((component) => component.type === 'charm')
    .reduce((sum, component) => sum + (component.footprintMm || component.sizeMm || 0), 0);
  const stoneLengthMm = loopComponents
    .filter((component) => component.type !== 'charm')
    .reduce((sum, component) => sum + component.sizeMm, 0);
  const totalUsedLengthMm = stoneLengthMm + charmFootprintMm;
  const braceletLengthMm = braceletConfig.braceletLengthMm;
  const usableBeadLengthMm = Math.max(0, braceletLengthMm - charmFootprintMm);
  const remainingLengthMm = braceletLengthMm - totalUsedLengthMm;
  const uniformCapacity = braceletConfig.beadSizeMode === 'mixed'
    ? null
    : Math.floor(usableBeadLengthMm / braceletConfig.placingSizeMm);

  return {
    braceletLengthMm,
    charmFootprintMm,
    stoneLengthMm,
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

  if (!nextCharmId) {
    if (currentCharmIds.length === 0) return;
    State.selectedCharmIds = [];
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

function calculateCurrentOrderPricing() {
  const stonesSubtotal = getSelectedStoneItems().reduce((sum, bead) => {
    const stoneData = STONES.find((stone) => stone.id === bead.stoneId);
    return sum + getStonePriceForSize(stoneData, bead.size);
  }, 0);
  const charmData = buildSelectedCharmOrderData();
  const spacerData = buildSelectedSpacerOrderData();
  const charmSubtotal = charmData.charms.reduce((sum, charm) => sum + Number(charm.price || 0), 0);
  const spacerSubtotal = spacerData.spacers.reduce((sum, spacer) => sum + Number(spacer.price || 0), 0);
  const subtotal = stonesSubtotal + spacerSubtotal + charmSubtotal;
  const discountPercent = 20;
  const discount = Math.round(subtotal * 0.2);
  const netPrice = subtotal - discount;

  return {
    stonesSubtotal,
    spacerSubtotal,
    subtotal,
    discountPercent,
    discount,
    netPrice,
    charmData,
    spacerData
  };
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

async function removeSelectedCharm(selectionIndex = null, showToastNotification = true) {
  const currentCharmIds = normalizeSelectedCharmIds(State.selectedCharmIds);
  if (currentCharmIds.length === 0) return;

  const normalizedSelectionIndex = Number.isInteger(selectionIndex)
    ? selectionIndex
    : Number.isFinite(Number(selectionIndex))
      ? Number(selectionIndex)
      : currentCharmIds.length - 1;
  if (normalizedSelectionIndex < 0 || normalizedSelectionIndex >= currentCharmIds.length) return;

  const nextCharmIds = currentCharmIds.filter((_, index) => index !== normalizedSelectionIndex);

  State.selectedCharmIds = nextCharmIds;
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

  if (showToastNotification) {
    showToast("Charm removed.");
  }
}

function getMeaningThumbnailLabel({ nameTh = '', nameEn = '' } = {}) {
  const source = String(nameTh || '').trim() || String(nameEn || '').trim();
  return source ? source.charAt(0).toUpperCase() : 'LC';
}

function buildStep4MeaningEntries(uniqueStoneIds = new Set(), selectedCharms = getSelectedCharmCatalogEntries()) {
  const entries = [];
  selectedCharms.forEach((selectedCharm) => {
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

  uniqueStoneIds.forEach((id) => {
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
    image.src = entry.image;
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

function renderCharmOptions() {
  if (!DOM.charmSectionMount || State.currentStep !== 3) return;

  const visibleCharms = getVisibleCharmCatalog();
  const selectedCharmIds = normalizeSelectedCharmIds(State.selectedCharmIds);
  const selectedCharmIdSet = new Set(selectedCharmIds.filter((charmId) => visibleCharms.some((charm) => charm.id === charmId)));
  const thumbnailTargetRatio = getCharmCatalogThumbnailTargetRatio(visibleCharms);
  DOM.charmSectionMount.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'component-section';

  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.innerHTML = `
    <div>
      <h3>Charm</h3>
      <p>Select up to 2 charms or leave the bracelet without one.</p>
    </div>
  `;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'stone-catalog-grid';

  const selectCharm = (charmId) => {
    applySelectedCharm(charmId);
  };

  grid.appendChild(buildStoneCard({
    rootTag: 'div',
    dataAttributeName: 'charm-id',
    dataAttributeValue: '',
    mediaLabel: 'No Charm',
    nameTh: 'No Charm',
    nameEn: 'Leave bracelet clean',
    priceText: formatDisplayPrice(0),
    isSelected: selectedCharmIds.length === 0,
    onCardClick: () => selectCharm(null),
    onActionClick: () => selectCharm(null),
    actionText: '+',
    actionTitle: 'Select No Charm'
  }));

  visibleCharms.forEach((charm) => {
    const isSelected = selectedCharmIdSet.has(charm.id);
    const charmMeta = getCharmDisplayMeta(charm);
    if (charm.image) {
      scheduleCharmVisibleBoundsDetection(charm.image);
    }
    grid.appendChild(buildStoneCard({
      rootTag: 'div',
      dataAttributeName: 'charm-id',
      dataAttributeValue: charm.id,
      image: charm.image,
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
      actionTitle: isSelected ? 'Selected Charm' : 'Select Charm'
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
  section.className = 'component-section';

  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.innerHTML = `
    <div>
      <h3>Spacer</h3>
      <p>Add decorative spacer pieces to the bracelet loop. Flower spacers stay slim while only using 1mm of bracelet length.</p>
    </div>
  `;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'stone-catalog-grid';

  SPACER_CATALOG.forEach((spacer) => {
    const quantity = spacerCounts[spacer.id] || 0;
    grid.appendChild(buildStoneCard({
      rootTag: 'div',
      dataAttributeName: 'spacer-id',
      dataAttributeValue: spacer.id,
      image: spacer.image,
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
      actionTitle: quantity > 0 ? 'Add Another Spacer' : 'Add Spacer'
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
  
  // Filter out of stock items
  const availableStones = STONES.filter(s => s.inStock !== false);
  
  const filtered = State.activeCategory === 'all' 
    ? availableStones 
    : availableStones.filter(s => (s.categoryId || s.category) === State.activeCategory);
    
  filtered.forEach(stone => {
    const catalogCurrentSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
    const catalogPrice = getStonePriceForSize(stone, catalogCurrentSize);
    DOM.stoneCatalogGrid.appendChild(buildStoneCard({
      dataAttributeName: 'stone-id',
      dataAttributeValue: stone.id,
      image: stone.image,
      imageAlt: stone.name,
      nameTh: stone.nameTh,
      nameEn: stone.name,
      priceText: formatDisplayPrice(catalogPrice),
      onCardClick: () => addStoneToBracelet(stone.id),
      onInfoClick: () => openStoneInfoModal(stone),
      onActionClick: () => addStoneToBracelet(stone.id),
      actionText: '+',
      actionTitle: 'Add Stone'
    }));
  });
}

// Fill entire loop with one stone type
function fillEntireBracelet(stoneId) {
  const stoneData = STONES.find(s => s.id === stoneId);
  if (!stoneData) return;
  
  const placedSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
  const { usableBeadLengthMm } = getCurrentBraceletCapacityMetrics();
  
  // Fill the entire capacity with this stone
  State.selectedStones = [];
  State.newlyAddedIds = [];
  let currentTotalDiameter = 0;
  
  while (currentTotalDiameter + placedSize <= usableBeadLengthMm + 1.0) {
    State.uniqueCounter++;
    State.selectedStones.push(createStoneSelectionItem(stoneId, placedSize, State.uniqueCounter));
    State.newlyAddedIds.push(State.uniqueCounter);
    currentTotalDiameter += placedSize;
  }
  
  State.activeSlotIndex = null;
  showToast(`Filled entire bracelet with ${stoneData.nameTh}.`);
  renderStep3();
  saveState();
}

function addLoopItemToBracelet(loopItem, itemLabel, lengthMm) {
  const { usableBeadLengthMm } = getCurrentBraceletCapacityMetrics();
  const currentTotalDiameter = State.selectedStones.reduce((sum, item) => sum + getLoopItemLengthMm(item), 0);
  const remainingMm = usableBeadLengthMm - currentTotalDiameter;

  if (remainingMm < lengthMm) {
    showToast(`กำไลเต็มแล้ว! เหลือพื้นที่ ${remainingMm.toFixed(1)}mm (ขนาดชิ้นที่จะใส่: ${lengthMm}mm)`);
    return false;
  }

  State.newlyAddedIds = [loopItem.uniqueId];

  if (State.activeSlotIndex !== null && State.activeSlotIndex >= 0 && State.activeSlotIndex < State.selectedStones.length) {
    State.selectedStones.splice(State.activeSlotIndex, 0, loopItem);
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
  const { usableBeadLengthMm } = getCurrentBraceletCapacityMetrics();
  
  // Calculate total diameter of current beads
  const currentTotalDiameter = State.selectedStones.reduce((sum, item) => sum + getLoopItemLengthMm(item), 0);
  
  // Dynamic remainingMm Calculation to prevent over-filling
  const remainingMm = usableBeadLengthMm - currentTotalDiameter;
  
  // Check if there is enough space left for this bead
  if (remainingMm < placedSize) {
    showToast(`กำไลเต็มแล้ว! เหลือพื้นที่ ${remainingMm.toFixed(1)}mm (ขนาดหินที่จะใส่: ${placedSize}mm)`);
    return;
  }
  
  State.uniqueCounter++;
  const newBead = createStoneSelectionItem(stoneId, placedSize, State.uniqueCounter);
  State.newlyAddedIds = [newBead.uniqueId];
  
  if (State.activeSlotIndex !== null && State.activeSlotIndex >= 0 && State.activeSlotIndex < State.selectedStones.length) {
    // Insert at active slot
    State.selectedStones.splice(State.activeSlotIndex, 0, newBead);
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

  const { usableBeadLengthMm } = getCurrentBraceletCapacityMetrics();
  const currentTotalDiameter = State.selectedStones.reduce((sum, item) => sum + getLoopItemLengthMm(item), 0);
  const remainingMm = usableBeadLengthMm - currentTotalDiameter;

  if (remainingMm < spacer.effectiveLengthMm) {
    showToast(`กำไลเต็มแล้ว! เหลือพื้นที่ ${remainingMm.toFixed(1)}mm (ขนาดชิ้นที่จะใส่: ${spacer.effectiveLengthMm}mm)`);
    return;
  }

  State.uniqueCounter++;
  const newSpacer = createSpacerSelectionItem(spacer.id, State.uniqueCounter);
  if (!newSpacer) return;
  State.newlyAddedIds = [newSpacer.uniqueId];

  if (State.activeSlotIndex !== null && State.activeSlotIndex >= 0 && State.activeSlotIndex < State.selectedStones.length) {
    State.selectedStones.splice(State.activeSlotIndex, 0, newSpacer);
    State.activeSlotIndex = null;
    showToast(`Added ${spacer.nameEn} in chosen position.`);
  } else {
    State.selectedStones.push(newSpacer);
  }

  renderStep3();
  saveState();
  syncStep3NextValidationUI();
}

function removeLoopItemFromBracelet(index) {
  if (index < 0 || index >= State.selectedStones.length) return;
  const [removed] = State.selectedStones.splice(index, 1);
  State.activeSlotIndex = null;
  showToast(isSelectedSpacerItem(removed) ? "Spacer removed." : "Bead removed.");

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
  const stoneComponents = State.selectedStones
    .map((item, index) => {
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

  const selectedCharms = getSelectedCharmCatalogEntries();
  if (selectedCharms.length === 0) {
    return stoneComponents;
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
      ...stoneComponents
    ];
  }

  return [
    ...charmComponents,
    ...stoneComponents
  ];
}

function createResolvedBraceletLayout(braceletConfig, braceletComponentList) {
  const capacityMetrics = createBraceletCapacityMetrics(braceletConfig, braceletComponentList);
  const loopComponents = capacityMetrics.loopComponents;
  const placedCount = loopComponents.length;
  const sumPlacedDiameter = capacityMetrics.totalUsedLengthMm;
  const spaceLeft = capacityMetrics.remainingLengthMm;
  const numPlaceholders = Math.max(0, Math.floor(spaceLeft / braceletConfig.placingSizeMm));

  const loopItems = [
    ...loopComponents.map((component) => ({
      kind: 'component',
      component,
      sizeMm: component.sizeMm
    })),
    ...Array.from({ length: numPlaceholders }, (_, index) => ({
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

    if (item.kind === 'component') {
      resolvedNode.component = item.component;
      resolvedNode.sourceIndex = item.component.type === 'charm' ? null : item.component.sourceIndex;
      resolvedNode.uniqueClipId = `clip-${item.component.uniqueId}`;
      resolvedNode.isNewlyAdded = braceletConfig.newlyAddedIds.includes(item.component.uniqueId);
      resolvedNode.isActiveSlot = item.component.type !== 'charm' && item.component.sourceIndex === braceletConfig.activeSlotIndex;
    }

    return resolvedNode;
  };

  const charmComponents = loopComponents.filter((component) => component.type === 'charm');
  if (charmComponents.length === 2) {
    const [topCharm, bottomCharm] = charmComponents;
    const fillerItems = [
      ...loopComponents
        .filter((component) => component.type !== 'charm')
        .map((component) => ({
          kind: 'component',
          component,
          sizeMm: component.sizeMm
        })),
      ...Array.from({ length: numPlaceholders }, (_, index) => ({
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
  if (loopItems.length > 0 && loopItems[0].kind === 'component' && loopItems[0].component.type === 'charm') {
    const firstItemAngleWidth = (loopItems[0].sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    accumulatedAngle -= firstItemAngleWidth / 2;
  }
  const nodes = loopItems.map((item, index) => {
    const itemAngleWidth = (item.sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    const centerAngle = accumulatedAngle + itemAngleWidth / 2;
    const resolvedNode = buildResolvedNode(item, index, itemAngleWidth, centerAngle, item.kind === 'placeholder' && index === placedCount);
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
  const placedCount = summary.placedCount;
  
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
        const charmDiameterPx = component.sizeMm * summary.scaleMmToPx;
        const halfCharm = charmDiameterPx / 2;
        const charmImageUrl = component.image || '';
        const charmBounds = charmImageUrl ? charmVisibleBoundsCache.get(charmImageUrl) : null;
        const useCharmClip = component.edgeFitMode !== 'horizontal_fill';
        let clipId = '';
        if (useCharmClip) {
          clipId = `clip-${component.uniqueId}`;
          const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
          clip.setAttribute("id", clipId);
          const clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          clipRect.setAttribute("x", bx - halfCharm);
          clipRect.setAttribute("y", by - halfCharm);
          clipRect.setAttribute("width", charmDiameterPx);
          clipRect.setAttribute("height", charmDiameterPx);
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
            charmDiameterPx,
            charmDiameterPx,
            { naturalWidth: charmBounds.sourceWidth, naturalHeight: charmBounds.sourceHeight },
            charmBounds,
            rotationRad,
            node.centerAngle,
          );
          charmImage.setAttribute("x", bx - halfCharm + placement.x);
          charmImage.setAttribute("y", by - halfCharm + placement.y);
          charmImage.setAttribute("width", placement.width);
          charmImage.setAttribute("height", placement.height);
        } else {
          const fallbackPlacement = getCharmRenderPlacement(
            component,
            charmDiameterPx,
            charmDiameterPx,
            null,
            null,
            rotationRad,
            node.centerAngle
          );
          charmImage.setAttribute("x", bx - halfCharm + fallbackPlacement.x);
          charmImage.setAttribute("y", by - halfCharm + fallbackPlacement.y);
          charmImage.setAttribute("width", fallbackPlacement.width);
          charmImage.setAttribute("height", fallbackPlacement.height);
          charmImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
          if (charmImageUrl) {
            scheduleCharmVisibleBoundsDetection(charmImageUrl);
          }
        }
        charmImage.setAttribute("transform", `rotate(${angleDeg}, ${bx}, ${by})`);
        group.appendChild(charmImage);
        group.addEventListener('click', async () => {
          await removeSelectedCharm(component.selectionIndex);
        });
      } else if (component.type === 'spacer') {
        const spacerSizePx = (component.renderSizeMm || component.sizeMm) * summary.scaleMmToPx;
        const halfSpacer = spacerSizePx / 2;
        const spacerImageUrl = component.image || '';
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
        img.setAttributeNS("http://www.w3.org/1999/xlink", "href", stoneData.image);
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
        sheenCircle.setAttribute("opacity", "0.75");
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
        State.activeSlotIndex = placedCount; // Click placeholders defaults to append
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
  stop3.setAttribute("stop-opacity", "0.35");
  
  const stop4 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop4.setAttribute("offset", "100%");
  stop4.setAttribute("stop-color", "#000000");
  stop4.setAttribute("stop-opacity", "0.75");
  
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
  const pricing = calculateCurrentOrderPricing();
  
  const braceletLengthMm = validationState.braceletLengthMm;
  const totalDiameter = validationState.totalDiameter;
  const remainingSpace = validationState.remainingSpace;
  
  if (DOM.mixedSizeSelectorBar) {
    DOM.mixedSizeSelectorBar.style.display = 'none';
  }
  
  // Render statistics text
  DOM.canvasPriceText.textContent = `฿${pricing.subtotal.toLocaleString()}`;
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
  syncStep3NextValidationUI(validationState);
  
  // Clear newly added IDs after rendering so they only animate on insertion
  State.newlyAddedIds = [];
}

// ==========================================
// 9. Step 4: Final Summary & Commercial Logic
// ==========================================
async function renderStep4() {
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
  const selectedStoneItems = getSelectedStoneItems();
  const spacerData = buildSelectedSpacerOrderData();
  DOM.specBeadsCount.textContent = `${selectedStoneItems.length} เม็ด`;
  renderShippingForm();
  
  // Aggregate stones selected for receipt and meanings
  const aggregatedStones = {}; // key: stoneId_size, val: { stoneId, size, count, totalPrice }
  const uniqueStoneIds = new Set();
  const charmData = buildSelectedCharmOrderData();
  const selectedCharms = charmData.charms;
  
  selectedStoneItems.forEach((placedBead) => {
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
          <img class="billing-thumbnail-img" src="${item.image}" alt="${item.name}">
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
          <img class="billing-thumbnail-img" src="${selectedCharm.image}" alt="${selectedCharm.nameEn}">
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
          <img class="billing-thumbnail-img" src="${spacer.image}" alt="${spacer.nameEn}">
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
  
  // Hardcoded 20% LINE promotion discount logic
  const discountPercent = 20;
  const discount = Math.round(subtotal * 0.2);
  const finalPrice = subtotal - discount;
  
  DOM.priceSubtotal.textContent = `฿${subtotal.toLocaleString()}`;
  DOM.priceDiscount.textContent = `-฿${discount.toLocaleString()}`;
  
  // Update discount badge text dynamically
  const discountBadge = document.getElementById('priceDiscountBadge');
  if (discountBadge) {
    discountBadge.textContent = `LINE SPECIAL DISCOUNT ${discountPercent}%`;
  }
  
  DOM.priceTotal.textContent = `฿${finalPrice.toLocaleString()}`;
  
  // Populate charm + stone meanings
  DOM.meaningsList.innerHTML = '';
  buildStep4MeaningEntries(uniqueStoneIds, selectedCharms).forEach((entry) => {
    DOM.meaningsList.appendChild(createMeaningItemElement(entry));
  });

  // Trigger HTML5 Canvas image compilation in the background asynchronously
  if (isPreviewReady || braceletShowcaseGenerationInFlight) {
    return;
  }

  braceletShowcaseGenerationInFlight = true;
  setTimeout(async () => {
    try {
      await generateImageExports(subtotal, discount, finalPrice, aggregatedStones, uniqueStoneIds, currentPreviewKey);
    } catch (e) {
      console.error("Canvas compilation failed", e);
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
    l: State.selectedStones.map((item) => (
      isSelectedSpacerItem(item)
        ? { t: 'spacer', i: item.spacerId, l: getLoopItemLengthMm(item) }
        : { t: 'stone', i: item.stoneId, z: item.size }
    ))
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(designData))));
}

function buildCurrentOrderPayload(overrides = {}) {
  const pricing = calculateCurrentOrderPricing();
  const shippingInfo = getShippingInfoSnapshot({ trimValues: true });
  const selectedStoneItems = getSelectedStoneItems();

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
    discountAmount: pricing.discount,
    netPrice: pricing.netPrice,
    configurationCode: buildDesignConfigurationCode(),
    shippingInfo,
    recipientName: shippingInfo.recipientName,
    phoneNumber: shippingInfo.phoneNumber,
    addressLine: shippingInfo.addressLine,
    province: shippingInfo.province,
    postalCode: shippingInfo.postalCode,
    ...pricing.charmData,
    ...pricing.spacerData,
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
      ? existingOrders.find((order) => order?.stripeCheckoutSessionId === sessionId)
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

    if (!existingOrder) {
      const savedOrder = await submitOrderToCRM(false, {
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
      });

      if (!savedOrder) {
        throw new Error("Payment succeeded, but the order could not be saved from the current design state.");
      }
    }

    localStorage.setItem(processedKey, 'true');
    cleanupStripeReturnParams();
    showToast("Stripe payment received. Your order was saved to CRM.");
  } catch (error) {
    console.error("Stripe return verification failed", error);
    showToast(error.message || "Stripe payment verification failed.");
  }
}

async function handleStripeCheckout() {
  if (State.selectedStones.length === 0) {
    showToast("Bracelet is empty!");
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
    const response = await fetch('/api/stripe/checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: window.location.origin,
        order: buildCurrentOrderPayload({
          shippingInfo,
          recipientName: shippingInfo.recipientName,
          phoneNumber: shippingInfo.phoneNumber,
          addressLine: shippingInfo.addressLine,
          province: shippingInfo.province,
          postalCode: shippingInfo.postalCode,
          paymentMethod: 'stripe_checkout',
          stripePaymentStatus: 'pending'
        })
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Unable to create Stripe Checkout session.");
    }

    if (!payload.url) {
      throw new Error("Stripe Checkout session did not include a redirect URL.");
    }

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
    selectedStones: State.selectedStones.map((item) => (
      isSelectedSpacerItem(item)
        ? `spacer:${item.spacerId}:${getLoopItemLengthMm(item)}`
        : `stone:${item.stoneId}:${item.size}`
    ))
  });
}

function getComponentRenderImageUrl(component) {
  if (!component) return '';
  if (component.type === 'charm') {
    return component.image || '';
  }
  if (component.type === 'spacer') {
    return component.image || '';
  }
  if (component.type === 'stone') {
    const stoneData = STONES.find((stone) => stone.id === component.stoneId) || STONES[0];
    return stoneData?.image || '';
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
      img.src = url;
    });
  });
  await Promise.all(promises);
  return cache;
}

// Draw the designed bracelet and invoice to canvas
async function generateImageExports(subtotal, discount, finalPrice, aggregatedStones, uniqueStoneIds, previewKey = '') {
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

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(node.renderRotationRad); // Rotate to face outward

    if (component.type === 'charm') {
      if (imgObj) {
        const charmSizePx = bRadiusPx * 2;
        const charmBounds = getVisibleImageBounds(imgObj, imgUrl);
        const placement = getCharmRenderPlacement(component, charmSizePx, charmSizePx, imgObj, charmBounds, node.renderRotationRad, node.centerAngle);
        const useCharmClip = component.edgeFitMode !== 'horizontal_fill';
        ctx.save();
        if (useCharmClip) {
          ctx.beginPath();
          ctx.rect(-charmSizePx / 2, -charmSizePx / 2, charmSizePx, charmSizePx);
          ctx.clip();
        }
        ctx.drawImage(
          imgObj,
          -charmSizePx / 2 + placement.x,
          -charmSizePx / 2 + placement.y,
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
  rCtx.fillText("LINE Special Promotion (20% Discount):", 70, 605);
  
  rCtx.font = "700 20px 'Noto Sans Thai'";
  rCtx.fillStyle = "#40304D";
  rCtx.fillText("Total Net Price:", 70, 650);

  rCtx.textAlign = "right";
  rCtx.font = "400 15px 'Noto Sans Thai'";
  rCtx.fillStyle = "#554466";
  rCtx.fillText(`฿${subtotal.toLocaleString()}`, 730, 570);
  rCtx.fillStyle = "#8B0000";
  rCtx.fillText(`-฿${discount.toLocaleString()}`, 730, 605);

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
  uniqueStoneIds.forEach(id => {
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

// Submit Order to CRM backend database
async function submitOrderToCRM(showToastNotification = true, overrides = {}) {
  if (State.selectedStones.length === 0) {
    if (showToastNotification) showToast("Bracelet is empty!");
    return null;
  }

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
  await submitOrderToCRM(false);
  
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
  lines.push(`- Charm: ${charmData.hasCharm ? charmData.charms.map((charm) => `${charm.nameEn} (${Number(charm.sizeCm || 0).toFixed(1)} cm)`).join(' + ') : 'No Charm'}`);
  lines.push(`- Spacer: ${spacerData.hasSpacer ? `${spacerData.spacerCount} selected` : 'No Spacer'}`);
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
    lines.push(`- ${charm.nameEn} x 1 charm`);
  });
  if (spacerData.hasSpacer) {
    const spacerCounts = spacerData.spacers.reduce((spacerMap, spacer) => {
      const key = `${spacer.nameEn} (${spacer.displaySizeMm}mm visual / ${spacer.effectiveLengthMm}mm length)`;
      spacerMap[key] = (spacerMap[key] || 0) + 1;
      return spacerMap;
    }, {});

    Object.entries(spacerCounts).forEach(([item, count]) => {
      lines.push(`- ${item} x ${count} spacer`);
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
  lines.push(`LINE Order 20% Discount: -฿${discount.toLocaleString()}`);
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
    l: State.selectedStones.map((item) => (
      isSelectedSpacerItem(item)
        ? { t: 'spacer', i: item.spacerId, l: getLoopItemLengthMm(item) }
        : { t: 'stone', i: item.stoneId, z: item.size }
    ))
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
let currentModalAddHandler = null;
let currentModalFillHandler = null;

function configureInfoModal({
  heading,
  image,
  titleTh,
  titleEn,
  meaning,
  priceText,
  showAddButton = false,
  showFillButton = false,
  addButtonLabel = 'Replace Selected',
  fillButtonLabel = 'Fill Entire Bracelet'
}) {
  DOM.modalStoneName.textContent = heading;
  DOM.modalStoneImg.src = image;
  DOM.modalStoneTitleTh.textContent = titleTh;
  DOM.modalStoneTitleEn.textContent = titleEn;
  DOM.modalStoneMeaning.textContent = meaning;
  DOM.modalStonePrice.textContent = priceText;
  DOM.btnModalAdd.textContent = addButtonLabel;
  DOM.btnModalFillAll.textContent = fillButtonLabel;
  DOM.btnModalAdd.style.display = showAddButton ? '' : 'none';
  DOM.btnModalFillAll.style.display = showFillButton ? '' : 'none';
}

function openStoneInfoModal(stone) {
  currentModalStone = stone;
  currentModalAddHandler = () => addStoneToBracelet(stone.id);
  currentModalFillHandler = () => fillEntireBracelet(stone.id);
  const activeSize = getCurrentBeadSizeMm();
  configureInfoModal({
    heading: stone.name,
    image: stone.image,
    titleTh: stone.nameTh,
    titleEn: stone.name,
    meaning: `${stone.meaningTh} / ${stone.meaning}`,
    priceText: `฿${stone.p4 || 0} (4mm) / ฿${stone.p6 || 0} (6mm) / ฿${stone.p8 || 0} (8mm)`,
    showAddButton: true,
    showFillButton: true,
    addButtonLabel: 'Replace Selected (+ ใส่แทนที่)',
    fillButtonLabel: 'Fill Entire Bracelet (ใส่ทั้งวง)'
  });
  DOM.modalStonePrice.textContent = `Selected size price: ฿${getStonePriceForSize(stone, activeSize).toLocaleString()} (${activeSize}mm)`;
  DOM.stoneInfoModal.classList.add('show');
}

function openCharmInfoModal(charm) {
  currentModalStone = null;
  currentModalAddHandler = null;
  currentModalFillHandler = null;
  const charmMeta = getCharmDisplayMeta(charm);

  const meaning = charm.meaningTh || charm.meaningEn
    ? `${charm.meaningTh || '-'} / ${charm.meaningEn || '-'}`
    : 'No additional charm details available.';

  configureInfoModal({
    heading: 'Charm Information',
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
  currentModalAddHandler = null;
  currentModalFillHandler = null;
}

function setupModalEvents() {
  DOM.btnModalClose.addEventListener('click', closeStoneInfoModal);
  
  DOM.stoneInfoModal.addEventListener('click', (e) => {
    if (e.target === DOM.stoneInfoModal) {
      closeStoneInfoModal();
    }
  });
  
  DOM.btnModalAdd.addEventListener('click', () => {
    if (currentModalAddHandler) {
      currentModalAddHandler();
      closeStoneInfoModal();
    }
  });
  
  DOM.btnModalFillAll.addEventListener('click', () => {
    if (currentModalFillHandler) {
      currentModalFillHandler();
      closeStoneInfoModal();
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
