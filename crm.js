import { 
  getCategoryLabelById,
  getSharedCatalog, 
  getSharedCharmCatalog,
  getSharedSpacerCatalog,
  getSharedCategoryCatalog,
  saveSharedCharmCatalogEntry,
  saveSharedSpacerCatalogEntry,
  deleteSharedCharmCatalogEntry,
  saveSharedCategoryCatalogEntry,
  deleteSharedCategoryCatalogEntry,
  saveSharedCatalog, 
  deleteSharedCatalog,
  getSharedSettings, 
  saveSharedSettings, 
  getSharedOrders, 
  updateOrderStatus,
  getCatalogLayoutOrder,
  resetCatalogLayoutOrder,
  refreshCatalogLayoutOrder,
  saveSharedCatalogLayoutOrder,
  applyCatalogLayoutOrder,
  refreshCatalog,
  refreshCategoryCatalog,
  refreshCharmCatalog,
  STONES,
  ORDERS,
  SETTINGS,
  getStonePriceForSize,
  addSharedOrder,
  withCatalogImageVersion,
  getComponentTypeLabel
} from './data.js';

// ==========================================
// 1. CRM Application State
// ==========================================
const CRM_COMPONENT_LABELS = {
  stone: getComponentTypeLabel('stone', 'th'),
  charm: getComponentTypeLabel('charm', 'th'),
  spacer: getComponentTypeLabel('spacer', 'th'),
  stoneEn: getComponentTypeLabel('stone', 'en'),
  charmEn: getComponentTypeLabel('charm', 'en'),
  spacerEn: getComponentTypeLabel('spacer', 'en'),
  stoneSingularEn: getComponentTypeLabel('stone', 'singularEn'),
  charmSingularEn: getComponentTypeLabel('charm', 'singularEn'),
  spacerSingularEn: getComponentTypeLabel('spacer', 'singularEn')
};

const CRMState = {
  sessionActive: false,
  activeTab: 'overview', // 'overview', 'analytics', 'inventory', 'simulator', 'categories', 'charms', 'orders', 'settings'
  activeEditStoneId: null, // null when creating, stoneId when editing
  activeEditStoneIsActive: true,
  activeEditStoneColor: '#E2C974',
  activeEditCharmId: null,
  activeEditCategoryId: null,
  pendingStoneImage: null,
  pendingCharmImage: null,
  inventoryTypeFilter: 'all',
  simulatorCategory: 'stones',
  simulatorCatalogCache: { stones: [], charms: [], spacers: [] },
  simulatorLayout: [],
  simulatorLayoutLoaded: false,
  simulatorLayoutSeq: 0,
  charmSort: 'displayOrder-asc',
  charmActiveFilter: 'all',
  charmStockFilter: 'all',
  charmCollectionFilter: 'all',
  categorySort: 'displayOrder-asc',
  categoryScopeFilter: 'all',
  categoryStatusFilter: 'all',
  categorySearch: '',
  analyticsRange: '7d',
  analyticsLoading: false,
  selectedInvoiceOrder: null // Order details populated in invoice modal
};

// ==========================================
// 2. DOM Elements Selection
// ==========================================
const DOM = {
  // Auth Page
  loginPortal: document.getElementById('loginPortal'),
  loginForm: document.getElementById('loginForm'),
  adminUsername: document.getElementById('adminUsername'),
  adminPassword: document.getElementById('adminPassword'),
  loginErrorMsg: document.getElementById('loginErrorMsg'),
  btnSignOut: document.getElementById('btnSignOut'),
  
  // Dashboard Core Layout
  dashboardContainer: document.getElementById('dashboardContainer'),
  crmSectionTitle: document.getElementById('crmSectionTitle'),
  systemClock: document.getElementById('systemClock'),
  syncIndicator: document.getElementById('syncIndicator'),
  crmToast: document.getElementById('crmToast'),
  
  // Tab Navigation Buttons
  navButtons: {
    overview: document.getElementById('btnTabOverview'),
    analytics: document.getElementById('btnTabAnalytics'),
    inventory: document.getElementById('btnTabInventory'),
    simulator: document.getElementById('btnTabSimulator'),
    categories: document.getElementById('btnTabCategories'),
    charms: document.getElementById('btnTabCharms'),
    orders: document.getElementById('btnTabOrders'),
    settings: document.getElementById('btnTabSettings')
  },
  mobileNavButtons: {
    overview: document.getElementById('btnMobTabOverview'),
    analytics: document.getElementById('btnMobTabAnalytics'),
    inventory: document.getElementById('btnMobTabInventory'),
    categories: document.getElementById('btnMobTabCategories'),
    simulator: document.getElementById('btnMobTabSimulator'),
    orders: document.getElementById('btnMobTabOrders'),
    settings: document.getElementById('btnMobTabSettings')
  },
  
  // Tab Content Views
  tabViews: {
    overview: document.getElementById('tabOverview'),
    analytics: document.getElementById('tabAnalytics'),
    inventory: document.getElementById('tabInventory'),
    simulator: document.getElementById('tabSimulator'),
    categories: document.getElementById('tabCategories'),
    charms: document.getElementById('tabCharms'),
    orders: document.getElementById('tabOrders'),
    settings: document.getElementById('tabSettings')
  },
  
  // Tab 1: Overview Elements
  metricTotalOrders: document.getElementById('metricTotalOrders'),
  metricTotalRevenue: document.getElementById('metricTotalRevenue'),
  metricActiveStones: document.getElementById('metricActiveStones'),
  metricOosAlert: document.getElementById('metricOosAlert'),
  metricDiscountRate: document.getElementById('metricDiscountRate'),
  overviewRecentOrders: document.getElementById('overviewRecentOrders'),
  btnOverviewViewAllOrders: document.getElementById('btnOverviewViewAllOrders'),
  quickBtnSettings: document.getElementById('quickBtnSettings'),
  quickBtnInventory: document.getElementById('quickBtnInventory'),
  crmSystemLogs: document.getElementById('crmSystemLogs'),
  analyticsTotalSessions: document.getElementById('analyticsTotalSessions'),
  analyticsTotalOrders: document.getElementById('analyticsTotalOrders'),
  analyticsConversionRate: document.getElementById('analyticsConversionRate'),
  analyticsTotalRevenue: document.getElementById('analyticsTotalRevenue'),
  analyticsAov: document.getElementById('analyticsAov'),
  analyticsErrorsCount: document.getElementById('analyticsErrorsCount'),
  analyticsStatus: document.getElementById('analyticsStatus'),
  analyticsRangeButtons: Array.from(document.querySelectorAll('[data-analytics-range]')),
  btnRefreshAnalytics: document.getElementById('btnRefreshAnalytics'),
  analyticsChannelCards: document.getElementById('analyticsChannelCards'),
  analyticsChannelInsight: document.getElementById('analyticsChannelInsight'),
  analyticsFunnelCards: document.getElementById('analyticsFunnelCards'),
  analyticsFunnelInsight: document.getElementById('analyticsFunnelInsight'),
  analyticsStepDistribution: document.getElementById('analyticsStepDistribution'),
  analyticsStepInsight: document.getElementById('analyticsStepInsight'),
  analyticsDailyTrendCards: document.getElementById('analyticsDailyTrendCards'),
  analyticsDailyTrendTableBody: document.getElementById('analyticsDailyTrendTableBody'),
  analyticsChannelDayTableBody: document.getElementById('analyticsChannelDayTableBody'),
  analyticsOrderCards: document.getElementById('analyticsOrderCards'),
  analyticsErrorCards: document.getElementById('analyticsErrorCards'),
  analyticsSourceTableBody: document.getElementById('analyticsSourceTableBody'),
  analyticsFunnelTableBody: document.getElementById('analyticsFunnelTableBody'),
  analyticsTimeTableBody: document.getElementById('analyticsTimeTableBody'),
  analyticsErrorsTableBody: document.getElementById('analyticsErrorsTableBody'),
  analyticsBeadSizeTableBody: document.getElementById('analyticsBeadSizeTableBody'),
  analyticsItemsTableBody: document.getElementById('analyticsItemsTableBody'),
  analyticsCategoriesTableBody: document.getElementById('analyticsCategoriesTableBody'),
  analyticsRecentOrdersTableBody: document.getElementById('analyticsRecentOrdersTableBody'),
  
  // Tab 2: Inventory CRUD
  inventorySearch: document.getElementById('inventorySearch'),
  inventoryTypeTabs: Array.from(document.querySelectorAll('[data-inventory-type]')),
  btnOpenAddStoneModal: document.getElementById('btnOpenAddStoneModal'),
  inventoryTableBody: document.getElementById('inventoryTableBody'),
  simulatorCategoryTabs: Array.from(document.querySelectorAll('[data-simulator-category]')),
  simulatorItemGrid: document.getElementById('simulatorItemGrid'),
  simulatorCatalogEmpty: document.getElementById('simulatorCatalogEmpty'),
  simulatorEmptyTitle: document.getElementById('simulatorEmptyTitle'),
  simulatorCategoryHint: document.getElementById('simulatorCategoryHint'),
  simulatorLayoutStage: document.getElementById('simulatorLayoutStage'),
  simulatorPreviewRing: document.querySelector('.simulator-preview-ring'),
  btnSimulatorResetLayout: document.getElementById('btnSimulatorResetLayout'),
  btnSimulatorSaveLayout: document.getElementById('btnSimulatorSaveLayout'),

  // Tab 3: Category Master Data
  categoriesSearch: document.getElementById('categoriesSearch'),
  categoriesScopeFilter: document.getElementById('categoriesScopeFilter'),
  categoriesStatusFilter: document.getElementById('categoriesStatusFilter'),
  categoriesSort: document.getElementById('categoriesSort'),
  categoriesTableBody: document.getElementById('categoriesTableBody'),
  btnOpenAddCategoryModal: document.getElementById('btnOpenAddCategoryModal'),

  // Tab 4: Charm Catalog
  charmsSearch: document.getElementById('charmsSearch'),
  charmsSort: document.getElementById('charmsSort'),
  charmsActiveFilter: document.getElementById('charmsActiveFilter'),
  charmsStockFilter: document.getElementById('charmsStockFilter'),
  charmsCollectionFilter: document.getElementById('charmsCollectionFilter'),
  charmsTableBody: document.getElementById('charmsTableBody'),
  btnOpenAddCharmModal: document.getElementById('btnOpenAddCharmModal'),
  
  // Tab 4: Order Management
  orderStatusFilter: document.getElementById('orderStatusFilter'),
  ordersSearch: document.getElementById('ordersSearch'),
  ordersTableBody: document.getElementById('ordersTableBody'),
  
  // Tab 5: Settings Controls
  globalSettingsForm: document.getElementById('globalSettingsForm'),
  globalDiscountPercent: document.getElementById('globalDiscountPercent'),
  discountEnabled: document.getElementById('discountEnabled'),
  btnResetDatabase: document.getElementById('btnResetDatabase'),
  btnSeedDemoOrders: document.getElementById('btnSeedDemoOrders'),
  
  // Modal: Add/Edit Stone
  stoneCrudModal: document.getElementById('stoneCrudModal'),
  stoneCrudForm: document.getElementById('stoneCrudForm'),
  stoneModalTitle: document.getElementById('stoneModalTitle'),
  crudStoneId: document.getElementById('crudStoneId'),
  crudStoneNameEn: document.getElementById('crudStoneNameEn'),
  crudStoneNameTh: document.getElementById('crudStoneNameTh'),
  crudStonePriceP4: document.getElementById('crudStonePriceP4'),
  crudStonePriceP6: document.getElementById('crudStonePriceP6'),
  crudStonePriceP8: document.getElementById('crudStonePriceP8'),
  crudStoneCategory: document.getElementById('crudStoneCategory'),
  crudStoneImage: document.getElementById('crudStoneImage'),
  crudStoneImageFile: document.getElementById('crudStoneImageFile'),
  btnUploadStoneImage: document.getElementById('btnUploadStoneImage'),
  crudStoneUploadStatus: document.getElementById('crudStoneUploadStatus'),
  crudStoneImagePreview: document.getElementById('crudStoneImagePreview'),
  crudStoneStockQty: document.getElementById('crudStoneStockQty'),
  crudStoneInStock: document.getElementById('crudStoneInStock'),
  crudStoneMeaningTh: document.getElementById('crudStoneMeaningTh'),
  crudStoneMeaningEn: document.getElementById('crudStoneMeaningEn'),
  btnStoneModalClose: document.getElementById('btnStoneModalClose'),
  btnCancelStoneForm: document.getElementById('btnCancelStoneForm'),

  // Modal: Add/Edit Category
  categoryCrudModal: document.getElementById('categoryCrudModal'),
  categoryCrudForm: document.getElementById('categoryCrudForm'),
  categoryModalTitle: document.getElementById('categoryModalTitle'),
  crudCategoryRecordId: document.getElementById('crudCategoryRecordId'),
  crudCategoryEntityType: document.getElementById('crudCategoryEntityType'),
  crudCategoryId: document.getElementById('crudCategoryId'),
  crudCategorySlug: document.getElementById('crudCategorySlug'),
  crudCategoryNameEn: document.getElementById('crudCategoryNameEn'),
  crudCategoryNameTh: document.getElementById('crudCategoryNameTh'),
  crudCategoryDisplayOrder: document.getElementById('crudCategoryDisplayOrder'),
  crudCategoryIsActive: document.getElementById('crudCategoryIsActive'),
  btnCategoryModalClose: document.getElementById('btnCategoryModalClose'),
  btnCancelCategoryForm: document.getElementById('btnCancelCategoryForm'),

  // Modal: Add/Edit Charm
  charmCrudModal: document.getElementById('charmCrudModal'),
  charmCrudForm: document.getElementById('charmCrudForm'),
  charmModalTitle: document.getElementById('charmModalTitle'),
  crudCharmRecordId: document.getElementById('crudCharmRecordId'),
  crudCharmId: document.getElementById('crudCharmId'),
  crudCharmSku: document.getElementById('crudCharmSku'),
  crudCharmNameEn: document.getElementById('crudCharmNameEn'),
  crudCharmNameTh: document.getElementById('crudCharmNameTh'),
  crudCharmType: document.getElementById('crudCharmType'),
  crudCharmCollection: document.getElementById('crudCharmCollection'),
  crudCharmImage: document.getElementById('crudCharmImage'),
  crudCharmImageFile: document.getElementById('crudCharmImageFile'),
  btnUploadCharmImage: document.getElementById('btnUploadCharmImage'),
  crudCharmUploadStatus: document.getElementById('crudCharmUploadStatus'),
  crudCharmImagePreview: document.getElementById('crudCharmImagePreview'),
  crudCharmSizeCm: document.getElementById('crudCharmSizeCm'),
  crudCharmPrice: document.getElementById('crudCharmPrice'),
  crudCharmDisplayOrder: document.getElementById('crudCharmDisplayOrder'),
  crudCharmStockQty: document.getElementById('crudCharmStockQty'),
  crudCharmMeaningTh: document.getElementById('crudCharmMeaningTh'),
  crudCharmMeaningEn: document.getElementById('crudCharmMeaningEn'),
  crudCharmInStock: document.getElementById('crudCharmInStock'),
  crudCharmIsActive: document.getElementById('crudCharmIsActive'),
  btnCharmModalClose: document.getElementById('btnCharmModalClose'),
  btnCancelCharmForm: document.getElementById('btnCancelCharmForm'),
  roCharmVisualScale: document.getElementById('roCharmVisualScale'),
  roCharmVisualOffsetX: document.getElementById('roCharmVisualOffsetX'),
  roCharmVisualOffsetY: document.getElementById('roCharmVisualOffsetY'),
  roCharmMaxWidthRatio: document.getElementById('roCharmMaxWidthRatio'),
  roCharmMaxHeightRatio: document.getElementById('roCharmMaxHeightRatio'),
  roCharmRotation: document.getElementById('roCharmRotation'),
  roCharmAnchor: document.getElementById('roCharmAnchor'),
  roCharmEdgeFitMode: document.getElementById('roCharmEdgeFitMode'),
  roCharmTargetWidthFillRatio: document.getElementById('roCharmTargetWidthFillRatio'),
  roCharmContactInsetLeft: document.getElementById('roCharmContactInsetLeft'),
  roCharmContactInsetRight: document.getElementById('roCharmContactInsetRight'),
  
  // Modal: Invoice Export
  invoiceExportModal: document.getElementById('invoiceExportModal'),
  btnInvoiceModalClose: document.getElementById('btnInvoiceModalClose'),
  btnPrintInvoice: document.getElementById('btnPrintInvoice'),
  btnCopyInvoiceMessage: document.getElementById('btnCopyInvoiceMessage'),
  orderDetailModal: document.getElementById('orderDetailModal'),
  btnOrderDetailModalClose: document.getElementById('btnOrderDetailModalClose'),
  orderDetailBody: document.getElementById('orderDetailBody'),
  confirmModal: document.getElementById('confirmModal'),
  confirmModalTitle: document.getElementById('confirmModalTitle'),
  confirmModalMessage: document.getElementById('confirmModalMessage'),
  btnConfirmClose: document.getElementById('btnConfirmClose'),
  btnConfirmCancel: document.getElementById('btnConfirmCancel'),
  btnConfirmOK: document.getElementById('btnConfirmOK'),
  
  // Invoice Paper details
  invId: document.getElementById('invId'),
  invDate: document.getElementById('invDate'),
  invCustomer: document.getElementById('invCustomer'),
  invStatusBadge: document.getElementById('invStatusBadge'),
  invWrist: document.getElementById('invWrist'),
  invLength: document.getElementById('invLength'),
  invCharm: document.getElementById('invCharm'),
  invSpacer: document.getElementById('invSpacer'),
  invBeadSvg: document.getElementById('invBeadSvg'),
  invItemsBody: document.getElementById('invItemsBody'),
  invSubtotal: document.getElementById('invSubtotal'),
  invDiscountLabel: document.getElementById('invDiscountLabel'),
  invDiscountAmount: document.getElementById('invDiscountAmount'),
  invNetTotal: document.getElementById('invNetTotal'),
  invConfigCode: document.getElementById('invConfigCode')
};

const IMAGE_PREVIEW_PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" role="img" aria-label="Image preview placeholder">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fbff" />
        <stop offset="100%" stop-color="#e7edf7" />
      </linearGradient>
    </defs>
    <rect width="320" height="240" rx="20" fill="url(#g)" />
    <rect x="14" y="14" width="292" height="212" rx="16" fill="none" stroke="#d6deea" stroke-width="2" />
    <circle cx="118" cy="118" r="36" fill="#d8e2f0" />
    <circle cx="118" cy="118" r="22" fill="#b7c5d8" />
    <path d="M110 118c5-10 17-17 30-17" fill="none" stroke="#f8fbff" stroke-width="6" stroke-linecap="round" opacity="0.8" />
    <text x="186" y="112" fill="#5b6b7f" font-family="Noto Sans Thai" font-size="18" font-weight="700">Image preview</text>
    <text x="186" y="136" fill="#7e8ea3" font-family="Noto Sans Thai" font-size="12">Paste a URL or asset path</text>
  </svg>
`.trim())}`;

const IMAGE_THUMB_PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Image thumbnail placeholder">
    <defs>
      <radialGradient id="rg" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="100%" stop-color="#d7e0ec" />
      </radialGradient>
    </defs>
    <rect width="96" height="96" rx="18" fill="#eef3f9" />
    <circle cx="48" cy="48" r="29" fill="url(#rg)" />
    <circle cx="48" cy="48" r="17" fill="#bcc9da" />
    <path d="M40 47c3-6 9-10 17-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.75" />
  </svg>
`.trim())}`;

function updateImagePreview(imageEl, rawValue) {
  if (!imageEl) return;

  const value = String(rawValue || "").trim();
  imageEl.dataset.fallbackApplied = "0";
  imageEl.onerror = () => {
    if (imageEl.dataset.fallbackApplied === "1") return;
    imageEl.dataset.fallbackApplied = "1";
    imageEl.src = IMAGE_PREVIEW_PLACEHOLDER;
  };
  imageEl.src = value ? withCatalogImageVersion(value) : IMAGE_PREVIEW_PLACEHOLDER;
  imageEl.alt = value ? "Preview image" : "Image preview placeholder";
}

function updateImageThumbnail(imageEl, rawValue) {
  if (!imageEl) return;

  const value = String(rawValue || "").trim();
  imageEl.dataset.fallbackApplied = "0";
  imageEl.onerror = () => {
    if (imageEl.dataset.fallbackApplied === "1") return;
    imageEl.dataset.fallbackApplied = "1";
    imageEl.src = IMAGE_THUMB_PLACEHOLDER;
  };
  imageEl.src = value ? withCatalogImageVersion(value) : IMAGE_THUMB_PLACEHOLDER;
}

function getSafeThumbnailSrc(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value || value.endsWith("/_placeholder.png") || value.endsWith("\\_placeholder.png")) {
    return IMAGE_THUMB_PLACEHOLDER;
  }
  return withCatalogImageVersion(value);
}

function renderInventoryFromCache() {
  const cache = getSimulatorCatalogCache();
  renderInventoryCatalog(cache.stones, cache.charms, cache.spacers);
}

function setUploadStatus(statusEl, message, tone = "info") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

async function prepareImageSelection(kind, file) {
  if (!file) {
    CRMState[`pending${kind}Image`] = null;
    return null;
  }

  const dataUrl = await readFileAsDataUrl(file);
  CRMState[`pending${kind}Image`] = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl
  };
  return CRMState[`pending${kind}Image`];
}

async function uploadImageToMediaService(kind) {
  const pending = CRMState[`pending${kind}Image`];
  const imageInput = kind === "Stone" ? DOM.crudStoneImage : DOM.crudCharmImage;
  const previewImage = kind === "Stone" ? DOM.crudStoneImagePreview : DOM.crudCharmImagePreview;
  const statusEl = kind === "Stone" ? DOM.crudStoneUploadStatus : DOM.crudCharmUploadStatus;

  if (!pending?.dataUrl) {
    setUploadStatus(statusEl, "Select an image file first.", "warn");
    return;
  }

  setUploadStatus(statusEl, "Uploading to external media service...", "info");

  const response = await fetch("/api/uploads/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: kind.toLowerCase(),
      fileName: pending.fileName,
      mimeType: pending.mimeType,
      dataUrl: pending.dataUrl
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || payload.message || "Image upload failed.";
    throw new Error(message);
  }

  const uploadedUrl = payload.url || payload.imageUrl || "";
  if (!uploadedUrl) {
    throw new Error("Upload succeeded but no image URL was returned.");
  }

  imageInput.value = uploadedUrl;
  updateImagePreview(previewImage, uploadedUrl);
  CRMState[`pending${kind}Image`] = null;
  const fileInput = kind === "Stone" ? DOM.crudStoneImageFile : DOM.crudCharmImageFile;
  if (fileInput) fileInput.value = "";
  setUploadStatus(statusEl, "Upload complete. Image URL updated.", "success");
  const displayKind = kind === "Charm" ? CRM_COMPONENT_LABELS.charm : kind;
  showToast(`${displayKind} image uploaded.`);
  return uploadedUrl;
}

function resetImageUploadState(kind) {
  CRMState[`pending${kind}Image`] = null;
  const fileInput = kind === "Stone" ? DOM.crudStoneImageFile : DOM.crudCharmImageFile;
  const statusEl = kind === "Stone" ? DOM.crudStoneUploadStatus : DOM.crudCharmUploadStatus;
  if (fileInput) fileInput.value = "";
  setUploadStatus(statusEl, "No file selected.", "info");
}

// ==========================================
// 3. Initialisation & Lifecycle
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth session
  checkAuthSession();
  
  // Setup clock & logger
  initClock();
  
  // Setup navigation
  setupTabNavigation();
  
  // Setup authentication event listeners
  setupAuthEvents();
  
  // Setup functional listeners (CRUD, settings, search, modals)
  setupFunctionalEvents();
  
  // Setup real-time tab syncing
  setupRealtimeSync();

  loadSimulatorPresetFromStorage().catch((error) => {
    console.warn('Catalog layout order prefetch failed during CRM startup.', error);
  });
  
  // Initial draw
  if (CRMState.sessionActive) {
    await loadDashboardData();
  }
});

// Auth Session checker
function checkAuthSession() {
  const session = localStorage.getItem('lucky_crm_session') === 'true';
  if (session) {
    CRMState.sessionActive = true;
    DOM.loginPortal.style.display = 'none';
    DOM.dashboardContainer.style.display = 'flex';
    addLog("Administrator session restored.");
  } else {
    CRMState.sessionActive = false;
    DOM.loginPortal.style.display = 'flex';
    DOM.dashboardContainer.style.display = 'none';
  }
}

// Clock tick utility
function initClock() {
  setInterval(() => {
    const now = new Date();
    DOM.systemClock.textContent = now.toLocaleTimeString('en-US', { hour12: false });
  }, 1000);
}

// Logger panel writer
function addLog(text, type = 'info') {
  const logCont = DOM.crmSystemLogs;
  if (!logCont) return;
  
  const div = document.createElement('div');
  div.className = `log-line ${type === 'warn' ? 'warn' : type === 'error' ? 'error' : ''}`;
  
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  div.textContent = `[${timeStr}] ${text}`;
  
  logCont.appendChild(div);
  logCont.scrollTop = logCont.scrollHeight;
}

// ==========================================
// 4. Tab Routing & Display
// ==========================================
function setupTabNavigation() {
  Object.entries(DOM.navButtons).forEach(([tabName, button]) => {
    button.addEventListener('click', async () => {
      await switchTab(tabName);
    });
  });
  
  Object.entries(DOM.mobileNavButtons).forEach(([tabName, button]) => {
    if (button) {
      button.addEventListener('click', async () => {
        await switchTab(tabName);
      });
    }
  });
  
  // Overview Tab quick links
  DOM.btnOverviewViewAllOrders.addEventListener('click', async () => await switchTab('orders'));
  DOM.quickBtnSettings.addEventListener('click', async () => await switchTab('settings'));
  DOM.quickBtnInventory.addEventListener('click', async () => await switchTab('inventory'));
}

async function switchTab(tabName) {
  CRMState.activeTab = tabName;
  
  // Update header text title
  const titles = {
    overview: "CRM Overview",
    analytics: "Customer Analytics",
    inventory: "Stone Inventory Manager (Module A)",
    simulator: "Catalog Layout Manager",
    categories: "Catalog Category Manager",
    charms: "Shared Talisman Catalog Management",
    orders: "Order Management & OMS (Module B)",
    settings: "Global System Settings"
  };
  DOM.crmSectionTitle.textContent = titles[tabName];
  
  // Toggle nav buttons active style
  Object.entries(DOM.navButtons).forEach(([name, btn]) => {
    if (name === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Toggle mobile nav buttons active style
  Object.entries(DOM.mobileNavButtons).forEach(([name, btn]) => {
    if (btn) {
      if (name === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
  
  // Toggle views
  Object.entries(DOM.tabViews).forEach(([name, view]) => {
    if (name === tabName) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });
  
  addLog(`Switched view to ${tabName}.`);
  await loadDashboardData();
}

// ==========================================
// 5. Auth Events
// ==========================================
function setupAuthEvents() {
  DOM.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = DOM.adminUsername.value.trim();
    const pass = DOM.adminPassword.value.trim();
    
    // Auth logic - Senior Admin Default Setup
    if (user === 'admin' && pass === 'lucky123') {
      localStorage.setItem('lucky_crm_session', 'true');
      CRMState.sessionActive = true;
      DOM.loginErrorMsg.style.display = 'none';
      DOM.loginPortal.style.display = 'none';
      DOM.dashboardContainer.style.display = 'flex';
      
      showToast("Access Granted. Welcome Administrator.");
      addLog("Administrator logged in successfully.");
      loadDashboardData();
    } else {
      DOM.loginErrorMsg.style.display = 'block';
      addLog(`Failed login attempt for user '${user}'.`, 'error');
    }
  });
  
  DOM.btnSignOut.addEventListener('click', async () => {
    const proceed = await showCustomConfirm("Are you sure you want to sign out of the CRM system?", "Sign Out");
    if (proceed) {
      localStorage.removeItem('lucky_crm_session');
      CRMState.sessionActive = false;
      DOM.loginPortal.style.display = 'flex';
      DOM.dashboardContainer.style.display = 'none';
      DOM.adminUsername.value = '';
      DOM.adminPassword.value = '';
      addLog("Administrator logged out.");
    }
  });
}

// ==========================================
// 6. Real-Time Sync Setup
// ==========================================
function setupRealtimeSync() {
  // Listen for storage events (updates across other window tabs)
  window.addEventListener('storage', async (e) => {
    if (e.key === 'lucky_colorstone_catalog' || e.key === 'lucky_colorstone_orders' || e.key === 'lucky_colorstone_settings') {
      await triggerSyncUpdate(e.key);
    }
  });
  
  // Listen for storage sync events (local updates inside same window tab)
  window.addEventListener('storage_sync', async () => {
    await triggerSyncUpdate('local_event');
  });
}

async function triggerSyncUpdate(keyName) {
  // Flash connection indicator to show sync in progress
  DOM.syncIndicator.className = 'sync-status text-gold';
  DOM.syncIndicator.innerHTML = '<span class="pulse-dot" style="background-color: var(--color-gold)"></span> Syncing updates...';
  
  const [stones, categories, charms] = await Promise.all([
    refreshCatalog(),
    refreshCategoryCatalog(),
    refreshCharmCatalog()
  ]);
  
  setTimeout(async () => {
    DOM.syncIndicator.className = 'sync-status text-green';
    DOM.syncIndicator.innerHTML = '<span class="pulse-dot"></span> Real-time Connected';
    
    addLog(`Database synchronized (${keyName}).`);
    await loadDashboardData({ stones, categories, charms });
  }, 400);
}

// ==========================================
// 7. Load / Calculate Dashboard Stats
// ==========================================
async function loadDashboardData(prefetched = {}) {
  const stones = Array.isArray(prefetched.stones) ? prefetched.stones : await getSharedCatalog();
  const categories = Array.isArray(prefetched.categories) ? prefetched.categories : await getSharedCategoryCatalog();
  const charms = Array.isArray(prefetched.charms) ? prefetched.charms : await getSharedCharmCatalog();
  const spacers = Array.isArray(prefetched.spacers) ? prefetched.spacers : await getSharedSpacerCatalog();
  const orders = await getSharedOrders();
  const settings = await getSharedSettings();
  CRMState.simulatorCatalogCache = { stones, charms, spacers };
  
  // Calculate Metric values
  const totalOrdersCount = orders.length;
  
  const netRevenueAmount = orders.reduce((sum, order) => sum + getOrderFinalPrice(order), 0);
  
  const activeStonesCount = stones.filter(isCrmItemInStock).length;
  const oosStonesCount = stones.filter((s) => !isCrmItemInStock(s)).length;
  
  const globalDiscountRateVal = settings.globalDiscountPercent || 0;
  
  // Update Overview Metrics View
  DOM.metricTotalOrders.textContent = totalOrdersCount;
  DOM.metricTotalRevenue.textContent = `฿${netRevenueAmount.toLocaleString()}`;
  DOM.metricActiveStones.textContent = activeStonesCount;
  
  DOM.metricOosAlert.textContent = `${oosStonesCount} Out of Stock`;
  if (oosStonesCount > 0) {
    DOM.metricOosAlert.className = 'metric-sub text-red';
  } else {
    DOM.metricOosAlert.className = 'metric-sub';
  }
  
  DOM.metricDiscountRate.textContent = `${globalDiscountRateVal}%`;
  syncCategoryAssignmentSelects(categories);
  
  // Render views based on active tab
  if (CRMState.activeTab === 'overview') {
    renderRecentOrdersList(orders);
  } else if (CRMState.activeTab === 'inventory') {
    renderInventoryCatalog(stones, charms, spacers);
  } else if (CRMState.activeTab === 'analytics') {
    renderAnalyticsSummary(await fetchAnalyticsSummary());
  } else if (CRMState.activeTab === 'simulator') {
    await loadSimulatorPresetFromStorage();
    renderBraceletLayoutSimulator(stones, charms, spacers);
  } else if (CRMState.activeTab === 'categories') {
    renderCategoryCatalog(categories, stones, charms);
  } else if (CRMState.activeTab === 'charms') {
    renderCharmCatalog(charms, categories);
  } else if (CRMState.activeTab === 'orders') {
    renderOrdersList(orders);
  } else if (CRMState.activeTab === 'settings') {
    DOM.globalDiscountPercent.value = globalDiscountRateVal;
    if (DOM.discountEnabled) {
      DOM.discountEnabled.checked = settings.discountEnabled === undefined
        ? settings.showDiscountBanner !== false
        : settings.discountEnabled !== false;
    }
  }
}

async function fetchAnalyticsSummary(range = CRMState.analyticsRange || '7d') {
  CRMState.analyticsLoading = true;
  syncAnalyticsRangeButtons();
  if (DOM.analyticsStatus) {
    DOM.analyticsStatus.textContent = 'Loading analytics...';
    DOM.analyticsStatus.className = 'analytics-status';
  }
  try {
    const params = new URLSearchParams({ range });
    const response = await fetch(`/api/crm/analytics/summary?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Analytics summary failed.');
    }
    if (DOM.analyticsStatus) {
      const generatedAt = payload.generatedAt ? formatAnalyticsDateTime(payload.generatedAt) : '';
      DOM.analyticsStatus.textContent = generatedAt ? `Updated ${generatedAt}` : 'Analytics loaded.';
      DOM.analyticsStatus.className = 'analytics-status is-ready';
    }
    return payload;
  } catch (error) {
    addLog(`Analytics summary unavailable: ${error.message}`, 'warn');
    if (DOM.analyticsStatus) {
      DOM.analyticsStatus.textContent = 'Analytics unavailable. Showing empty dashboard.';
      DOM.analyticsStatus.className = 'analytics-status is-error';
    }
    return {
      success: false,
      range,
      totals: { sessions: 0, orders: 0, conversionRate: 0, revenue: 0, aov: 0, errors: 0 },
      sources: [],
      bySource: [],
      funnel: [],
      channels: [],
      stepDistribution: [],
      dailyTrend: [],
      channelByDay: [],
      stepDurations: [],
      averageTimePerStep: [],
      popularBeadSizes: [],
      popularItems: [],
      popularCategories: [],
      recentErrors: [],
      recentOrders: []
    };
  } finally {
    CRMState.analyticsLoading = false;
    syncAnalyticsRangeButtons();
  }
}

function formatAnalyticsPercent(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0%';
  return `${amount.toFixed(1)}%`;
}

function formatAnalyticsDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return 'ยังไม่มีข้อมูล';
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function formatAnalyticsMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '฿0';
  return `฿${Math.round(amount).toLocaleString()}`;
}

function formatAnalyticsDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getAnalyticsTotals(summary = {}) {
  const totals = summary.totals && typeof summary.totals === 'object' ? summary.totals : {};
  return {
    sessions: Number(totals.sessions ?? summary.totalSessions ?? 0),
    orders: Number(totals.orders ?? summary.totalOrders ?? 0),
    conversionRate: Number(totals.conversionRate ?? summary.conversionRate ?? 0),
    revenue: Number(totals.revenue ?? summary.totalRevenue ?? 0),
    aov: Number(totals.aov ?? 0),
    errors: Number(totals.errors ?? 0)
  };
}

function syncAnalyticsRangeButtons() {
  DOM.analyticsRangeButtons.forEach((button) => {
    const isActive = button.dataset.analyticsRange === CRMState.analyticsRange;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.disabled = CRMState.analyticsLoading;
  });
  if (DOM.btnRefreshAnalytics) {
    DOM.btnRefreshAnalytics.disabled = CRMState.analyticsLoading;
  }
}

function renderAnalyticsTableEmpty(tbody, colspan, message) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">${escapeHtml(message)}</td></tr>`;
}

function renderAnalyticsCountTable(tbody, rows, labelKey, emptyMessage) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    renderAnalyticsTableEmpty(tbody, 2, emptyMessage);
    return;
  }
  tbody.innerHTML = safeRows.map((row) => `
    <tr>
      <td data-label="Item">${escapeHtml(row[labelKey] || '-')}</td>
      <td data-label="Count">${Number(row.count || 0).toLocaleString()}</td>
    </tr>
  `).join('');
}

function renderAnalyticsCardsEmpty(container, message) {
  if (!container) return;
  container.innerHTML = `<div class="analytics-empty-card">${escapeHtml(message)}</div>`;
}

function getAnalyticsChannelBadge(channel) {
  const label = String(channel || 'Other / Unknown');
  if (label === 'LINE') return 'LN';
  if (label === 'Facebook') return 'FB';
  if (label === 'Instagram') return 'IG';
  if (label === 'TikTok') return 'TT';
  if (label === 'Google') return 'GG';
  if (label.includes('Direct')) return 'DR';
  return 'OT';
}

function renderAnalyticsChannelCards(channels = []) {
  const rows = Array.isArray(channels) ? channels : [];
  if (!DOM.analyticsChannelCards) return;
  if (rows.length === 0) {
    renderAnalyticsCardsEmpty(DOM.analyticsChannelCards, 'ยังไม่มีข้อมูลในช่วงเวลานี้');
    if (DOM.analyticsChannelInsight) DOM.analyticsChannelInsight.textContent = 'ยังไม่มีข้อมูลในช่วงเวลานี้';
    return;
  }
  const best = rows.slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0) || Number(b.orders || 0) - Number(a.orders || 0))[0];
  DOM.analyticsChannelCards.innerHTML = rows.map((row) => {
    const isBest = best && row.channel === best.channel && (Number(row.revenue || 0) > 0 || Number(row.orders || 0) > 0);
    return `
      <article class="analytics-channel-card ${isBest ? 'is-best-channel' : ''}">
        <div class="analytics-channel-top">
          <span class="analytics-channel-badge">${escapeHtml(getAnalyticsChannelBadge(row.channel))}</span>
          <div>
            <h5>${escapeHtml(row.channel || row.source || 'Direct / Unknown')}</h5>
            <p>${escapeHtml(row.campaign || row.medium || '-')}</p>
          </div>
          ${isBest ? '<span class="analytics-best-badge">ดีที่สุด</span>' : ''}
        </div>
        <div class="analytics-channel-main">
          <div><strong>${Number(row.sessions || 0).toLocaleString()}</strong><span>Sessions</span></div>
          <div><strong>${Number(row.orders || 0).toLocaleString()}</strong><span>Orders</span></div>
          <div><strong>${formatAnalyticsPercent(row.conversionRate || 0)}</strong><span>CVR</span></div>
          <div><strong>${formatAnalyticsMoney(row.revenue || 0)}</strong><span>Revenue</span></div>
        </div>
        <div class="analytics-channel-foot">
          <span>ถึง Step 3: ${Number(row.step3Sessions || 0).toLocaleString()}</span>
          <span>ครบวง: ${Number(row.braceletCompleted || 0).toLocaleString()}</span>
          <span>${Number(row.orders || 0) > 0 ? `AOV ${formatAnalyticsMoney(row.aov || 0)}` : 'ยังไม่มีออเดอร์'}</span>
        </div>
      </article>
    `;
  }).join('');
  if (DOM.analyticsChannelInsight) {
    const top = rows.slice().sort((a, b) => Number(b.sessions || 0) - Number(a.sessions || 0))[0];
    DOM.analyticsChannelInsight.textContent = top
      ? `ช่องทางที่คนเข้ามามากสุด: ${top.channel || top.source || '-'} (${Number(top.sessions || 0).toLocaleString()} sessions)`
      : 'ยังไม่มีข้อมูลในช่วงเวลานี้';
  }
}

function renderAnalyticsFunnelCards(funnelRows = [], totals = {}) {
  const rows = Array.isArray(funnelRows) ? funnelRows : [];
  if (!DOM.analyticsFunnelCards) return;
  if (rows.length === 0) {
    renderAnalyticsCardsEmpty(DOM.analyticsFunnelCards, 'ยังไม่มีข้อมูลในช่วงเวลานี้');
    return;
  }
  DOM.analyticsFunnelCards.innerHTML = rows.map((row, index) => {
    const percent = Number(row.percentFromLanding ?? row.landingConversionRate ?? 0);
    const dropoff = Number(row.dropoffFromPrevious ?? row.dropoffRate ?? 0);
    return `
      <article class="analytics-funnel-card">
        <div class="analytics-funnel-index">${index + 1}</div>
        <div class="analytics-funnel-content">
          <div class="analytics-funnel-head">
            <strong>${escapeHtml(row.label || row.eventName || '-')}</strong>
            <span>${Number(row.sessions || 0).toLocaleString()} sessions</span>
          </div>
          <div class="analytics-progress"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div>
          <div class="analytics-funnel-meta">
            <span>${formatAnalyticsPercent(percent)} จากหน้าแรก</span>
            <span>Drop-off ${formatAnalyticsPercent(dropoff)}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
  if (DOM.analyticsFunnelInsight) {
    const completed = rows.find((row) => row.key === 'bracelet_completed' || row.eventName === 'bracelet_completed');
    const noPayment = Math.max(0, Number(completed?.sessions || 0) - Number(totals.orders || 0));
    DOM.analyticsFunnelInsight.textContent = `ออกแบบครบแต่ยังไม่สั่งซื้อ ${noPayment.toLocaleString()} sessions`;
  }
}

function renderAnalyticsStepDistribution(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!DOM.analyticsStepDistribution) return;
  if (safeRows.length === 0) {
    renderAnalyticsCardsEmpty(DOM.analyticsStepDistribution, 'ยังไม่มีข้อมูล current_step');
    return;
  }
  const maxValue = Math.max(1, ...safeRows.map((row) => Number(row.sessions || 0)));
  DOM.analyticsStepDistribution.innerHTML = safeRows.map((row) => {
    const sessions = Number(row.sessions || 0);
    const width = Math.max(4, (sessions / maxValue) * 100);
    return `
      <article class="analytics-step-card">
        <div class="analytics-step-label">
          <strong>${escapeHtml(row.label || `Step ${row.step}`)}</strong>
          <span>${sessions.toLocaleString()}</span>
        </div>
        <div class="analytics-progress"><span style="width:${width}%"></span></div>
      </article>
    `;
  }).join('');
  if (DOM.analyticsStepInsight) {
    const stuckRows = safeRows.filter((row) => row.step !== 'converted');
    const top = stuckRows.sort((a, b) => Number(b.sessions || 0) - Number(a.sessions || 0))[0];
    DOM.analyticsStepInsight.textContent = top ? `ค้างมากสุด: ${top.label} (${Number(top.sessions || 0).toLocaleString()})` : 'ยังไม่มีลูกค้าค้างใน Step';
  }
}

function renderAnalyticsDailyTrend(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (DOM.analyticsDailyTrendCards) {
    if (safeRows.length === 0) {
      renderAnalyticsCardsEmpty(DOM.analyticsDailyTrendCards, 'ยังไม่มีข้อมูลในช่วงเวลานี้');
    } else {
      const maxSessions = Math.max(1, ...safeRows.map((row) => Number(row.sessions || 0)));
      DOM.analyticsDailyTrendCards.innerHTML = safeRows.slice(-14).map((row) => {
        const width = Math.max(4, (Number(row.sessions || 0) / maxSessions) * 100);
        return `
          <article class="analytics-day-card">
            <div class="analytics-day-main">
              <strong>${escapeHtml(row.date || '-')}</strong>
              <span>${Number(row.sessions || 0).toLocaleString()} sessions</span>
            </div>
            <div class="analytics-progress"><span style="width:${width}%"></span></div>
            <div class="analytics-day-meta">
              <span>Orders ${Number(row.orders || 0).toLocaleString()}</span>
              <span>${formatAnalyticsPercent(row.conversionRate || 0)}</span>
              <span>${formatAnalyticsMoney(row.revenue || 0)}</span>
            </div>
          </article>
        `;
      }).join('');
    }
  }
  if (safeRows.length > 0 && DOM.analyticsDailyTrendTableBody) {
    DOM.analyticsDailyTrendTableBody.innerHTML = safeRows.map((row) => `
      <tr>
        <td data-label="Date">${escapeHtml(row.date || '-')}</td>
        <td data-label="Sessions">${Number(row.sessions || 0).toLocaleString()}</td>
        <td data-label="Orders">${Number(row.orders || 0).toLocaleString()}</td>
        <td data-label="CVR">${formatAnalyticsPercent(row.conversionRate || 0)}</td>
        <td data-label="Revenue">${formatAnalyticsMoney(row.revenue || 0)}</td>
      </tr>
    `).join('');
  } else {
    renderAnalyticsTableEmpty(DOM.analyticsDailyTrendTableBody, 5, 'ยังไม่มีข้อมูลในช่วงเวลานี้');
  }
}

function renderAnalyticsChannelDayTable(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length > 0 && DOM.analyticsChannelDayTableBody) {
    DOM.analyticsChannelDayTableBody.innerHTML = safeRows.slice(0, 100).map((row) => `
      <tr>
        <td data-label="Date">${escapeHtml(row.date || '-')}</td>
        <td data-label="Channel">${escapeHtml(row.channel || '-')}</td>
        <td data-label="Sessions">${Number(row.sessions || 0).toLocaleString()}</td>
        <td data-label="Orders">${Number(row.orders || 0).toLocaleString()}</td>
        <td data-label="Revenue">${formatAnalyticsMoney(row.revenue || 0)}</td>
      </tr>
    `).join('');
  } else {
    renderAnalyticsTableEmpty(DOM.analyticsChannelDayTableBody, 5, 'ยังไม่มีข้อมูลในช่วงเวลานี้');
  }
}

function renderAnalyticsCompactOrders(rows = []) {
  if (!DOM.analyticsOrderCards) return;
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    renderAnalyticsCardsEmpty(DOM.analyticsOrderCards, 'ยังไม่มีออเดอร์ในช่วงเวลานี้');
    return;
  }
  DOM.analyticsOrderCards.innerHTML = safeRows.slice(0, 20).map((order) => `
    <article class="analytics-compact-card">
      <div>
        <strong>${escapeHtml(order.orderId || '-')}</strong>
        <span>${escapeHtml(formatAnalyticsDateTime(order.time))}</span>
      </div>
      <div>
        <strong>${escapeHtml(order.source || 'Direct / Unknown')}</strong>
        <span>${escapeHtml(order.campaign || '-')}</span>
      </div>
      <div class="analytics-compact-value">${formatAnalyticsMoney(order.revenue || 0)}</div>
    </article>
  `).join('');
}

function renderAnalyticsCompactErrors(rows = []) {
  if (!DOM.analyticsErrorCards) return;
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    renderAnalyticsCardsEmpty(DOM.analyticsErrorCards, 'ยังไม่พบ error จากผู้ใช้งาน');
    return;
  }
  DOM.analyticsErrorCards.innerHTML = safeRows.slice(0, 20).map((error) => `
    <article class="analytics-compact-card analytics-error-card">
      <div>
        <strong>${escapeHtml(error.errorType || error.error_type || 'error')}</strong>
        <span>${escapeHtml(formatAnalyticsDateTime(error.time || error.created_at))}</span>
      </div>
      <div>
        <strong>${escapeHtml(error.source || error.sessionId || '-')}</strong>
        <span>Step ${escapeHtml(error.step ?? '-')}</span>
      </div>
      <p>${escapeHtml(error.message || '-')}</p>
    </article>
  `).join('');
}

function renderAnalyticsSummary(summary = {}) {
  const totals = getAnalyticsTotals(summary);
  if (DOM.analyticsTotalSessions) DOM.analyticsTotalSessions.textContent = totals.sessions.toLocaleString();
  if (DOM.analyticsTotalOrders) DOM.analyticsTotalOrders.textContent = totals.orders.toLocaleString();
  if (DOM.analyticsConversionRate) DOM.analyticsConversionRate.textContent = formatAnalyticsPercent(totals.conversionRate);
  if (DOM.analyticsTotalRevenue) DOM.analyticsTotalRevenue.textContent = formatAnalyticsMoney(totals.revenue);
  if (DOM.analyticsAov) DOM.analyticsAov.textContent = formatAnalyticsMoney(totals.aov);
  if (DOM.analyticsErrorsCount) DOM.analyticsErrorsCount.textContent = totals.errors.toLocaleString();

  const bySource = Array.isArray(summary.channels) ? summary.channels : Array.isArray(summary.sources) ? summary.sources : Array.isArray(summary.bySource) ? summary.bySource : [];
  renderAnalyticsChannelCards(bySource);
  if (bySource.length > 0 && DOM.analyticsSourceTableBody) {
    DOM.analyticsSourceTableBody.innerHTML = bySource.map((row) => `
      <tr>
        <td data-label="Source">${escapeHtml(row.channel || row.source || 'direct/unknown')}</td>
        <td data-label="Medium">${escapeHtml(row.medium || '-')}</td>
        <td data-label="Campaign">${escapeHtml(row.campaign || '-')}</td>
        <td data-label="Sessions">${Number(row.sessions || 0).toLocaleString()}</td>
        <td data-label="Orders">${Number(row.orders || 0).toLocaleString()}</td>
        <td data-label="CVR">${formatAnalyticsPercent(row.conversionRate || 0)}</td>
        <td data-label="Revenue">${formatAnalyticsMoney(row.revenue || 0)}</td>
        <td data-label="AOV">${formatAnalyticsMoney(row.aov || 0)}</td>
      </tr>
    `).join('');
  } else {
    renderAnalyticsTableEmpty(DOM.analyticsSourceTableBody, 8, 'No analytics sessions yet.');
  }

  const funnelRows = Array.isArray(summary.funnel) ? summary.funnel : [];
  renderAnalyticsFunnelCards(funnelRows, totals);
  if (DOM.analyticsFunnelTableBody) {
    DOM.analyticsFunnelTableBody.innerHTML = funnelRows.map((row) => `
      <tr>
        <td data-label="Event">${escapeHtml(row.label || row.eventName || '-')}</td>
        <td data-label="Sessions">${Number(row.sessions || 0).toLocaleString()}</td>
        <td data-label="Drop-off">${formatAnalyticsPercent(row.dropoffFromPrevious ?? row.dropoffRate ?? 0)}</td>
        <td data-label="From landing">${formatAnalyticsPercent(row.percentFromLanding ?? row.landingConversionRate ?? 0)}</td>
      </tr>
    `).join('');
  }

  renderAnalyticsStepDistribution(summary.stepDistribution);
  renderAnalyticsDailyTrend(summary.dailyTrend);
  renderAnalyticsChannelDayTable(summary.channelByDay);

  const timeRows = Array.isArray(summary.stepDurations) ? summary.stepDurations : Array.isArray(summary.averageTimePerStep) ? summary.averageTimePerStep : [];
  if (timeRows.length > 0 && DOM.analyticsTimeTableBody) {
    DOM.analyticsTimeTableBody.innerHTML = timeRows.map((row) => `
      <tr>
        <td data-label="Step">Step ${escapeHtml(row.step)}</td>
        <td data-label="Average Time">${formatAnalyticsDuration(row.averageMs ?? row.average_ms)}</td>
        <td data-label="Samples">${Number(row.samples || 0).toLocaleString()}</td>
      </tr>
    `).join('');
  } else {
    renderAnalyticsTableEmpty(DOM.analyticsTimeTableBody, 3, 'ยังไม่มีข้อมูล');
  }

  const errors = Array.isArray(summary.recentErrors) ? summary.recentErrors : [];
  renderAnalyticsCompactErrors(errors);
  if (errors.length > 0 && DOM.analyticsErrorsTableBody) {
    DOM.analyticsErrorsTableBody.innerHTML = errors.slice(0, 20).map((error) => `
      <tr>
        <td data-label="Time">${escapeHtml(formatAnalyticsDateTime(error.time || error.created_at))}</td>
        <td data-label="Session ID">${escapeHtml(error.sessionId || error.session_id || '-')}</td>
        <td data-label="Error Type">${escapeHtml(error.errorType || error.error_type || error.event_name || 'error')}</td>
        <td data-label="Step">${escapeHtml(error.step ?? '-')}</td>
        <td data-label="Message">${escapeHtml(error.message || '-')}</td>
        <td data-label="URL">${escapeHtml(error.url || '-')}</td>
      </tr>
    `).join('');
  } else {
    renderAnalyticsTableEmpty(DOM.analyticsErrorsTableBody, 6, 'ยังไม่พบ error จากผู้ใช้งาน');
  }

  renderAnalyticsCountTable(DOM.analyticsBeadSizeTableBody, summary.popularBeadSizes, 'beadSize', 'No bead-size events yet.');
  renderAnalyticsCountTable(DOM.analyticsItemsTableBody, summary.popularItems, 'item', 'No item-added events yet.');
  renderAnalyticsCountTable(DOM.analyticsCategoriesTableBody, summary.popularCategories, 'category', 'No category events yet.');

  const recentOrders = Array.isArray(summary.recentOrders) ? summary.recentOrders : [];
  renderAnalyticsCompactOrders(recentOrders);
  if (recentOrders.length > 0 && DOM.analyticsRecentOrdersTableBody) {
    DOM.analyticsRecentOrdersTableBody.innerHTML = recentOrders.map((order) => `
      <tr>
        <td data-label="Time">${escapeHtml(formatAnalyticsDateTime(order.time))}</td>
        <td data-label="Source">${escapeHtml(order.source || 'direct/unknown')}</td>
        <td data-label="Campaign">${escapeHtml(order.campaign || '-')}</td>
        <td data-label="Order ID">${escapeHtml(order.orderId || '-')}</td>
        <td data-label="Revenue">${formatAnalyticsMoney(order.revenue || 0)}</td>
        <td data-label="Current Step">${escapeHtml(order.currentStep ?? '-')}</td>
      </tr>
    `).join('');
  } else {
    renderAnalyticsTableEmpty(DOM.analyticsRecentOrdersTableBody, 6, 'No converted sessions in this range.');
  }
}

// Render Tab 1 Overview Recent Orders (up to 4 items)
function renderRecentOrdersList(orders) {
  DOM.overviewRecentOrders.innerHTML = '';
  if (orders.length === 0) {
    DOM.overviewRecentOrders.innerHTML = '<div class="empty-state">No orders received yet.</div>';
    return;
  }
  
  orders.slice(0, 4).forEach(order => {
    const item = document.createElement('div');
    item.className = 'recent-order-item';
    
    // Status color selection
    let statusClass = 'badge-new';
    if (order.status === 'Stone Selection Photo Sent') statusClass = 'badge-photo';
    if (order.status === 'Payment Received') statusClass = 'badge-paid';
    if (order.status === 'Shipped') statusClass = 'badge-shipped';
    if (order.status === 'Completed') statusClass = 'badge-completed';
    
    const formattedDate = new Date(order.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    
    item.innerHTML = `
      <div class="ro-info">
        <div class="ro-header">
          <span class="ro-id">${order.id}</span>
          <span class="badge ${statusClass}">${order.status || 'New'}</span>
        </div>
        <div class="ro-name">${order.customerName}</div>
        <div class="ro-meta">${formattedDate} &bull; ${order.wristSize.toFixed(1)}cm &bull; ${order.totalBeads} beads</div>
      </div>
      <div class="ro-pricing">
        <span class="ro-price">฿${getOrderFinalPrice(order).toLocaleString()}</span>
      </div>
    `;
    DOM.overviewRecentOrders.appendChild(item);
  });
}

// ==========================================
// 8. Tab 2: Stone Inventory CRUD (Module A)
// ==========================================
function renderStoneInventoryCatalogLegacy(stones) {
  const query = DOM.inventorySearch.value.trim().toLowerCase();
  
  // Filter list
  const filtered = stones.filter(s => {
    return s.name.toLowerCase().includes(query) || 
           s.nameTh.toLowerCase().includes(query) || 
           s.meaning.toLowerCase().includes(query) || 
           s.meaningTh.toLowerCase().includes(query);
  });
  
  DOM.inventoryTableBody.innerHTML = '';
  if (filtered.length === 0) {
    DOM.inventoryTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">No matching stones found.</td></tr>';
    return;
  }
  
  filtered.forEach(stone => {
    const tr = document.createElement('tr');
    
    // Size badges mapping
    const sizesBadges = (stone.sizes || []).map(sz => `<span class="badge" style="background-color: var(--color-navy); border: 1px solid var(--color-navy-border); color: #cbd5e1">${sz}mm</span>`).join(' ');
    
    // Category mapping
    const categoryKey = stone.categoryId || stone.category;
    const categoryLabel = getCategoryLabelById(categoryKey, 'stone');
    const catName = categoryLabel.th || stone.categoryTh || stone.category || categoryKey;
    const categoryBadgeClass = categoryLabel.missing ? 'unknown' : (categoryKey || 'unknown');
    
    // Stock Status badge
    const isAvailable = isCrmItemInStock(stone);
    const stockBadge = isAvailable 
      ? '<span class="badge badge-in-stock">In Stock</span>' 
      : '<span class="badge badge-out-of-stock">Out of Stock</span>';
    
    tr.innerHTML = `
      <td data-label="Bead">
        <img class="table-bead-img inventory-stone-img" src="${escapeHtml(getSafeThumbnailSrc(stone.image))}" alt="${escapeHtml(stone.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${IMAGE_THUMB_PLACEHOLDER}'">
      </td>
      <td data-label="Stone Name">
        <div class="stone-title-th">${stone.nameTh}</div>
        <div class="stone-title-en">${stone.name}</div>
      </td>
      <td data-label="Price">
        <div style="font-size: 11px; line-height: 1.4; display: flex; flex-direction: column; gap: 2px;">
          <span>4mm: <strong>฿${stone.p4 || 0}</strong></span>
          <span>6mm: <strong>฿${stone.p6 || 0}</strong></span>
          <span>8mm: <strong>฿${stone.p8 || 0}</strong></span>
        </div>
      </td>
      <td data-label="Sizes">${sizesBadges}</td>
      <td data-label="Category"><span class="badge badge-${categoryBadgeClass}">${catName}</span></td>
      <td data-label="Status">${stockBadge}</td>
      <td data-label="Meanings" style="max-width: 250px; font-size: 11px;">
        <div style="color: var(--color-navy-dark); font-weight: 600;">${stone.meaningTh}</div>
        <div class="text-muted" style="color: var(--color-navy-muted); font-style: italic;">${stone.meaning}</div>
      </td>
      <td data-label="Actions" class="text-right">
        <div class="action-btns">
          <button class="action-btn edit" data-id="${stone.id}" title="Edit Stone details">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${stone.id}" title="Remove Stone type">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </td>
    `;
    
    // Bind button handlers
    tr.querySelector('.action-btn.edit').addEventListener('click', () => openEditStoneForm(stone.id));
    tr.querySelector('.action-btn.delete').addEventListener('click', () => deleteStoneType(stone.id));
    
    DOM.inventoryTableBody.appendChild(tr);
  });
}

function getInventoryTypeLabel(type) {
  if (type === 'charm') return CRM_COMPONENT_LABELS.charm;
  if (type === 'spacer') return CRM_COMPONENT_LABELS.spacer;
  return CRM_COMPONENT_LABELS.stone;
}

function normalizeStockQtyForCrm(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function getCrmStockQty(item) {
  return normalizeStockQtyForCrm(item?.stockQty ?? item?.stock_qty ?? item?.availability?.stockQty ?? item?.availability?.stock_qty, null);
}

function isCrmItemInStock(item) {
  const stockQty = getCrmStockQty(item);
  return item?.availability?.inStock !== false && item?.inStock !== false && (stockQty === null || stockQty > 0);
}

function formatInventoryStonePrice(stone) {
  return [4, 6, 8]
    .filter((size) => stone[`p${size}`] !== undefined)
    .map((size) => `${size}mm &#3647;${Number(stone[`p${size}`] || 0).toLocaleString()}`)
    .join(' / ') || '&mdash;';
}

function buildInventoryItems(stones = [], charms = [], spacers = []) {
  const stoneItems = stones.map((stone) => {
    const categoryKey = stone.categoryId || stone.category;
    const categoryLabel = getCategoryLabelById(categoryKey, 'stone');
    const nameTh = stone.nameTh || stone.name || stone.id;
    const nameEn = stone.name || stone.nameTh || stone.id;
    const sizes = (stone.sizes || []).map((size) => `${size}mm`).join(', ');

    return {
      id: stone.id,
      type: 'stone',
      typeLabel: getInventoryTypeLabel('stone'),
      image: withCatalogImageVersion(stone.image || '', stone),
      nameTh,
      nameEn,
      meta: categoryLabel.th || stone.categoryTh || stone.category || categoryKey || 'Uncategorized',
      priceText: formatInventoryStonePrice(stone),
      sizeText: sizes || '&mdash;',
      stockQty: getCrmStockQty(stone),
      isInStock: isCrmItemInStock(stone),
      isActive: stone.isActive !== false,
      searchText: [
        stone.id,
        nameTh,
        nameEn,
        stone.meaning,
        stone.meaningTh,
        categoryKey,
        categoryLabel.th,
        categoryLabel.en,
        'stone'
      ].filter(Boolean).join(' ').toLowerCase()
    };
  });

  const charmItems = charms.map((charm) => {
    const categoryLabel = getCategoryLabelById(charm.collection || charm.categoryId, 'charm');
    const nameTh = charm.name?.th || charm.name?.en || charm.id;
    const nameEn = charm.name?.en || charm.name?.th || charm.id;
    const sizeCm = Number(charm.business?.sizeCm || 0);
    const footprintMm = Number(charm.business?.footprintMm || charm.business?.effectiveLengthMm || 0);
    const sizeParts = [];
    if (sizeCm) sizeParts.push(`${sizeCm.toFixed(1)} cm`);
    if (footprintMm) sizeParts.push(`${footprintMm}mm footprint`);

    return {
      id: charm.id,
      type: 'charm',
      typeLabel: getInventoryTypeLabel('charm'),
      image: withCatalogImageVersion(charm.image?.primary || '', charm),
      nameTh,
      nameEn,
      meta: categoryLabel.th || charm.collection || charm.categoryId || charm.type || CRM_COMPONENT_LABELS.charm,
      priceText: `&#3647;${Number(charm.pricing?.base || 0).toLocaleString()}`,
      sizeText: sizeParts.join(' / ') || '&mdash;',
      stockQty: getCrmStockQty(charm),
      isInStock: isCrmItemInStock(charm),
      isActive: charm.availability?.isActive !== false,
      searchText: [
        charm.id,
        charm.sku,
        nameTh,
        nameEn,
        charm.type,
        charm.collection,
        charm.categoryId,
        categoryLabel.th,
        categoryLabel.en,
        'charm'
      ].filter(Boolean).join(' ').toLowerCase()
    };
  });

  const spacerItems = spacers.map((spacer) => {
    const nameTh = spacer.name?.th || spacer.name?.en || spacer.id;
    const nameEn = spacer.name?.en || spacer.name?.th || spacer.id;
    const displaySizeMm = Number(spacer.business?.displaySizeMm || spacer.business?.sizeMm || 0);
    const effectiveLengthMm = Number(spacer.business?.effectiveLengthMm || 0);
    const thicknessMm = Number(spacer.business?.thicknessMm || 0);
    const sizeParts = [];
    if (displaySizeMm) sizeParts.push(`${displaySizeMm}mm visual`);
    if (effectiveLengthMm) sizeParts.push(`${effectiveLengthMm}mm length`);
    if (thicknessMm) sizeParts.push(`${thicknessMm}mm thick`);

    return {
      id: spacer.id,
      type: 'spacer',
      typeLabel: getInventoryTypeLabel('spacer'),
      image: withCatalogImageVersion(spacer.image?.primary || '', spacer),
      nameTh,
      nameEn,
      meta: [spacer.type, spacer.color].filter(Boolean).join(' / ') || CRM_COMPONENT_LABELS.spacer,
      priceText: `&#3647;${Number(spacer.pricing?.base || 0).toLocaleString()}`,
      sizeText: sizeParts.join(' / ') || '&mdash;',
      stockQty: getCrmStockQty(spacer),
      isInStock: isCrmItemInStock(spacer),
      isActive: spacer.availability?.isActive !== false,
      searchText: [
        spacer.id,
        spacer.sku,
        nameTh,
        nameEn,
        spacer.type,
        spacer.color,
        spacer.collection,
        spacer.meaning?.en,
        spacer.meaning?.th,
        'spacer'
      ].filter(Boolean).join(' ').toLowerCase()
    };
  });

  return [...stoneItems, ...charmItems, ...spacerItems];
}

function renderInventoryCatalog(stones, charms = [], spacers = []) {
  const query = DOM.inventorySearch.value.trim().toLowerCase();
  const activeType = CRMState.inventoryTypeFilter || 'all';
  DOM.inventoryTypeTabs.forEach((tab) => {
    const isActive = tab.dataset.inventoryType === activeType;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });

  const filtered = buildInventoryItems(stones, charms, spacers).filter((item) => {
    if (activeType !== 'all' && item.type !== activeType) return false;
    if (!query) return true;
    return item.searchText.includes(query);
  });

  DOM.inventoryTableBody.innerHTML = '';
  if (filtered.length === 0) {
    const itemLabel = activeType === 'all' ? 'inventory items' : `${getInventoryTypeLabel(activeType).toLowerCase()} items`;
    const emptyMessage = `No matching ${itemLabel} found.`;
    DOM.inventoryTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">${emptyMessage}</td></tr>`;
    return;
  }

  filtered.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'inventory-compact-row';
    tr.dataset.itemType = item.type;

    const statusText = item.isInStock ? 'In Stock' : 'Out of Stock';
    const statusClass = item.isInStock ? 'badge-in-stock' : 'badge-out-of-stock';
    const visibilityText = item.isActive === false ? '<span class="inventory-muted-status">Hidden</span>' : '';
    const actionDisabled = item.type === 'spacer' ? 'disabled aria-disabled="true"' : '';
    const actionTitle = item.type === 'spacer' ? `${CRM_COMPONENT_LABELS.spacer} business CRUD is not available yet` : `Edit ${item.typeLabel}`;
    const deleteTitle = item.type === 'spacer' ? `${CRM_COMPONENT_LABELS.spacer} business CRUD is not available yet` : `Delete ${item.typeLabel}`;

    tr.innerHTML = `
      <td data-label="Item">
        <div class="inventory-item-cell">
          <img class="table-bead-img inventory-item-img" src="${escapeHtml(getSafeThumbnailSrc(item.image))}" alt="${escapeHtml(item.nameEn)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${IMAGE_THUMB_PLACEHOLDER}'">
          <div class="inventory-item-copy">
            <div class="stone-title-th">${escapeHtml(item.nameTh)}</div>
            <div class="stone-title-en">${escapeHtml(item.nameEn)}</div>
            <div class="inventory-item-meta">${escapeHtml(item.meta || item.id)} &bull; ${escapeHtml(item.id)}</div>
          </div>
        </div>
      </td>
      <td data-label="Type"><span class="inventory-type-badge inventory-type-${item.type}">${item.typeLabel}</span></td>
      <td data-label="Price"><span class="inventory-price">${item.priceText}</span></td>
      <td data-label="Size"><span class="inventory-size">${item.sizeText}</span></td>
      <td data-label="Status">
        <div class="inventory-status-stack">
          <span class="badge ${statusClass}">${statusText}</span>
          ${visibilityText}
          <label class="charm-inline-field">
            <span>Stock</span>
            <input
              type="number"
              class="charm-inline-input inventory-stock-input"
              data-item-type="${item.type}"
              data-item-id="${item.id}"
              value="${item.stockQty ?? ''}"
              min="0"
              step="1"
              aria-label="Stock quantity for ${escapeHtml(item.nameEn)}"
            >
          </label>
        </div>
      </td>
      <td data-label="Actions" class="text-right">
        <div class="action-btns inventory-action-btns">
          <button class="action-btn edit" data-id="${escapeHtml(item.id)}" data-type="${item.type}" title="${actionTitle}" ${actionDisabled}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${escapeHtml(item.id)}" data-type="${item.type}" title="${deleteTitle}" ${actionDisabled}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.action-btn.edit').addEventListener('click', () => {
      if (item.type === 'spacer') return;
      if (item.type === 'charm') {
        openEditCharmForm(item.id);
        return;
      }
      openEditStoneForm(item.id);
    });
    tr.querySelector('.action-btn.delete').addEventListener('click', () => {
      if (item.type === 'spacer') return;
      if (item.type === 'charm') {
        deleteCharmType(item.id);
        return;
      }
      deleteStoneType(item.id);
    });

    DOM.inventoryTableBody.appendChild(tr);
  });
}

function renderBraceletLayoutSimulatorLegacy(stones = [], charms = [], spacers = []) {
  const activeCategory = CRMState.simulatorCategory || 'stones';
  const categoryLabelMap = {
    stones: CRM_COMPONENT_LABELS.stone,
    charms: CRM_COMPONENT_LABELS.charm,
    spacers: CRM_COMPONENT_LABELS.spacer
  };

  DOM.simulatorCategoryTabs.forEach((tab) => {
    const isActive = tab.dataset.simulatorCategory === activeCategory;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });

  const allItems = buildInventoryItems(stones, charms, spacers);
  const filteredItems = allItems.filter((item) => item.type === activeCategory.slice(0, -1));
  const categoryLabel = categoryLabelMap[activeCategory] || CRM_COMPONENT_LABELS.stone;

  if (DOM.simulatorCategoryHint) {
    DOM.simulatorCategoryHint.textContent = `Showing ${categoryLabel.toLowerCase()} from the shared catalog.`;
  }

  if (!DOM.simulatorItemGrid || !DOM.simulatorCatalogEmpty) return;

  if (filteredItems.length === 0) {
    DOM.simulatorItemGrid.innerHTML = '';
    DOM.simulatorItemGrid.hidden = true;
    DOM.simulatorCatalogEmpty.hidden = false;
    if (DOM.simulatorEmptyTitle) {
      DOM.simulatorEmptyTitle.textContent = `No ${categoryLabel.toLowerCase()} available in the catalog yet.`;
    }
    return;
  }

  DOM.simulatorCatalogEmpty.hidden = true;
  DOM.simulatorItemGrid.hidden = false;
  DOM.simulatorItemGrid.innerHTML = filteredItems.map((item) => {
    const typeLabel = item.typeLabel || getInventoryTypeLabel(item.type);
    const priceText = item.priceText || '—';
    return `
      <div class="simulator-item-card" data-simulator-item-type="${escapeHtml(item.type)}" data-simulator-item-id="${escapeHtml(item.id)}">
        <div class="simulator-item-grip" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <img class="simulator-item-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.nameEn)}" onerror="this.src='${IMAGE_THUMB_PLACEHOLDER}'">
        <div class="simulator-item-copy">
          <div class="simulator-item-name">${escapeHtml(item.nameTh)}</div>
          <div class="simulator-item-en">${escapeHtml(item.nameEn)}</div>
          <div class="simulator-item-meta-row">
            <span class="simulator-item-badge">${escapeHtml(typeLabel)}</span>
            <span class="simulator-item-size">${escapeHtml(item.sizeText || '—')}</span>
          </div>
          <div class="simulator-item-price">${priceText}</div>
        </div>
      </div>
    `;
  }).join('');
}

const SIMULATOR_STORAGE_KEY = 'lucky_crm_simulator_layout_v1';

function normalizeSimulatorCategory(value) {
  const nextValue = String(value || '').toLowerCase();
  return ['stones', 'charms', 'spacers'].includes(nextValue) ? nextValue : 'stones';
}

function getSimulatorCatalogCache() {
  const cache = CRMState.simulatorCatalogCache || {};
  return {
    stones: Array.isArray(cache.stones) ? cache.stones : [],
    charms: Array.isArray(cache.charms) ? cache.charms : [],
    spacers: Array.isArray(cache.spacers) ? cache.spacers : []
  };
}

function getSimulatorCatalogItems(category = 'stones') {
  const cache = getSimulatorCatalogCache();
  const normalizedCategory = normalizeSimulatorCategory(category);
  return buildInventoryItems(cache.stones, cache.charms, cache.spacers)
    .filter((item) => item.type === normalizedCategory.slice(0, -1));
}

function getSimulatorLayoutSeqFromUid(uid) {
  const match = String(uid || '').match(/(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function syncSimulatorLayoutSeq(layout = []) {
  CRMState.simulatorLayoutSeq = layout.reduce((max, item) => {
    return Math.max(max, getSimulatorLayoutSeqFromUid(item?.uid));
  }, 0);
}

function createSimulatorLayoutUid() {
  CRMState.simulatorLayoutSeq = Number.isFinite(CRMState.simulatorLayoutSeq) ? CRMState.simulatorLayoutSeq + 1 : 1;
  return `sim-layout-${CRMState.simulatorLayoutSeq}`;
}

function normalizeSimulatorLayoutItem(item, fallbackIndex = 0) {
  if (!item || typeof item !== 'object') return null;
  const typeValue = String(item.type || item.itemType || '').toLowerCase();
  if (!['stone', 'charm', 'spacer'].includes(typeValue)) return null;
  const id = String(item.id || item.catalogId || '').trim();
  if (!id) return null;

  return {
    uid: String(item.uid || item.instanceId || item.layoutId || `${typeValue}-${id}-${fallbackIndex}`),
    type: typeValue,
    id,
    typeLabel: item.typeLabel || getInventoryTypeLabel(typeValue),
    nameTh: item.nameTh || item.labelTh || item.titleTh || '',
    nameEn: item.nameEn || item.labelEn || item.titleEn || '',
    image: item.image || '',
    priceText: item.priceText || item.price || '—',
    sizeText: item.sizeText || item.size || item.sizeMm || item.sizeCm || '—'
  };
}

function normalizeSimulatorPreset(payload) {
  if (!payload || typeof payload !== 'object') {
    return { category: 'stones', layout: [], seq: 0 };
  }

  const layout = Array.isArray(payload.layout)
    ? payload.layout.map((item, index) => normalizeSimulatorLayoutItem(item, index)).filter(Boolean)
    : [];

  return {
    category: normalizeSimulatorCategory(payload.category),
    layout,
    seq: Number.isFinite(Number(payload.seq)) ? Number(payload.seq) : 0
  };
}

function saveSimulatorPresetToStorage() {
  try {
    const payload = {
      version: 1,
      category: normalizeSimulatorCategory(CRMState.simulatorCategory),
      seq: CRMState.simulatorLayoutSeq || 0,
      layout: Array.isArray(CRMState.simulatorLayout) ? CRMState.simulatorLayout : []
    };
    localStorage.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Unable to save simulator preset.', err);
  }
}

function persistAndRenderSimulatorLayout(stones = [], charms = [], spacers = []) {
  saveSimulatorPresetToStorage();
  renderBraceletLayoutSimulator(stones, charms, spacers);
}

function addSimulatorCatalogItemToLayout(itemType, itemId) {
  const sourceCategories = ['stones', 'charms', 'spacers'];
  const catalogItem = sourceCategories
    .flatMap((category) => getSimulatorCatalogItems(category))
    .find((item) => item.type === itemType && item.id === itemId);

  if (!catalogItem) return false;
  const placedItem = normalizeSimulatorLayoutItem(catalogItem, CRMState.simulatorLayoutSeq + 1);
  if (!placedItem) return false;
  placedItem.uid = createSimulatorLayoutUid();
  CRMState.simulatorLayout = [...(CRMState.simulatorLayout || []), placedItem];
  saveSimulatorPresetToStorage();
  return true;
}

function removeSimulatorLayoutItem(uid) {
  const currentLayout = Array.isArray(CRMState.simulatorLayout) ? CRMState.simulatorLayout : [];
  const nextLayout = currentLayout.filter((item) => item.uid !== uid);
  if (nextLayout.length === currentLayout.length) return false;
  CRMState.simulatorLayout = nextLayout;
  saveSimulatorPresetToStorage();
  return true;
}

function moveSimulatorLayoutItem(uid, direction) {
  const layout = Array.isArray(CRMState.simulatorLayout) ? CRMState.simulatorLayout.slice() : [];
  const fromIndex = layout.findIndex((item) => item.uid === uid);
  if (fromIndex === -1) return false;
  const toIndex = Math.min(Math.max(fromIndex + direction, 0), layout.length - 1);
  if (fromIndex === toIndex) return false;
  const [item] = layout.splice(fromIndex, 1);
  layout.splice(toIndex, 0, item);
  CRMState.simulatorLayout = layout;
  saveSimulatorPresetToStorage();
  return true;
}

function renderSimulatorPreviewLayout() {
  const stage = DOM.simulatorLayoutStage;
  const ring = DOM.simulatorPreviewRing || stage?.closest('.simulator-preview-ring');
  const layout = Array.isArray(CRMState.simulatorLayout) ? CRMState.simulatorLayout : [];

  if (ring) {
    ring.classList.toggle('has-layout', layout.length > 0);
  }

  if (!stage) return;

  stage.innerHTML = '';
  if (layout.length === 0) return;

  const radiusPercent = layout.length <= 3 ? 38 : layout.length <= 6 ? 40 : 42;

  layout.forEach((item, index) => {
    const angle = -90 + (360 / layout.length) * index;
    const angleRad = (angle * Math.PI) / 180;
    const x = 50 + (radiusPercent * Math.cos(angleRad));
    const y = 50 + (radiusPercent * Math.sin(angleRad));
    const orientation = angle + 90;
    const placed = document.createElement('div');
    placed.className = 'simulator-placed-item';
    placed.style.left = `${x}%`;
    placed.style.top = `${y}%`;
    placed.style.setProperty('--simulator-rotation', `${orientation}deg`);
    placed.dataset.simulatorUid = item.uid;
    placed.innerHTML = `
      <div class="simulator-placed-card">
        <div class="simulator-placed-actions">
          <button type="button" class="simulator-placed-action simulator-placed-move" data-simulator-uid="${escapeHtml(item.uid)}" data-simulator-move="-1" aria-label="Move left">◀</button>
          <button type="button" class="simulator-placed-action simulator-placed-move" data-simulator-uid="${escapeHtml(item.uid)}" data-simulator-move="1" aria-label="Move right">▶</button>
          <button type="button" class="simulator-placed-action simulator-placed-remove" data-simulator-uid="${escapeHtml(item.uid)}" aria-label="Remove item">×</button>
        </div>
        <img class="simulator-placed-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.nameEn || item.nameTh || item.id)}" onerror="this.src='${IMAGE_THUMB_PLACEHOLDER}'">
        <div class="simulator-placed-meta">
          <div class="simulator-placed-name">${escapeHtml(item.nameTh || item.id)}</div>
          <div class="simulator-placed-subtitle">${escapeHtml(item.typeLabel || item.type)}</div>
        </div>
      </div>
    `;
    stage.appendChild(placed);
  });

  stage.querySelectorAll('[data-simulator-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const uid = button.dataset.simulatorUid || '';
      const move = Number(button.dataset.simulatorMove || 0);
      if (!uid || !move) return;
      if (moveSimulatorLayoutItem(uid, move)) {
        const cache = getSimulatorCatalogCache();
        persistAndRenderSimulatorLayout(cache.stones, cache.charms, cache.spacers);
      }
    });
  });

  stage.querySelectorAll('.simulator-placed-remove').forEach((button) => {
    button.addEventListener('click', () => {
      const uid = button.dataset.simulatorUid || '';
      if (!uid) return;
      if (removeSimulatorLayoutItem(uid)) {
        const cache = getSimulatorCatalogCache();
        persistAndRenderSimulatorLayout(cache.stones, cache.charms, cache.spacers);
      }
    });
  });
}

function renderLegacyBraceletLayoutSimulator(stones = [], charms = [], spacers = []) {
  const activeCategory = normalizeSimulatorCategory(CRMState.simulatorCategory || 'stones');
  const categoryLabelMap = {
    stones: CRM_COMPONENT_LABELS.stone,
    charms: CRM_COMPONENT_LABELS.charm,
    spacers: CRM_COMPONENT_LABELS.spacer
  };
  const allItems = buildInventoryItems(stones, charms, spacers);
  const filteredItems = allItems.filter((item) => item.type === activeCategory.slice(0, -1));
  const categoryLabel = categoryLabelMap[activeCategory] || 'Stones';

  DOM.simulatorCategoryTabs.forEach((tab) => {
    const isActive = tab.dataset.simulatorCategory === activeCategory;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });

  if (DOM.simulatorCategoryHint) {
    DOM.simulatorCategoryHint.textContent = `Showing ${categoryLabel.toLowerCase()} from the shared catalog.`;
  }

  renderSimulatorPreviewLayout();

  if (!DOM.simulatorItemGrid || !DOM.simulatorCatalogEmpty) return;

  if (filteredItems.length === 0) {
    DOM.simulatorItemGrid.innerHTML = '';
    DOM.simulatorItemGrid.hidden = true;
    DOM.simulatorCatalogEmpty.hidden = false;
    if (DOM.simulatorEmptyTitle) {
      DOM.simulatorEmptyTitle.textContent = `No ${categoryLabel.toLowerCase()} available in the catalog yet.`;
    }
    if (DOM.simulatorCategoryHint) {
      DOM.simulatorCategoryHint.textContent = `Add ${categoryLabel.toLowerCase()} items in CRM Inventory to populate this simulator view.`;
    }
    return;
  }

  const placedLookup = new Map((CRMState.simulatorLayout || []).map((item) => [`${item.type}:${item.id}`, true]));

  DOM.simulatorCatalogEmpty.hidden = true;
  DOM.simulatorItemGrid.hidden = false;
  DOM.simulatorItemGrid.innerHTML = filteredItems.map((item) => {
    const typeLabel = item.typeLabel || getInventoryTypeLabel(item.type);
    const priceText = item.priceText || '—';
    const isPlaced = placedLookup.has(`${item.type}:${item.id}`);
    return `
      <div
        class="simulator-item-card ${isPlaced ? 'is-placed' : ''}"
        data-simulator-item-type="${escapeHtml(item.type)}"
        data-simulator-item-id="${escapeHtml(item.id)}"
        role="button"
        tabindex="0"
        aria-label="Add ${escapeHtml(item.nameTh || item.nameEn || item.id)} to the bracelet"
      >
        <div class="simulator-item-grip" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <img class="simulator-item-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.nameEn || item.nameTh || item.id)}" onerror="this.src='${IMAGE_THUMB_PLACEHOLDER}'">
        <div class="simulator-item-copy">
          <div class="simulator-item-name">${escapeHtml(item.nameTh)}</div>
          <div class="simulator-item-en">${escapeHtml(item.nameEn)}</div>
          <div class="simulator-item-meta-row">
            <span class="simulator-item-badge">${escapeHtml(typeLabel)}</span>
            <span class="simulator-item-size">${escapeHtml(item.sizeText || '—')}</span>
          </div>
          <div class="simulator-item-price">${priceText}</div>
          <div class="simulator-item-placed-note">${isPlaced ? 'Already placed' : 'Tap to add to bracelet'}</div>
        </div>
      </div>
    `;
  }).join('');

  DOM.simulatorItemGrid.querySelectorAll('.simulator-item-card').forEach((card) => {
    const itemType = card.dataset.simulatorItemType || '';
    const itemId = card.dataset.simulatorItemId || '';
    const addItem = () => {
      if (!itemType || !itemId) return;
      if (addSimulatorCatalogItemToLayout(itemType, itemId)) {
        persistAndRenderSimulatorLayout(stones, charms, spacers);
      }
    };
    card.addEventListener('click', addItem);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        addItem();
      }
    });
  });
}

function getCatalogLayoutDraft() {
  if (!CRMState.simulatorLayout || Array.isArray(CRMState.simulatorLayout)) {
    CRMState.simulatorLayout = getCatalogLayoutOrder();
  }
  return CRMState.simulatorLayout;
}

function getCatalogLayoutCategory() {
  return ['stones', 'charms', 'spacers'].includes(CRMState.simulatorCategory)
    ? CRMState.simulatorCategory
    : 'stones';
}

async function loadSimulatorPresetFromStorage({ force = false } = {}) {
  if (CRMState.simulatorLayoutLoaded && !force) {
    return CRMState.simulatorLayout;
  }

  CRMState.simulatorLayout = await refreshCatalogLayoutOrder();
  CRMState.simulatorLayoutLoaded = true;
  return CRMState.simulatorLayout;
}

function getLayoutCatalogItems(stones = [], charms = [], spacers = [], category = getCatalogLayoutCategory()) {
  const itemType = category.slice(0, -1);
  const allItems = buildInventoryItems(stones, charms, spacers).filter((item) => item.type === itemType);
  const draftOrder = getCatalogLayoutDraft();
  return applyCatalogLayoutOrder(allItems, category, (item) => item.id)
    .sort((a, b) => {
      const order = draftOrder[category] || [];
      if (order.length === 0) return 0;
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      const aRank = aIndex >= 0 ? aIndex : Number.MAX_SAFE_INTEGER;
      const bRank = bIndex >= 0 ? bIndex : Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
}

function setCatalogLayoutCategoryOrder(category, items) {
  const draftOrder = getCatalogLayoutDraft();
  draftOrder[category] = items.map((item) => item.id);
  CRMState.simulatorLayout = draftOrder;
}

function moveCatalogLayoutItem(category, itemId, direction, stones = [], charms = [], spacers = []) {
  const items = getLayoutCatalogItems(stones, charms, spacers, category);
  const fromIndex = items.findIndex((item) => item.id === itemId);
  if (fromIndex === -1) return false;
  const toIndex = Math.max(0, Math.min(items.length - 1, fromIndex + direction));
  if (fromIndex === toIndex) return false;
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
  setCatalogLayoutCategoryOrder(category, items);
  return true;
}

function reorderCatalogLayoutByDrop(category, draggedId, targetId, stones = [], charms = [], spacers = []) {
  if (!draggedId || !targetId || draggedId === targetId) return false;
  const items = getLayoutCatalogItems(stones, charms, spacers, category);
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return false;
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
  setCatalogLayoutCategoryOrder(category, items);
  return true;
}

function resetSimulatorLayout() {
  const category = getCatalogLayoutCategory();
  const draftOrder = getCatalogLayoutDraft();
  draftOrder[category] = [];
  CRMState.simulatorLayout = draftOrder;
  resetCatalogLayoutOrder(category);
}

function renderBraceletLayoutSimulator(stones = [], charms = [], spacers = []) {
  const activeCategory = getCatalogLayoutCategory();
  const categoryLabelMap = {
    stones: CRM_COMPONENT_LABELS.stone,
    charms: CRM_COMPONENT_LABELS.charm,
    spacers: CRM_COMPONENT_LABELS.spacer
  };
  const categoryLabel = categoryLabelMap[activeCategory] || 'Stones';
  const items = getLayoutCatalogItems(stones, charms, spacers, activeCategory);

  DOM.simulatorCategoryTabs.forEach((tab) => {
    const isActive = tab.dataset.simulatorCategory === activeCategory;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });

  if (DOM.simulatorCategoryHint) {
    DOM.simulatorCategoryHint.textContent = `Reorder ${categoryLabel.toLowerCase()} for the customer Step 3 catalog.`;
  }

  if (!DOM.simulatorItemGrid || !DOM.simulatorCatalogEmpty) return;

  if (items.length === 0) {
    DOM.simulatorItemGrid.innerHTML = '';
    DOM.simulatorItemGrid.hidden = true;
    DOM.simulatorCatalogEmpty.hidden = false;
    if (DOM.simulatorEmptyTitle) {
      DOM.simulatorEmptyTitle.textContent = `No ${categoryLabel.toLowerCase()} available in the catalog yet.`;
    }
    return;
  }

  DOM.simulatorCatalogEmpty.hidden = true;
  DOM.simulatorItemGrid.hidden = false;
  DOM.simulatorItemGrid.innerHTML = items.map((item) => {
    return `
      <div class="catalog-layout-card" draggable="true" data-layout-item-id="${escapeHtml(item.id)}">
        <img class="catalog-layout-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.nameEn || item.nameTh || item.id)}" onerror="this.src='${IMAGE_THUMB_PLACEHOLDER}'">
        <div class="catalog-layout-copy">
          <div class="catalog-layout-name">${escapeHtml(item.nameTh || item.id)}</div>
        </div>
        <div class="catalog-layout-handle" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
      </div>
    `;
  }).join('');

  let draggedItemId = '';

  DOM.simulatorItemGrid.querySelectorAll('.catalog-layout-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      draggedItemId = card.dataset.layoutItemId || '';
      card.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', draggedItemId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      draggedItemId = '';
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      card.classList.add('is-drop-target');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('is-drop-target');
    });
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('is-drop-target');
      const targetId = card.dataset.layoutItemId || '';
      const sourceId = event.dataTransfer?.getData('text/plain') || draggedItemId;
      if (reorderCatalogLayoutByDrop(activeCategory, sourceId, targetId, stones, charms, spacers)) {
        renderBraceletLayoutSimulator(stones, charms, spacers);
      }
    });
  });

}

function getCategoryScopeLabel(entityType) {
  return entityType === 'charm' ? CRM_COMPONENT_LABELS.charm : CRM_COMPONENT_LABELS.stone;
}

function buildCategoryDisplayLabel(category) {
  const nameTh = category?.nameTh || category?.slug || category?.id || '';
  const nameEn = category?.nameEn || '';
  return nameEn && nameEn !== nameTh ? `${nameTh} / ${nameEn}` : nameTh;
}

function normalizeCategoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function ensureManagedCategorySelect(element, scope) {
  if (!element) return null;

  if (element.tagName === 'SELECT') {
    return element;
  }

  const select = document.createElement('select');
  select.id = element.id;
  select.className = element.className;
  select.required = element.required;
  select.name = element.name;
  select.disabled = element.disabled;
  element.replaceWith(select);

  if (scope === 'charm' || scope === 'stone') {
    DOM[element.id] = select;
  }

  return select;
}

function populateManagedCategorySelect(element, categories = [], scope = 'stone', selectedValue = '') {
  const select = ensureManagedCategorySelect(element, scope);
  if (!select) return;

  const nextSelectedValue = String(selectedValue || '').trim();
  const list = categories
    .filter((category) => category.entityType === scope)
    .slice()
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || buildCategoryDisplayLabel(a).localeCompare(buildCategoryDisplayLabel(b)));

  select.innerHTML = '';

  if (nextSelectedValue && !list.some((category) => category.id === nextSelectedValue)) {
    const missingOption = document.createElement('option');
    missingOption.value = nextSelectedValue;
    missingOption.textContent = `Missing category: ${nextSelectedValue}`;
    select.appendChild(missingOption);
  }

  if (list.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = `No ${scope} categories available`;
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  list.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = `${buildCategoryDisplayLabel(category)}${category.isActive === false ? ' (Inactive)' : ''}`;
    select.appendChild(option);
  });

  const nextValue = nextSelectedValue || select.value || list[0]?.id || '';
  select.value = nextValue || list[0]?.id || '';
}

function syncCategoryAssignmentSelects(categories = [], selectedStoneCategory = '', selectedCharmCategory = '') {
  populateManagedCategorySelect(DOM.crudStoneCategory, categories, 'stone', selectedStoneCategory || DOM.crudStoneCategory?.value);
  populateManagedCategorySelect(DOM.crudCharmCollection, categories, 'charm', selectedCharmCategory || DOM.crudCharmCollection?.value);
}

function getCategoryReferenceCounts(categoryId, stones = [], charms = []) {
  return {
    stoneCount: stones.filter((stone) => (stone.categoryId || stone.category) === categoryId).length,
    charmCount: charms.filter((charm) => (charm.categoryId || charm.collection) === categoryId).length
  };
}

function buildUpdatedCategoryRecord(category, patch = {}) {
  return {
    ...category,
    ...patch
  };
}

async function saveCategoryQuickField(categoryId, patch, logLabel) {
  const categories = await getSharedCategoryCatalog('all');
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) return false;

  const saved = await saveSharedCategoryCatalogEntry(buildUpdatedCategoryRecord(category, patch));
  if (saved) {
    addLog(`${logLabel} '${saved.id}' (${saved.nameTh || saved.nameEn || saved.id}).`);
    await loadDashboardData();
    return true;
  }
  return false;
}

function syncCategoryFilterControls(categories = []) {
  if (DOM.categoriesScopeFilter) {
    DOM.categoriesScopeFilter.value = CRMState.categoryScopeFilter || 'all';
  }
  if (DOM.categoriesStatusFilter) {
    DOM.categoriesStatusFilter.value = CRMState.categoryStatusFilter || 'all';
  }
  if (DOM.categoriesSort) {
    DOM.categoriesSort.value = CRMState.categorySort || 'displayOrder-asc';
  }
}

function renderCategoryCatalog(categories, stones = [], charms = []) {
  const query = DOM.categoriesSearch ? DOM.categoriesSearch.value.trim().toLowerCase() : '';
  const scopeFilter = DOM.categoriesScopeFilter?.value || CRMState.categoryScopeFilter || 'all';
  const statusFilter = DOM.categoriesStatusFilter?.value || CRMState.categoryStatusFilter || 'all';
  const sortMode = DOM.categoriesSort?.value || CRMState.categorySort || 'displayOrder-asc';

  CRMState.categorySearch = query;
  CRMState.categoryScopeFilter = scopeFilter;
  CRMState.categoryStatusFilter = statusFilter;
  CRMState.categorySort = sortMode;

  syncCategoryFilterControls(categories);

  const filtered = categories
    .slice()
    .filter((category) => {
      const haystack = [
        category.id,
        category.slug,
        category.nameTh,
        category.nameEn,
        category.entityType
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
      if (scopeFilter !== 'all' && category.entityType !== scopeFilter) return false;
      const isActive = category.isActive !== false;
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'inactive' && isActive) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'displayOrder-desc') {
        return (Number(b.displayOrder || 0) - Number(a.displayOrder || 0)) || buildCategoryDisplayLabel(a).localeCompare(buildCategoryDisplayLabel(b));
      }
      if (sortMode === 'name-asc') {
        return buildCategoryDisplayLabel(a).localeCompare(buildCategoryDisplayLabel(b)) || (Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
      }
      return (Number(a.displayOrder || 0) - Number(b.displayOrder || 0)) || buildCategoryDisplayLabel(a).localeCompare(buildCategoryDisplayLabel(b));
    });

  DOM.categoriesTableBody.innerHTML = '';

  if (filtered.length === 0) {
    DOM.categoriesTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No matching categories found.</td></tr>';
    return;
  }

  filtered.forEach((category) => {
    const tr = document.createElement('tr');
    const usage = getCategoryReferenceCounts(category.id, stones, charms);
    const isActive = category.isActive !== false;

    tr.innerHTML = `
      <td data-label="Category">
        <div class="category-title-th">${buildCategoryDisplayLabel(category)}</div>
        <div class="category-title-en">ID: ${category.id} • Slug: ${category.slug}</div>
      </td>
      <td data-label="Scope">
        <span class="badge category-scope-badge badge-${category.entityType}">${getCategoryScopeLabel(category.entityType)}</span>
      </td>
      <td data-label="Display Order">
        <input type="number" class="category-inline-input category-order-input" data-category-id="${category.id}" min="0" step="10" value="${Number(category.displayOrder || 0)}">
      </td>
      <td data-label="Status">
        <label class="category-toggle-label">
          <input type="checkbox" class="category-toggle-input" data-category-id="${category.id}" data-field="isActive" ${isActive ? 'checked' : ''}>
          ${isActive ? 'Active' : 'Inactive'}
        </label>
      </td>
      <td data-label="Usage">
        <div class="category-usage-stack">
          <span>Stones: ${usage.stoneCount}</span>
          <span>${CRM_COMPONENT_LABELS.charm}: ${usage.charmCount}</span>
        </div>
      </td>
      <td data-label="Actions" class="text-right">
        <div class="action-btns">
          <button class="action-btn edit" data-id="${category.id}" title="Edit Category">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${category.id}" title="Delete Category">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.action-btn.edit').addEventListener('click', () => openEditCategoryForm(category.id));
    tr.querySelector('.action-btn.delete').addEventListener('click', () => deleteCategoryType(category.id));
    DOM.categoriesTableBody.appendChild(tr);
  });
}

async function openAddCategoryForm() {
  CRMState.activeEditCategoryId = null;
  DOM.categoryModalTitle.textContent = 'Add New Category';
  DOM.categoryCrudForm.reset();
  DOM.crudCategoryRecordId.value = '';
  DOM.crudCategoryId.disabled = false;
  DOM.crudCategoryId.readOnly = false;
  DOM.crudCategoryId.value = '';
  DOM.crudCategorySlug.value = '';
  DOM.crudCategoryEntityType.value = 'stone';
  DOM.crudCategoryIsActive.checked = true;
  const categories = await getSharedCategoryCatalog('all');
  const nextOrder = categories.reduce((maxOrder, category) => Math.max(maxOrder, Number(category.displayOrder || 0)), 0) + 10;
  DOM.crudCategoryDisplayOrder.value = String(nextOrder);
  DOM.categoryCrudModal.classList.add('show');
}

async function openEditCategoryForm(categoryId) {
  const categories = await getSharedCategoryCatalog('all');
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) return;

  CRMState.activeEditCategoryId = categoryId;
  DOM.categoryModalTitle.textContent = `Edit Category: ${buildCategoryDisplayLabel(category)}`;
  DOM.crudCategoryRecordId.value = category.id;
  DOM.crudCategoryEntityType.value = category.entityType || 'stone';
  DOM.crudCategoryId.value = category.id;
  DOM.crudCategoryId.readOnly = true;
  DOM.crudCategorySlug.value = category.slug || category.id;
  DOM.crudCategoryDisplayOrder.value = Number(category.displayOrder || 0);
  DOM.crudCategoryNameEn.value = category.nameEn || '';
  DOM.crudCategoryNameTh.value = category.nameTh || '';
  DOM.crudCategoryIsActive.checked = category.isActive !== false;
  DOM.categoryCrudModal.classList.add('show');
}

function closeCategoryForm() {
  DOM.categoryCrudModal.classList.remove('show');
}

async function handleSaveCategoryType(e) {
  e.preventDefault();

  const currentCategories = await getSharedCategoryCatalog('all');
  const existingCategory = CRMState.activeEditCategoryId
    ? currentCategories.find((entry) => entry.id === CRMState.activeEditCategoryId)
    : null;

  const recordId = normalizeCategoryKey(DOM.crudCategoryId.value.trim() || DOM.crudCategoryRecordId.value.trim());
  if (!recordId) {
    alert('Please enter a valid category ID.');
    return;
  }

  const slug = normalizeCategoryKey(DOM.crudCategorySlug.value.trim() || recordId);
  const categoryRecord = {
    id: recordId,
    entityType: DOM.crudCategoryEntityType.value.trim() || 'stone',
    slug,
    nameEn: DOM.crudCategoryNameEn.value.trim(),
    nameTh: DOM.crudCategoryNameTh.value.trim(),
    displayOrder: Number(DOM.crudCategoryDisplayOrder.value || 0),
    isActive: DOM.crudCategoryIsActive.checked
  };

  const saved = await saveSharedCategoryCatalogEntry(categoryRecord);
  if (saved) {
    if (existingCategory) {
      addLog(`Edited category '${saved.id}' (${saved.nameTh || saved.nameEn || saved.id}).`);
      showToast('Category updated!');
    } else {
      addLog(`Created category '${saved.id}' (${saved.nameTh || saved.nameEn || saved.id}).`);
      showToast('New category added!');
    }
  }

  closeCategoryForm();
  await loadDashboardData();
}

async function deleteCategoryType(categoryId) {
  const categories = await getSharedCategoryCatalog('all');
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) return;

  const stones = await getSharedCatalog();
  const charms = await getSharedCharmCatalog();
  const usage = getCategoryReferenceCounts(categoryId, stones, charms);
  if (usage.stoneCount > 0 || usage.charmCount > 0) {
    alert(`Category '${categoryId}' is still used by catalog items. Reassign those items before deleting this category.`);
    return;
  }

  const proceed = await showCustomConfirm(
    `Are you sure you want to delete category '${buildCategoryDisplayLabel(category)}'?`,
    'Delete Category'
  );

  if (proceed) {
    const success = await deleteSharedCategoryCatalogEntry(categoryId);
    if (success) {
      addLog(`Deleted category '${categoryId}' (${category.nameTh || category.nameEn || category.id}).`, 'warn');
      showToast('Category deleted.');
      await loadDashboardData();
    }
  }
}

function formatCharmStatusBadge(label, isActiveState) {
  return isActiveState
    ? `<span class="badge badge-in-stock">${label}</span>`
    : `<span class="badge badge-out-of-stock">${label}</span>`;
}

function buildUpdatedCharmRecord(charm, patch = {}) {
  return {
    ...charm,
    ...patch,
    name: {
      ...(charm.name || {}),
      ...(patch.name || {})
    },
    image: {
      ...(charm.image || {}),
      ...(patch.image || {})
    },
    pricing: {
      ...(charm.pricing || {}),
      ...(patch.pricing || {})
    },
    business: {
      ...(charm.business || {}),
      ...(patch.business || {})
    },
    meaning: {
      ...(charm.meaning || {}),
      ...(patch.meaning || {})
    },
    availability: {
      ...(charm.availability || {}),
      ...(patch.availability || {})
    },
    renderTuning: charm.renderTuning || {},
    displayOrder: patch.displayOrder !== undefined ? patch.displayOrder : (charm.displayOrder ?? 0)
  };
}

function getCharmAdminCollections(charms = []) {
  return [...new Set(
    charms
      .map((charm) => charm?.collection)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function syncCharmCollectionFilterOptions(categories = [], charms = []) {
  if (!DOM.charmsCollectionFilter) return;

  const currentValue = DOM.charmsCollectionFilter.value || CRMState.charmCollectionFilter || 'all';
  const collections = categories
    .filter((category) => category.entityType === 'charm')
    .slice()
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || buildCategoryDisplayLabel(a).localeCompare(buildCategoryDisplayLabel(b)))
    .map((category) => ({
      value: category.id,
      label: `${buildCategoryDisplayLabel(category)}${category.isActive === false ? ' (Inactive)' : ''}`
    }));

  DOM.charmsCollectionFilter.innerHTML = `
    <option value="all">All Collections</option>
    ${
      collections.length > 0
        ? collections.map((collection) => `<option value="${collection.value}">${collection.label}</option>`).join('')
        : getCharmAdminCollections(charms).map((collection) => `<option value="${collection}">${collection}</option>`).join('')
    }
  `;

  const hasCurrent = collections.some((collection) => collection.value === currentValue);
  if (!hasCurrent && currentValue !== 'all' && currentValue) {
    const missingOption = document.createElement('option');
    missingOption.value = currentValue;
    missingOption.textContent = `Missing collection: ${currentValue}`;
    DOM.charmsCollectionFilter.appendChild(missingOption);
  }

  DOM.charmsCollectionFilter.value = hasCurrent || currentValue === 'all'
    ? currentValue
    : (currentValue || 'all');
  CRMState.charmCollectionFilter = DOM.charmsCollectionFilter.value;
}

function setReadOnlyCharmTuning(tuning = {}) {
  DOM.roCharmVisualScale.textContent = tuning.visualScale ?? '-';
  DOM.roCharmVisualOffsetX.textContent = tuning.visualOffsetX ?? '-';
  DOM.roCharmVisualOffsetY.textContent = tuning.visualOffsetY ?? '-';
  DOM.roCharmMaxWidthRatio.textContent = tuning.maxWidthRatio ?? '-';
  DOM.roCharmMaxHeightRatio.textContent = tuning.maxHeightRatio ?? '-';
  DOM.roCharmRotation.textContent = tuning.rotation ?? '-';
  DOM.roCharmAnchor.textContent = tuning.anchor ?? '-';
  DOM.roCharmEdgeFitMode.textContent = tuning.edgeFitMode ?? '-';
  DOM.roCharmTargetWidthFillRatio.textContent = tuning.targetWidthFillRatio ?? '-';
  DOM.roCharmContactInsetLeft.textContent = tuning.contactInsetLeft ?? '-';
  DOM.roCharmContactInsetRight.textContent = tuning.contactInsetRight ?? '-';
}

async function saveCharmQuickField(charmId, patch, logLabel) {
  const charms = await getSharedCharmCatalog();
  const charm = charms.find((entry) => entry.id === charmId);
  if (!charm) return false;

  const saved = await saveSharedCharmCatalogEntry(buildUpdatedCharmRecord(charm, patch));
  if (saved) {
    addLog(`${logLabel} '${saved.id}' (${saved.name?.th || saved.name?.en || saved.id}).`);
    await loadDashboardData();
    return true;
  }
  return false;
}

async function saveInventoryStockQty(itemType, itemId, stockQty) {
  const normalizedType = String(itemType || '').trim().toLowerCase();
  const normalizedQty = normalizeStockQtyForCrm(stockQty, 0);
  const inStock = normalizedQty > 0;

  if (normalizedType === 'stone') {
    const stones = await getSharedCatalog();
    const stone = stones.find((entry) => entry.id === itemId);
    if (!stone) return false;
    const saved = await saveSharedCatalog({
      ...stone,
      stockQty: normalizedQty,
      inStock
    });
    if (saved) {
      addLog(`Updated stone stock '${itemId}' to ${normalizedQty}.`);
      await loadDashboardData();
      return true;
    }
    return false;
  }

  if (normalizedType === 'charm') {
    const charms = await getSharedCharmCatalog();
    const charm = charms.find((entry) => entry.id === itemId);
    if (!charm) return false;
    const saved = await saveSharedCharmCatalogEntry(buildUpdatedCharmRecord(charm, {
      availability: {
        stockQty: normalizedQty,
        inStock
      }
    }));
    if (saved) {
      addLog(`Updated talisman stock '${itemId}' to ${normalizedQty}.`);
      await loadDashboardData();
      return true;
    }
    return false;
  }

  if (normalizedType === 'spacer') {
    const spacers = await getSharedSpacerCatalog();
    const spacer = spacers.find((entry) => entry.id === itemId);
    if (!spacer) return false;
    const saved = await saveSharedSpacerCatalogEntry({
      ...spacer,
      availability: {
        ...(spacer.availability || {}),
        stockQty: normalizedQty,
        inStock
      }
    });
    if (saved) {
      addLog(`Updated charm stock '${itemId}' to ${normalizedQty}.`);
      await loadDashboardData();
      return true;
    }
  }

  return false;
}

function formatCharmTuningSummary(charm) {
  const tuning = charm.renderTuning || {};
  const chips = [
    `Scale ${tuning.visualScale ?? '-'}`,
    `Offset ${tuning.visualOffsetX ?? 0}, ${tuning.visualOffsetY ?? 0}`,
    `Max ${tuning.maxWidthRatio ?? '-'} / ${tuning.maxHeightRatio ?? '-'}`,
    `Rotate ${tuning.rotation ?? 0}°`,
    `Anchor ${tuning.anchor || '-'}`
  ];

  if (tuning.edgeFitMode) {
    chips.push(`Fit ${tuning.edgeFitMode}`);
  }
  if (tuning.targetWidthFillRatio !== undefined) {
    chips.push(`Fill ${tuning.targetWidthFillRatio}`);
  }
  if (tuning.contactInsetLeft !== undefined || tuning.contactInsetRight !== undefined) {
    chips.push(`Contact ${tuning.contactInsetLeft ?? 0} / ${tuning.contactInsetRight ?? 0}`);
  }

  return chips.map((chip) => `<span class="tuning-chip">${chip}</span>`).join('');
}

function renderCharmCatalog(charms, categories = []) {
  const query = DOM.charmsSearch.value.trim().toLowerCase();
  syncCharmCollectionFilterOptions(categories, charms);

  const sortMode = DOM.charmsSort?.value || CRMState.charmSort || 'displayOrder-asc';
  const activeFilter = DOM.charmsActiveFilter?.value || CRMState.charmActiveFilter || 'all';
  const stockFilter = DOM.charmsStockFilter?.value || CRMState.charmStockFilter || 'all';
  const collectionFilter = DOM.charmsCollectionFilter?.value || CRMState.charmCollectionFilter || 'all';

  CRMState.charmSort = sortMode;
  CRMState.charmActiveFilter = activeFilter;
  CRMState.charmStockFilter = stockFilter;
  CRMState.charmCollectionFilter = collectionFilter;

  const filtered = charms
    .slice()
    .filter((charm) => {
      const haystack = [
        charm.id,
        charm.sku,
        charm.name?.th,
        charm.name?.en,
        charm.type,
        charm.collection,
        charm.displayOrder
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;

      const isActive = charm.availability?.isActive !== false;
      const isInStock = isCrmItemInStock(charm);
      if (activeFilter === 'active' && !isActive) return false;
      if (activeFilter === 'inactive' && isActive) return false;
      if (stockFilter === 'in' && !isInStock) return false;
      if (stockFilter === 'out' && isInStock) return false;
      if (collectionFilter !== 'all' && (charm.collection || charm.categoryId || '') !== collectionFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'name-asc') {
        return (a.name?.th || a.name?.en || a.id || '').localeCompare(b.name?.th || b.name?.en || b.id || '');
      }
      if (sortMode === 'price-desc') {
        return (Number(b.pricing?.base || 0) - Number(a.pricing?.base || 0)) || ((a.displayOrder || 0) - (b.displayOrder || 0));
      }
      if (sortMode === 'displayOrder-desc') {
        return (b.displayOrder || 0) - (a.displayOrder || 0) || (a.id || '').localeCompare(b.id || '');
      }
      return (a.displayOrder || 0) - (b.displayOrder || 0) || (a.id || '').localeCompare(b.id || '');
    });

  DOM.charmsTableBody.innerHTML = '';
  if (filtered.length === 0) {
    DOM.charmsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No matching talismans found.</td></tr>';
    return;
  }

  filtered.forEach((charm) => {
    const imageSrc = withCatalogImageVersion(charm.image?.primary || '', charm);
    const sizeCm = Number(charm.business?.sizeCm || 0);
    const price = Number(charm.pricing?.base || 0);
    const stockQty = getCrmStockQty(charm);
    const isInStock = isCrmItemInStock(charm);
    const isActive = charm.availability?.isActive !== false;
    const categoryLabel = getCategoryLabelById(charm.collection || charm.categoryId, 'charm');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Image">
        <img class="table-bead-img charm-admin-img" src="${imageSrc}" alt="${charm.name?.en || charm.id}" onerror="this.src='${IMAGE_THUMB_PLACEHOLDER}'">
      </td>
      <td data-label="${CRM_COMPONENT_LABELS.charm}">
        <div class="stone-title-th">${charm.name?.th || '-'}</div>
        <div class="stone-title-en">${charm.name?.en || '-'}</div>
        <div class="charm-meta-stack">
          <span>ID: <strong>${charm.id}</strong></span>
          <span>SKU: <strong>${charm.sku || '-'}</strong></span>
          <span>Type: <strong>${charm.type || '-'}</strong></span>
          <span>Collection: <strong>${categoryLabel.th || charm.collection || '-'}</strong></span>
        </div>
      </td>
      <td data-label="Business">
        <div class="charm-business-stack">
          <span>Size: <strong>${sizeCm ? `${sizeCm.toFixed(1)} cm` : '-'}</strong></span>
          <span>Price: <strong>฿${price.toLocaleString()}</strong></span>
          <label class="charm-inline-field">
            <span>Order</span>
            <input
              type="number"
              class="charm-inline-input charm-order-input"
              data-charm-id="${charm.id}"
              value="${charm.displayOrder ?? 0}"
              min="0"
              step="10"
              aria-label="Display order for ${charm.id}"
            >
          </label>
        </div>
      </td>
      <td data-label="Visibility">
        <div class="charm-status-stack">
          <label class="charm-toggle-label">
            <input type="checkbox" class="charm-toggle-input" data-charm-id="${charm.id}" data-field="isActive" ${isActive ? 'checked' : ''}>
            Visible
          </label>
          ${formatCharmStatusBadge(isActive ? 'Visible' : 'Hidden', isActive)}
        </div>
      </td>
      <td data-label="Stock">
        <div class="charm-status-stack">
          <label class="charm-toggle-label">
            <input type="checkbox" class="charm-toggle-input" data-charm-id="${charm.id}" data-field="inStock" ${isInStock ? 'checked' : ''}>
            In Stock
          </label>
          <label class="charm-inline-field">
            <span>Qty</span>
            <input
              type="number"
              class="charm-inline-input charm-stock-input"
              data-charm-id="${charm.id}"
              value="${stockQty ?? ''}"
              min="0"
              step="1"
              aria-label="Stock quantity for ${charm.id}"
            >
          </label>
          ${formatCharmStatusBadge(isInStock ? 'In Stock' : 'Out of Stock', isInStock)}
        </div>
      </td>
      <td data-label="Render Tuning Summary">
        <div class="tuning-chip-row">${formatCharmTuningSummary(charm)}</div>
      </td>
      <td data-label="Actions">
        <div class="action-btns charm-action-btns">
          <button class="action-btn edit" data-id="${charm.id}" title="Edit Talisman business fields">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${charm.id}" title="Delete Talisman">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.action-btn.edit').addEventListener('click', () => openEditCharmForm(charm.id));
    tr.querySelector('.action-btn.delete').addEventListener('click', () => deleteCharmType(charm.id));
    DOM.charmsTableBody.appendChild(tr);
  });
}

async function openAddCharmForm() {
  CRMState.activeEditCharmId = null;
  DOM.charmModalTitle.textContent = "Add New Talisman";
  DOM.charmCrudForm.reset();
  DOM.crudCharmRecordId.value = "";
  DOM.crudCharmId.disabled = false;
  DOM.crudCharmInStock.checked = true;
  DOM.crudCharmIsActive.checked = true;
  DOM.crudCharmStockQty.value = "1";
  const charms = await getSharedCharmCatalog();
  const nextOrder = charms.reduce((maxOrder, charm) => Math.max(maxOrder, Number(charm.displayOrder || 0)), 0) + 10;
  DOM.crudCharmDisplayOrder.value = String(nextOrder);
  const categories = await getSharedCategoryCatalog('all');
  syncCategoryAssignmentSelects(categories);
  DOM.crudCharmCollection.value = DOM.crudCharmCollection.value || 'pixiu';
  setReadOnlyCharmTuning({});
  resetImageUploadState("Charm");
  updateImagePreview(DOM.crudCharmImagePreview, DOM.crudCharmImage.value);
  DOM.charmCrudModal.classList.add('show');
}

async function openEditCharmForm(charmId) {
  const cachedCharms = getSimulatorCatalogCache().charms;
  const charms = cachedCharms.length > 0 ? cachedCharms : await getSharedCharmCatalog();
  const charm = charms.find((entry) => entry.id === charmId);
  if (!charm) return;

  const categories = await getSharedCategoryCatalog('all');
  syncCategoryAssignmentSelects(categories, '', charm.collection || charm.categoryId);

  CRMState.activeEditCharmId = charmId;
  DOM.charmModalTitle.textContent = `Edit Talisman: ${charm.name?.th || charm.id}`;
  DOM.crudCharmRecordId.value = charm.id;
  DOM.crudCharmId.value = charm.id;
  DOM.crudCharmId.disabled = true;
  DOM.crudCharmSku.value = charm.sku || "";
  DOM.crudCharmNameEn.value = charm.name?.en || "";
  DOM.crudCharmNameTh.value = charm.name?.th || "";
  DOM.crudCharmType.value = charm.type || "";
  DOM.crudCharmCollection.value = charm.collection || charm.categoryId || "";
  DOM.crudCharmImage.value = charm.image?.primary || "";
  resetImageUploadState("Charm");
  updateImagePreview(DOM.crudCharmImagePreview, DOM.crudCharmImage.value);
  DOM.crudCharmSizeCm.value = Number(charm.business?.sizeCm || 0);
  DOM.crudCharmPrice.value = Number(charm.pricing?.base || 0);
  DOM.crudCharmDisplayOrder.value = charm.displayOrder ?? "";
  DOM.crudCharmStockQty.value = getCrmStockQty(charm) ?? "";
  DOM.crudCharmMeaningTh.value = charm.meaning?.th || "";
  DOM.crudCharmMeaningEn.value = charm.meaning?.en || "";
  DOM.crudCharmInStock.checked = isCrmItemInStock(charm);
  DOM.crudCharmIsActive.checked = charm.availability?.isActive !== false;
  setReadOnlyCharmTuning(charm.renderTuning || {});
  DOM.charmCrudModal.classList.add('show');
}

function closeCharmForm() {
  DOM.charmCrudModal.classList.remove('show');
  resetImageUploadState("Charm");
}

async function handleSaveCharmType(e) {
  e.preventDefault();

  const currentCharms = await getSharedCharmCatalog();
  const existingCharm = CRMState.activeEditCharmId
    ? currentCharms.find((entry) => entry.id === CRMState.activeEditCharmId)
    : null;

  const sizeCm = Number(DOM.crudCharmSizeCm.value);
  const stockQty = normalizeStockQtyForCrm(DOM.crudCharmStockQty.value, 0);
  const recordId = DOM.crudCharmRecordId.value.trim() || DOM.crudCharmId.value.trim();
  const normalizedRecord = {
    id: DOM.crudCharmId.value.trim(),
    entityType: "charm",
    sku: DOM.crudCharmSku.value.trim(),
    slug: recordId.toLowerCase(),
    name: {
      en: DOM.crudCharmNameEn.value.trim(),
      th: DOM.crudCharmNameTh.value.trim()
    },
    categoryId: DOM.crudCharmCollection.value.trim() || DOM.crudCharmType.value.trim() || "charms",
    type: DOM.crudCharmType.value.trim(),
    collection: DOM.crudCharmCollection.value.trim(),
    image: {
      primary: DOM.crudCharmImage.value.trim()
    },
    pricing: {
      base: Number(DOM.crudCharmPrice.value || 0)
    },
    business: {
      sizeCm,
      footprintMm: existingCharm?.business?.footprintMm ?? Math.round(sizeCm * 10)
    },
    meaning: {
      th: DOM.crudCharmMeaningTh.value.trim(),
      en: DOM.crudCharmMeaningEn.value.trim()
    },
    availability: {
      stockQty,
      inStock: DOM.crudCharmInStock.checked && stockQty > 0,
      isActive: DOM.crudCharmIsActive.checked
    },
    renderTuning: existingCharm?.renderTuning || {},
    displayOrder: Number(DOM.crudCharmDisplayOrder.value || 0)
  };

  const saved = await saveSharedCharmCatalogEntry(normalizedRecord);
  if (saved) {
    if (CRMState.activeEditCharmId) {
      addLog(`Edited talisman ID '${saved.id}' (${saved.name?.th || saved.name?.en}).`);
      showToast("Talisman details updated!");
    } else {
      addLog(`Created new talisman ID '${saved.id}' (${saved.name?.th || saved.name?.en}).`);
      showToast("New talisman added to catalog!");
    }
  }

  closeCharmForm();
  await loadDashboardData();
}

async function deleteCharmType(charmId) {
  const cachedCharms = getSimulatorCatalogCache().charms;
  const charms = cachedCharms.length > 0 ? cachedCharms : await getSharedCharmCatalog();
  const charm = charms.find((entry) => entry.id === charmId);
  if (!charm) return;

  const proceed = await showCustomConfirm(
    `Are you sure you want to delete '${charm.name?.th || charm.id} (${charm.sku || charm.id})' from the talisman catalog?`,
    "Delete Talisman"
  );

  if (proceed) {
    const success = await deleteSharedCharmCatalogEntry(charmId);
    if (success) {
      addLog(`Deleted talisman ID '${charmId}' (${charm.name?.th || charm.name?.en}).`, 'warn');
      showToast("Talisman deleted.");
      await loadDashboardData();
    }
  }
}

// Form Opening & Resetting
async function openAddStoneForm() {
  CRMState.activeEditStoneId = null;
  CRMState.activeEditStoneIsActive = true;
  CRMState.activeEditStoneColor = '#E2C974';
  DOM.stoneModalTitle.textContent = "Add New Stone Type";
  DOM.crudStoneId.value = "";
  DOM.stoneCrudForm.reset();
  DOM.crudStoneInStock.checked = true;
  DOM.crudStoneStockQty.value = "1";
  DOM.crudStonePriceP4.value = "";
  DOM.crudStonePriceP6.value = "";
  DOM.crudStonePriceP8.value = "";
  
  // Set all size checkboxes checked
  document.querySelectorAll('.crud-size-chk').forEach(c => c.checked = true);
  const categories = await getSharedCategoryCatalog('all');
  syncCategoryAssignmentSelects(categories);
  DOM.crudStoneCategory.value = DOM.crudStoneCategory.value || 'wealth';
  DOM.crudStoneImage.value = DOM.crudStoneImage.value || 'assets/golden_rutile.png';
  resetImageUploadState("Stone");
  updateImagePreview(DOM.crudStoneImagePreview, DOM.crudStoneImage.value);
  
  DOM.stoneCrudModal.classList.add('show');
}

async function openEditStoneForm(stoneId) {
  const cachedStones = getSimulatorCatalogCache().stones;
  const stones = cachedStones.length > 0 ? cachedStones : await getSharedCatalog();
  const stone = stones.find(s => s.id === stoneId);
  if (!stone) return;

  const categories = await getSharedCategoryCatalog('all');
  syncCategoryAssignmentSelects(categories, stone.categoryId || stone.category);
  
  CRMState.activeEditStoneId = stoneId;
  CRMState.activeEditStoneIsActive = stone.isActive !== false;
  CRMState.activeEditStoneColor = stone.color || '#E2C974';
  DOM.stoneModalTitle.textContent = `Edit Details: ${stone.nameTh}`;
  DOM.crudStoneId.value = stone.id;
  
  DOM.crudStoneNameEn.value = stone.name;
  DOM.crudStoneNameTh.value = stone.nameTh;
  DOM.crudStonePriceP4.value = stone.p4 !== undefined ? stone.p4 : stone.price || 0;
  DOM.crudStonePriceP6.value = stone.p6 !== undefined ? stone.p6 : stone.price || 0;
  DOM.crudStonePriceP8.value = stone.p8 !== undefined ? stone.p8 : stone.price || 0;
  DOM.crudStoneCategory.value = stone.categoryId || stone.category;
  DOM.crudStoneImage.value = stone.image;
  resetImageUploadState("Stone");
  updateImagePreview(DOM.crudStoneImagePreview, DOM.crudStoneImage.value);
  DOM.crudStoneInStock.checked = isCrmItemInStock(stone);
  DOM.crudStoneStockQty.value = getCrmStockQty(stone) ?? "";
  DOM.crudStoneMeaningTh.value = stone.meaningTh;
  DOM.crudStoneMeaningEn.value = stone.meaning;
  
  // Check checkboxes matching size lists
  document.querySelectorAll('.crud-size-chk').forEach(chk => {
    const size = parseInt(chk.value);
    chk.checked = (stone.sizes || []).includes(size);
  });
  
  DOM.stoneCrudModal.classList.add('show');
}

function closeStoneForm() {
  DOM.stoneCrudModal.classList.remove('show');
  CRMState.activeEditStoneColor = '#E2C974';
  resetImageUploadState("Stone");
}

async function handleSaveStoneType(e) {
  e.preventDefault();
  
  const idVal = DOM.crudStoneId.value || "stone-" + Math.floor(1000 + Math.random() * 9000);
  const nameEn = DOM.crudStoneNameEn.value.trim();
  const nameTh = DOM.crudStoneNameTh.value.trim();
  const p4 = parseInt(DOM.crudStonePriceP4.value);
  const p6 = parseInt(DOM.crudStonePriceP6.value);
  const p8 = parseInt(DOM.crudStonePriceP8.value);
  const category = DOM.crudStoneCategory.value;
  const image = DOM.crudStoneImage.value.trim();
  const color = CRMState.activeEditStoneColor || '#E2C974';
  const stockQty = normalizeStockQtyForCrm(DOM.crudStoneStockQty.value, 0);
  const inStock = DOM.crudStoneInStock.checked && stockQty > 0;
  const meaningTh = DOM.crudStoneMeaningTh.value.trim();
  const meaningEn = DOM.crudStoneMeaningEn.value.trim();
  
  // Extract checked sizes
  const sizes = [];
  document.querySelectorAll('.crud-size-chk:checked').forEach(chk => {
    sizes.push(parseInt(chk.value));
  });
  
  if (sizes.length === 0) {
    alert("Please select at least one available bead size.");
    return;
  }
  
  const record = {
    id: idVal,
    name: nameEn,
    nameTh: nameTh,
    p4: p4,
    p6: p6,
    p8: p8,
    category: category,
    categoryId: category,
    image: image,
    color: color,
    sizes: sizes,
    stockQty: stockQty,
    inStock: inStock,
    isActive: CRMState.activeEditStoneId ? CRMState.activeEditStoneIsActive : true,
    meaning: meaningEn,
    meaningTh: meaningTh
  };
  
  const saved = await saveSharedCatalog(record);
  if (saved) {
    if (CRMState.activeEditStoneId) {
      addLog(`Edited stone ID '${idVal}' (${nameTh}).`);
      showToast("Stone details updated!");
    } else {
      addLog(`Created new stone ID '${idVal}' (${nameTh}).`);
      showToast("New stone added to inventory!");
    }
  }
  
  closeStoneForm();
  await loadDashboardData();
}

async function deleteStoneType(stoneId) {
  const cachedStones = getSimulatorCatalogCache().stones;
  const stones = cachedStones.length > 0 ? cachedStones : await getSharedCatalog();
  const stone = stones.find(s => s.id === stoneId);
  if (!stone) return;
  
  const proceed = await showCustomConfirm(
    `Are you sure you want to delete '${stone.nameTh} (${stone.name})' from the catalog? This action will immediately remove it from the customer customizer view.`,
    "Delete Stone Type"
  );
  if (proceed) {
    const result = await deleteSharedCatalog(stoneId);
    if (result?.success) {
      addLog(`Deleted stone ID '${stoneId}' (${stone.nameTh}) from inventory.`, 'warn');
      showToast("Stone type deleted.");
      await loadDashboardData();
    } else {
      const errorMessage = result?.error || `Failed to delete stone ID '${stoneId}'.`;
      addLog(`Failed to delete stone ID '${stoneId}' (${stone.nameTh}): ${errorMessage}`, 'error');
      showToast(`Delete failed: ${errorMessage}`);
    }
  }
}

// ==========================================
// 9. Tab 3: Order Management System (OMS)
// ==========================================
const ORDER_SHIPPING_CARRIERS = Object.freeze([
  { value: "", label: "-" },
  { value: "Flash", label: "Flash" },
  { value: "Kerry", label: "Kerry" },
  { value: "Shopee Express", label: "Shopee Express" },
  { value: "ไปรษณีย์ไทย", label: "ไปรษณีย์ไทย" },
  { value: "Other", label: "อื่นๆ" }
]);

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeOrderShippingFields(order = {}) {
  const trackingNumber = String(order?.trackingNumber || order?.trackingNo || order?.shippingTrackingNumber || order?.shipmentTrackingNumber || '').trim();
  const rawCarrier = String(order?.shippingCarrier || '').trim();
  const knownCarrier = ORDER_SHIPPING_CARRIERS.some((option) => option.value && option.value === rawCarrier);
  const isOther = rawCarrier === 'Other' || rawCarrier === 'อื่นๆ';
  const shippingCarrierCustom = String(order?.shippingCarrierCustom || '').trim();

  if (knownCarrier) {
    return {
      trackingNumber,
      shippingCarrier: rawCarrier,
      shippingCarrierCustom: rawCarrier === 'Other' ? shippingCarrierCustom : ''
    };
  }

  if (isOther) {
    return {
      trackingNumber,
      shippingCarrier: 'Other',
      shippingCarrierCustom
    };
  }

  if (rawCarrier) {
    return {
      trackingNumber,
      shippingCarrier: 'Other',
      shippingCarrierCustom: shippingCarrierCustom || rawCarrier
    };
  }

  return {
    trackingNumber,
    shippingCarrier: '',
    shippingCarrierCustom: shippingCarrierCustom || ''
  };
}

function getOrderShippingCarrierDisplay(order = {}) {
  const shippingFields = normalizeOrderShippingFields(order);
  if (shippingFields.shippingCarrier === 'Other') {
    return shippingFields.shippingCarrierCustom;
  }
  return shippingFields.shippingCarrier;
}

function buildOrderCarrierOptionsHtml(selectedValue = '') {
  return ORDER_SHIPPING_CARRIERS.map((option) => `
    <option value="${escapeHtml(option.value)}" ${selectedValue === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
}

function formatNotificationTimestamp(timestamp) {
  if (!timestamp) return '';

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDetailDateTime(value) {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDetailMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return `฿${amount.toLocaleString()} THB`;
}

function detailValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized ? escapeHtml(normalized) : '&mdash;';
}

function getOrderSubtotal(order = {}) {
  const candidate = [order.checkoutSummary?.subtotal, order.subtotal]
    .find((value) => Number.isFinite(Number(value)));
  return candidate == null ? 0 : Number(candidate);
}

function getOrderDiscountAmount(order = {}) {
  const candidate = [order.checkoutSummary?.discountAmount, order.discountAmount]
    .find((value) => Number.isFinite(Number(value)));
  return candidate == null ? 0 : Number(candidate);
}

function getOrderDiscountPercent(order = {}) {
  const candidate = [order.checkoutSummary?.discountPercent, order.discountPercent]
    .find((value) => Number.isFinite(Number(value)));
  return candidate == null ? 20 : Number(candidate);
}

function getOrderFinalPrice(order = {}) {
  const candidate = [
    order.checkoutSummary?.finalPrice,
    order.checkoutSummary?.totalPrice,
    order.finalPrice,
    order.totalPrice,
    order.netPrice
  ].find((value) => Number.isFinite(Number(value)));
  return candidate == null ? 0 : Number(candidate);
}

function getOrderItemizedBilling(order = {}) {
  return Array.isArray(order.itemizedBilling) ? order.itemizedBilling : [];
}

function getOrderSavedBraceletPreviewImage(order = {}) {
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

function getOrderBraceletSequence(order = {}) {
  if (Array.isArray(order.checkoutSummary?.braceletSequence) && order.checkoutSummary.braceletSequence.length > 0) {
    return order.checkoutSummary.braceletSequence;
  }
  if (Array.isArray(order.braceletSequence) && order.braceletSequence.length > 0) {
    return order.braceletSequence;
  }
  if (Array.isArray(order.checkoutSummary?.itemizedBilling) && order.checkoutSummary.itemizedBilling.length > 0) {
    return order.checkoutSummary.itemizedBilling;
  }
  if (Array.isArray(order.itemizedBilling) && order.itemizedBilling.length > 0) {
    return order.itemizedBilling;
  }
  if (Array.isArray(order.beadMap) && order.beadMap.length > 0) {
    return order.beadMap;
  }
  return Array.isArray(order.beads)
    ? order.beads.map((bead) => ({ ...bead, type: 'stone', componentType: 'stone' }))
    : [];
}

function getCrmCatalogEntryById(collection = [], id = '') {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return null;
  return collection.find((entry) => String(entry?.id || entry?.sku || '').trim() === normalizedId) || null;
}

function getCrmCharmCatalogEntry(charmId = '') {
  const charms = CRMState.simulatorCatalogCache?.charms || [];
  return getCrmCatalogEntryById(charms, charmId);
}

function getCrmSpacerCatalogEntry(spacerId = '') {
  const spacers = CRMState.simulatorCatalogCache?.spacers || [];
  return getCrmCatalogEntryById(spacers, spacerId);
}

function getNestedImageValue(source = {}) {
  return source.image?.primary || source.image || source.imageUrl || source.imageSrc || source.thumbnail || source.icon || '';
}

function getNestedNameValue(source = {}, locale = 'en') {
  return source.name?.[locale] || (locale === 'th' ? source.nameTh : source.nameEn) || source.name || '';
}

function getOrderBraceletItemType(item = {}) {
  const rawType = String(item.componentType || item.type || item.category || '').toLowerCase();
  if (rawType.includes('charm')) return 'charm';
  if (rawType.includes('spacer')) return 'spacer';
  return 'stone';
}

function isOrderSlotPlaceableCharmType(charmType) {
  return String(charmType || '').trim().toLowerCase() === 'bee_heart';
}

function getOrderBraceletItemName(item = {}) {
  const name = item.nameTh && item.nameEn
    ? `${item.nameTh} (${item.nameEn})`
    : item.nameTh || item.nameEn || item.name || item.sku || item.id || item.stoneId || item.charmId || item.spacerId;
  return name || 'Bracelet item';
}

function getOrderBraceletItemImage(item = {}) {
  return item.image || item.imageUrl || item.imageSrc || item.thumbnail || item.icon || '';
}

function getOrderBraceletItemColor(item = {}) {
  return item.color || item.hex || item.colorHex || item.baseColor || '#E2E8F0';
}

function getOrderBraceletItemSize(item = {}, itemType = getOrderBraceletItemType(item), order = {}) {
  const fallbackBeadSize = order.beadSize === 'mixed' ? order.mixedPlacingSize : order.beadSize;
  const candidates = itemType === 'charm'
    ? [item.footprintMm, item.business?.footprintMm, item.effectiveLengthMm, Number(item.sizeCm ?? item.business?.sizeCm) * 10, item.displaySizeMm, item.sizeMm, item.size]
    : itemType === 'spacer'
      ? [item.effectiveLengthMm, item.business?.effectiveLengthMm, item.displaySizeMm, item.business?.displaySizeMm, item.sizeMm, item.size]
      : [item.sizeMm, item.displaySizeMm, item.size, fallbackBeadSize];
  const sizeValue = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  return sizeValue == null ? (itemType === 'charm' ? 12 : itemType === 'spacer' ? 5 : 6) : Number(sizeValue);
}

function getOrderCharmRenderTuning(item = {}, catalogCharm = null) {
  const tuningSource = {
    ...(catalogCharm?.renderTuning || {}),
    ...catalogCharm,
    ...(item.renderTuning || {}),
    ...item
  };
  const numberOrDefault = (value, fallback) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  };

  return {
    visualScale: Math.min(1, Math.max(0.1, numberOrDefault(tuningSource.visualScale, 0.9))),
    visualOffsetX: Math.max(-0.5, Math.min(0.5, numberOrDefault(tuningSource.visualOffsetX, 0))),
    visualOffsetY: Math.max(-0.5, Math.min(0.5, numberOrDefault(tuningSource.visualOffsetY, 0))),
    maxWidthRatio: Math.min(1, Math.max(0.4, numberOrDefault(tuningSource.maxWidthRatio, 1))),
    maxHeightRatio: Math.min(1, Math.max(0.4, numberOrDefault(tuningSource.maxHeightRatio, 0.92))),
    edgeFitMode: tuningSource.edgeFitMode === 'horizontal_fill' ? 'horizontal_fill' : 'contain',
    targetWidthFillRatio: Math.min(1.1, Math.max(0.5, numberOrDefault(tuningSource.targetWidthFillRatio, 1))),
    rotation: numberOrDefault(tuningSource.rotation, 0),
    outwardOffsetMm: numberOrDefault(tuningSource.outwardOffsetMm, 0),
    renderWidthMm: numberOrDefault(tuningSource.renderWidthMm, 0),
    renderHeightMm: numberOrDefault(tuningSource.renderHeightMm, 0),
    renderSizeMm: numberOrDefault(tuningSource.renderSizeMm, 0)
  };
}

function normalizeOrderBraceletPreviewItems(order = {}) {
  return getOrderBraceletSequence(order)
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const itemType = getOrderBraceletItemType(item);
      const itemId = String(item.stoneId || item.charmId || item.spacerId || item.id || '').trim();
      const stone = itemType === 'stone' ? getCrmCatalogEntryById(STONES, itemId) : null;
      const charm = itemType === 'charm' ? getCrmCharmCatalogEntry(itemId) : null;
      const spacer = itemType === 'spacer' ? getCrmSpacerCatalogEntry(itemId) : null;
      const catalogItem = stone || charm || spacer || {};
      const sizeMm = getOrderBraceletItemSize({ ...catalogItem, ...item }, itemType, order);
      const displaySizeMm = item.displaySizeMm || spacer?.business?.displaySizeMm || spacer?.displaySizeMm || sizeMm;
      const renderTuning = itemType === 'charm' ? getOrderCharmRenderTuning(item, charm) : {};
      const charmType = item.charmType || item.type || charm?.type || null;
      const isSlotCharm = itemType === 'charm' && isOrderSlotPlaceableCharmType(charmType);
      return {
        ...item,
        index,
        previewType: itemType,
        previewId: itemId,
        previewName: getOrderBraceletItemName({
          ...item,
          nameTh: item.nameTh || getNestedNameValue(catalogItem, 'th'),
          nameEn: item.nameEn || getNestedNameValue(catalogItem, 'en')
        }),
        previewImage: getOrderBraceletItemImage({ ...catalogItem, ...item, image: getNestedImageValue(item) || getNestedImageValue(catalogItem) }),
        previewColor: getOrderBraceletItemColor({ ...catalogItem, ...item, color: item.color || catalogItem.color || catalogItem.colorHex }),
        previewSizeMm: sizeMm,
        displaySizeMm,
        effectiveLengthMm: item.effectiveLengthMm || spacer?.business?.effectiveLengthMm || spacer?.effectiveLengthMm || sizeMm,
        spacerShape: item.spacerShape || item.type || spacer?.type || 'ball',
        charmType,
        renderSizeMm: itemType === 'charm'
          ? (renderTuning.renderSizeMm || item.renderSizeMm || (isSlotCharm ? 18 : 0))
          : (item.renderSizeMm || spacer?.renderSizeMm || displaySizeMm),
        renderWidthMm: renderTuning.renderWidthMm || item.renderWidthMm || (isSlotCharm ? 12.5 : 0),
        renderHeightMm: renderTuning.renderHeightMm || item.renderHeightMm || (isSlotCharm ? 18 : 0),
        visualScale: isSlotCharm ? 1.3225 : renderTuning.visualScale,
        visualOffsetX: renderTuning.visualOffsetX,
        visualOffsetY: renderTuning.visualOffsetY,
        maxWidthRatio: renderTuning.maxWidthRatio,
        maxHeightRatio: renderTuning.maxHeightRatio,
        edgeFitMode: renderTuning.edgeFitMode,
        targetWidthFillRatio: renderTuning.targetWidthFillRatio,
        rotation: renderTuning.rotation,
        outwardOffsetMm: renderTuning.outwardOffsetMm || item.outwardOffsetMm || (isSlotCharm ? 7.2 : 0)
      };
    });
}

function getOrderBraceletLengthMm(order = {}) {
  const wristSizeCm = Number(order.wristSize || order.checkoutSummary?.wristSize);
  return Number.isFinite(wristSizeCm) && wristSizeCm > 0 ? (wristSizeCm + 1.5) * 10 : 175;
}

function getOrderBraceletPlacingSizeMm(order = {}) {
  if (order.beadSize === 'mixed') {
    const mixedSize = Number(order.mixedPlacingSize || order.checkoutSummary?.mixedPlacingSize);
    return Number.isFinite(mixedSize) && mixedSize > 0 ? mixedSize : 6;
  }
  const beadSize = Number(order.beadSize || order.checkoutSummary?.beadSize);
  return Number.isFinite(beadSize) && beadSize > 0 ? beadSize : 6;
}

function createOrderPreviewResolvedLayout(order = {}) {
  const components = normalizeOrderBraceletPreviewItems(order).map((item, index) => {
    const component = {
      ...item,
      type: item.previewType,
      layoutRole: 'loop',
      sourceIndex: index,
      sizeMm: item.previewSizeMm,
      image: item.previewImage,
      color: item.previewColor,
      nameTh: item.nameTh,
      nameEn: item.nameEn,
      uniqueId: item.uniqueId || `${item.previewType}-${item.previewId || index}-${index}`
    };

    if (component.type === 'charm') {
      component.footprintMm = item.previewSizeMm;
      component.sizeCm = item.sizeCm || item.business?.sizeCm || (item.previewSizeMm / 10);
      component.renderSizeMm = item.renderSizeMm || 0;
      component.renderWidthMm = item.renderWidthMm || 0;
      component.renderHeightMm = item.renderHeightMm || 0;
    }

    if (component.type === 'spacer') {
      component.sizeMm = item.effectiveLengthMm || item.previewSizeMm;
      component.renderSizeMm = item.renderSizeMm || item.displaySizeMm || item.previewSizeMm;
    }

    return component;
  });
  const braceletLengthMm = getOrderBraceletLengthMm(order);
  const placingSizeMm = getOrderBraceletPlacingSizeMm(order);
  const centerX = 125;
  const centerY = 125;
  const radiusPx = 82;
  const totalUsedLengthMm = components.reduce((sum, component) => sum + Number(component.sizeMm || 0), 0);
  const remainingLengthMm = Math.max(0, braceletLengthMm - totalUsedLengthMm);
  const numPlaceholders = Math.max(0, Math.floor(remainingLengthMm / placingSizeMm));
  const loopItems = [
    ...components.map((component) => ({ kind: 'component', component, sizeMm: component.sizeMm })),
    ...Array.from({ length: numPlaceholders }, () => ({ kind: 'placeholder', sizeMm: placingSizeMm }))
  ];
  const totalVirtualDiameter = loopItems.reduce((sum, item) => sum + Number(item.sizeMm || 0), 0);
  const loopCircumferenceMm = totalVirtualDiameter > 0 ? totalVirtualDiameter : braceletLengthMm;
  const scaleMmToPx = (2 * Math.PI * radiusPx) / loopCircumferenceMm;
  let accumulatedAngle = -Math.PI / 2;

  const nodes = loopItems.map((item, index) => {
    const itemAngleWidth = (item.sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    const centerAngle = accumulatedAngle + itemAngleWidth / 2;
    accumulatedAngle += itemAngleWidth;
    const visualSizeMm = item.kind === 'component' && Number.isFinite(Number(item.component?.renderSizeMm))
      ? Number(item.component.renderSizeMm)
      : item.sizeMm;
    const node = {
      index,
      kind: item.kind,
      sizeMm: item.sizeMm,
      itemAngleWidth,
      centerAngle,
      centerX: centerX + radiusPx * Math.cos(centerAngle),
      centerY: centerY + radiusPx * Math.sin(centerAngle),
      radiusPx: (visualSizeMm / 2) * scaleMmToPx,
      isPlaced: item.kind === 'component'
    };
    if (item.kind === 'component') {
      node.component = item.component;
    }
    return node;
  });

  return {
    braceletConfig: { svg: { centerX, centerY, radiusPx } },
    summary: { scaleMmToPx },
    nodes
  };
}

function getOrderResolvedNodeRotationRad(node = {}) {
  if (node.component?.type === 'charm') {
    const baseRotation = node.centerAngle + Math.PI;
    const rotationOffsetRad = (Number(node.component.rotation || 0) * Math.PI) / 180;
    return baseRotation + rotationOffsetRad;
  }
  return node.centerAngle + Math.PI / 2;
}

function projectOrderLayoutToCircle(resolvedLayout, surfaceConfig = {}) {
  const baseRadiusPx = resolvedLayout.braceletConfig.svg.radiusPx;
  const radiusScale = baseRadiusPx > 0 ? surfaceConfig.radiusPx / baseRadiusPx : 1;
  const allowedTypes = surfaceConfig.componentTypes || ['stone', 'spacer', 'charm'];

  return resolvedLayout.nodes
    .filter((node) => node.isPlaced && allowedTypes.includes(node.component?.type))
    .map((node) => ({
      ...node,
      renderCenterX: surfaceConfig.centerX + surfaceConfig.radiusPx * Math.cos(node.centerAngle),
      renderCenterY: surfaceConfig.centerY + surfaceConfig.radiusPx * Math.sin(node.centerAngle),
      renderRadiusPx: node.radiusPx * radiusScale,
      renderScalePxPerMm: resolvedLayout.summary.scaleMmToPx * radiusScale,
      renderRotationRad: getOrderResolvedNodeRotationRad(node)
    }));
}

function getOrderCharmFrameDimensions(component = {}, scaleMmToPx = 0) {
  const renderWidthMm = Number(component.renderWidthMm);
  const renderHeightMm = Number(component.renderHeightMm);
  if (Number.isFinite(renderWidthMm) && renderWidthMm > 0 && Number.isFinite(renderHeightMm) && renderHeightMm > 0) {
    return {
      widthPx: renderWidthMm * scaleMmToPx,
      heightPx: renderHeightMm * scaleMmToPx
    };
  }
  const renderSizeMm = Number(component.renderSizeMm || component.sizeMm || 0);
  return {
    widthPx: renderSizeMm * scaleMmToPx,
    heightPx: renderSizeMm * scaleMmToPx
  };
}

function getOrderCharmOutwardOffsetPx(component = {}, scaleMmToPx = 0) {
  const offsetMm = Number(component.outwardOffsetMm);
  return Number.isFinite(offsetMm) ? offsetMm * scaleMmToPx : 0;
}

function renderOrderBraceletPreview(order = {}, options = {}) {
  const savedPreviewImage = getOrderSavedBraceletPreviewImage(order);
  const size = Number(options.size || 150);
  const className = options.className || '';
  const title = options.title || 'Bracelet layout preview';

  if (savedPreviewImage) {
    return `
      <div class="order-bracelet-preview order-bracelet-preview-snapshot ${escapeHtml(className)}" aria-label="${escapeHtml(title)}">
        <img class="order-bracelet-preview-img" src="${escapeHtml(savedPreviewImage)}" alt="${escapeHtml(title)}">
      </div>
    `;
  }

  const center = size / 2;
  const radius = Math.max(42, size * 0.333);
  const resolvedLayout = createOrderPreviewResolvedLayout(order);
  const nodes = projectOrderLayoutToCircle(resolvedLayout, {
    centerX: center,
    centerY: center,
    radiusPx: radius,
    componentTypes: ['stone', 'spacer', 'charm']
  });

  if (!nodes.length) {
    return `
      <div class="order-bracelet-preview ${escapeHtml(className)}" aria-label="${escapeHtml(title)}">
        <svg class="order-bracelet-preview-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(title)}">
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="rgba(181, 169, 219, 0.28)" stroke-width="${Math.max(2, size * 0.016)}" stroke-dasharray="5 6"></circle>
          <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="middle" class="order-bracelet-preview-empty">No layout</text>
        </svg>
      </div>
    `;
  }

  const ringStrokeWidth = Math.max(2, size * 0.016);
  const markerHtml = nodes.map((node) => {
    const component = node.component;
    const x = node.renderCenterX;
    const y = node.renderCenterY;
    const radiusPx = Math.max(1, node.renderRadiusPx);
    const label = `${Number(component.sourceIndex ?? node.index) + 1}. ${component.previewName || getOrderBraceletItemName(component)}`;
    const escapedLabel = escapeHtml(label);
    const escapedImage = escapeHtml(component.image || component.previewImage || '');
    const escapedColor = escapeHtml(component.color || component.previewColor || '#B5A9DB');
    const rotationDeg = (node.renderRotationRad || 0) * 180 / Math.PI;

    if (component.type === 'charm') {
      const frame = getOrderCharmFrameDimensions(component, node.renderScalePxPerMm || 0);
      const outwardOffsetPx = getOrderCharmOutwardOffsetPx(component, node.renderScalePxPerMm || 0);
      const charmX = x + (Math.cos(node.centerAngle) * outwardOffsetPx);
      const charmY = y + (Math.sin(node.centerAngle) * outwardOffsetPx);
      const visualScale = Number(component.visualScale || 0.9);
      const maxWidthRatio = Number(component.maxWidthRatio || 1);
      const maxHeightRatio = Number(component.maxHeightRatio || 0.92);
      const width = Math.max(1, frame.widthPx * maxWidthRatio * visualScale);
      const height = Math.max(1, frame.heightPx * maxHeightRatio * visualScale);
      return `
        <g class="order-bracelet-preview-item order-bracelet-preview-charm" transform="translate(${charmX} ${charmY}) rotate(${rotationDeg})">
          <title>${escapedLabel}</title>
          ${escapedImage
            ? `<image href="${escapedImage}" x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"></image>`
            : `<ellipse cx="0" cy="0" rx="${width / 2}" ry="${height / 2}" fill="#D7B56D"></ellipse>`}
        </g>
      `;
    }

    if (component.type === 'spacer') {
      const spacerSizePx = radiusPx * 2;
      if (escapedImage) {
        return `
          <g class="order-bracelet-preview-item order-bracelet-preview-spacer" transform="translate(${x} ${y}) rotate(${rotationDeg})">
            <title>${escapedLabel}</title>
            <image href="${escapedImage}" x="${-spacerSizePx / 2}" y="${-spacerSizePx / 2}" width="${spacerSizePx}" height="${spacerSizePx}" preserveAspectRatio="xMidYMid meet"></image>
          </g>
        `;
      }
      return `
        <g class="order-bracelet-preview-item order-bracelet-preview-spacer" transform="translate(${x} ${y}) rotate(${rotationDeg})">
          <title>${escapedLabel}</title>
          ${component.spacerShape === 'ball'
            ? `<circle cx="0" cy="0" r="${radiusPx}" fill="${escapedColor}" stroke="rgba(15, 23, 42, 0.35)" stroke-width="0.8"></circle>`
            : `<rect x="${-radiusPx * 0.45}" y="${-radiusPx}" width="${radiusPx * 0.9}" height="${radiusPx * 2}" rx="${Math.max(1, radiusPx * 0.2)}" fill="${escapedColor}" stroke="rgba(15, 23, 42, 0.35)" stroke-width="0.8"></rect>`}
        </g>
      `;
    }

    const imageSize = radiusPx * 2 * 1.3;
    return `
      <g class="order-bracelet-preview-item order-bracelet-preview-stone">
        <title>${escapedLabel}</title>
        <circle cx="${x}" cy="${y}" r="${radiusPx}" fill="${escapedColor}" stroke="#FFFFFF" stroke-width="${Math.max(0.7, size * 0.006)}"></circle>
        ${escapedImage
          ? `<image href="${escapedImage}" x="${x - imageSize / 2}" y="${y - imageSize / 2}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid slice"></image>`
          : ''}
      </g>
    `;
  }).join('');

  return `
    <div class="order-bracelet-preview ${escapeHtml(className)}" aria-label="${escapeHtml(title)}">
      <svg class="order-bracelet-preview-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(title)}">
        <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="rgba(181, 169, 219, 0.28)" stroke-width="${ringStrokeWidth}"></circle>
        ${markerHtml}
      </svg>
    </div>
  `;
}

function getOrderCharmItems(order = {}) {
  if (Array.isArray(order.selectedCharms) && order.selectedCharms.length > 0) return order.selectedCharms;
  if (Array.isArray(order.charms) && order.charms.length > 0) return order.charms;
  return getOrderItemizedBilling(order).filter((item) => String(item.type || '').toLowerCase() === 'charm');
}

function getOrderSpacerItems(order = {}) {
  if (Array.isArray(order.selectedSpacers) && order.selectedSpacers.length > 0) return order.selectedSpacers;
  if (Array.isArray(order.spacers) && order.spacers.length > 0) return order.spacers;
  return getOrderItemizedBilling(order).filter((item) => String(item.type || '').toLowerCase() === 'spacer');
}

function detailDateValue(value) {
  return detailValue(formatDetailDateTime(value));
}

function detailMoneyValue(value) {
  return detailValue(formatDetailMoney(value));
}

function getOrderShippingInfo(order = {}) {
  const shippingInfo = order.shippingInfo && typeof order.shippingInfo === 'object'
    ? order.shippingInfo
    : {};

  return {
    recipientName: shippingInfo.recipientName || order.recipientName || '',
    phoneNumber: shippingInfo.phoneNumber || order.phoneNumber || '',
    addressLine: shippingInfo.addressLine || order.addressLine || '',
    province: shippingInfo.province || order.province || '',
    postalCode: shippingInfo.postalCode || order.postalCode || ''
  };
}

function getOrderCharmDetailEntries(order = {}) {
  const charmItems = getOrderCharmItems(order);
  if (charmItems.length > 0) {
    return aggregateOrderDetailItems(
      charmItems,
      (charm) => `${charm.id || charm.charmId || charm.sku || charm.nameEn || charm.nameTh || 'charm'}_${charm.sizeCm || ''}`,
      (charm) => {
        const name = charm.nameTh && charm.nameEn
          ? `${charm.nameTh} (${charm.nameEn})`
          : charm.nameEn || charm.nameTh || charm.sku || charm.id || CRM_COMPONENT_LABELS.charm;
        const meta = [charm.sku, charm.sizeCm ? `${Number(charm.sizeCm).toFixed(1)} cm` : '']
          .filter(Boolean)
          .join(' • ');
        return meta ? `${name} - ${meta}` : name;
      }
    );
  }

  if (!order.hasCharm) return [];

  return [{
    label: getOrderCharmDisplayText(order),
    quantity: Number(order.charmCount || 1) || 1
  }];
}

function aggregateOrderDetailItems(items = [], keyBuilder, labelBuilder) {
  const itemMap = new Map();

  items.forEach((item) => {
    const key = keyBuilder(item);
    const label = labelBuilder(item);
    if (!itemMap.has(key)) {
      itemMap.set(key, { label, quantity: 0 });
    }
    itemMap.get(key).quantity += 1;
  });

  return [...itemMap.values()];
}

function getOrderStoneDetailEntries(order = {}) {
  const stoneItems = getOrderItemizedBilling(order).filter((item) => String(item.type || '').toLowerCase() === 'stone');
  if (stoneItems.length > 0) {
    return stoneItems.map((item) => ({
      label: `${item.nameTh || item.name || item.stoneId || CRM_COMPONENT_LABELS.stone}${item.size ? ` - ${item.size}mm` : ''}`,
      quantity: Number(item.quantity || item.count || 1) || 1
    }));
  }

  return aggregateOrderDetailItems(
    Array.isArray(order.beads) ? order.beads : [],
    (bead) => `${bead.stoneId || bead.name || bead.nameTh || 'stone'}_${bead.size || ''}`,
    (bead) => {
        const name = bead.nameTh && bead.name
          ? `${bead.nameTh} (${bead.name})`
        : bead.name || bead.nameTh || bead.stoneId || CRM_COMPONENT_LABELS.stone;
      return `${name}${bead.size ? ` - ${bead.size}mm` : ''}`;
    }
  );
}

function getOrderSpacerDetailEntries(order = {}) {
  const spacerItems = getOrderSpacerItems(order);
  return aggregateOrderDetailItems(
    spacerItems,
    (spacer) => `${spacer.spacerId || spacer.nameEn || spacer.nameTh || 'spacer'}_${spacer.effectiveLengthMm || spacer.displaySizeMm || ''}`,
    (spacer) => {
      const name = spacer.nameTh && spacer.nameEn
        ? `${spacer.nameTh} (${spacer.nameEn})`
        : spacer.nameEn || spacer.nameTh || spacer.spacerId || CRM_COMPONENT_LABELS.spacer;
      return `${name}${spacer.displaySizeMm ? ` - ${spacer.displaySizeMm}mm` : ''}`;
    }
  );
}

function renderOrderDetailList(entries = []) {
  if (!entries.length) return '<div class="order-detail-empty">&mdash;</div>';

  return `
    <ul class="order-detail-list">
      ${entries.map((entry) => `
        <li>
          <span>${detailValue(entry.label)}</span>
          <strong>x ${Number(entry.quantity || 0).toLocaleString()}</strong>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderOrderDetailFields(fields = []) {
  return fields.map(({ label, value, rawHtml = false }) => `
    <div class="order-detail-field">
      <span>${escapeHtml(label)}</span>
      <strong>${rawHtml ? value : detailValue(value)}</strong>
    </div>
  `).join('');
}

function getOrderDetailItemCount(order = {}) {
  const beadCount = Number(order.totalBeads || (Array.isArray(order.beads) ? order.beads.length : 0)) || 0;
  const charmItems = getOrderCharmItems(order);
  const spacerItems = getOrderSpacerItems(order);
  const charmCount = charmItems.length > 0
    ? charmItems.length
    : (order.hasCharm ? (Number(order.charmCount || 1) || 1) : 0);
  const spacerCount = spacerItems.length || Number(order.spacerCount || (Array.isArray(order.spacers) ? order.spacers.length : 0)) || 0;
  return beadCount + charmCount + spacerCount;
}

function buildOrderNotificationStateHtml(order = {}) {
  const paymentSentAt = formatNotificationTimestamp(order?.notifications?.paymentReceivedSentAt);
  const shippedSentAt = formatNotificationTimestamp(order?.notifications?.shippedSentAt);

  if (!paymentSentAt && !shippedSentAt) {
    return '';
  }

  return `
    <div class="order-notification-stack">
      ${paymentSentAt ? `<div class="order-notification-item">แจ้งชำระเงิน: ${escapeHtml(paymentSentAt)}</div>` : ''}
      ${shippedSentAt ? `<div class="order-notification-item">แจ้งจัดส่ง: ${escapeHtml(shippedSentAt)}</div>` : ''}
    </div>
  `;
}

function readOrderWorkflowInputs(rowElement) {
  const trackingInput = rowElement?.querySelector('.order-tracking-input');
  const carrierSelect = rowElement?.querySelector('.order-carrier-select');
  const carrierCustomInput = rowElement?.querySelector('.order-carrier-custom-input');
  const shippingCarrier = String(carrierSelect?.value || '').trim();

  return {
    trackingNumber: String(trackingInput?.value || '').trim(),
    shippingCarrier,
    shippingCarrierCustom: shippingCarrier === 'Other'
      ? String(carrierCustomInput?.value || '').trim()
      : ''
  };
}

function toggleCarrierCustomField(rowElement) {
  const carrierSelect = rowElement?.querySelector('.order-carrier-select');
  const customField = rowElement?.querySelector('.order-carrier-custom-field');
  const customInput = rowElement?.querySelector('.order-carrier-custom-input');
  const isOther = String(carrierSelect?.value || '').trim() === 'Other';

  if (customField) {
    customField.hidden = !isOther;
  }

  if (!isOther && customInput) {
    customInput.value = '';
  }
}

async function persistOrderWorkflowDetails(orderId, rowElement, currentStatus) {
  const success = await updateOrderStatus(orderId, currentStatus, readOrderWorkflowInputs(rowElement));
  if (!success) {
    showToast('Unable to save shipping details.');
  }
  return success;
}

function renderOrdersList(orders) {
  const statusFilter = DOM.orderStatusFilter.value;
  const query = DOM.ordersSearch.value.trim().toLowerCase();
  
  let filtered = orders;
  
  // Status filter
  if (statusFilter !== 'all') {
    filtered = filtered.filter(o => o.status === statusFilter);
  }
  
  // Keyword search
  if (query) {
    filtered = filtered.filter(o => {
      return o.id.toLowerCase().includes(query) || 
             o.customerName.toLowerCase().includes(query) ||
             (o.beads || []).some(b => b.nameTh.toLowerCase().includes(query) || b.name.toLowerCase().includes(query)) ||
             (o.hasCharm && (
               (o.charmNameTh || '').toLowerCase().includes(query) ||
               (o.charmNameEn || '').toLowerCase().includes(query) ||
               (o.charmSku || '').toLowerCase().includes(query)
             ));
    });
  }
  
  DOM.ordersTableBody.innerHTML = '';
  if (filtered.length === 0) {
    DOM.ordersTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No customer orders match the filters.</td></tr>';
    return;
  }
  
  filtered.forEach(order => {
    const tr = document.createElement('tr');
    
    // Date formatting
    const formattedDate = new Date(order.date).toLocaleDateString('en-TH', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Wrist specs
    const wristText = `${order.wristSize.toFixed(1)} cm`;
    const beadText = order.beadSize === 'mixed' ? 'Mixed' : `${order.beadSize}mm`;
    const beadCountText = `${order.totalBeads} beads`;
    const orderCharmItems = getOrderCharmItems(order);
    const orderSpacerItems = getOrderSpacerItems(order);
    const charmText = orderCharmItems.length > 0
      ? orderCharmItems.map((charm) => charm.nameEn || charm.nameTh || charm.sku || charm.id || charm.charmId || CRM_COMPONENT_LABELS.charm).join(', ')
      : (order.hasCharm ? `${order.charmNameEn || order.charmNameTh || CRM_COMPONENT_LABELS.charm} (${Number(order.charmSizeCm || 0).toFixed(1)} cm)` : `No ${CRM_COMPONENT_LABELS.charm}`);
    const spacerText = orderSpacerItems.length > 0
      ? `${orderSpacerItems.length} ${CRM_COMPONENT_LABELS.spacer}`
      : (order.hasSpacer ? `${order.spacerCount} ${CRM_COMPONENT_LABELS.spacer}` : `No ${CRM_COMPONENT_LABELS.spacer}`);
    
    const braceletPreviewHtml = renderOrderBraceletPreview(order, {
      className: 'order-bracelet-preview-compact',
      title: `Bracelet layout for ${order.id}`
    });
    
    // Price summary details
    const displaySubtotal = getOrderSubtotal(order);
    const displayDiscountPercent = getOrderDiscountPercent(order);
    const displayDiscountAmount = getOrderDiscountAmount(order);
    const displayFinalPrice = getOrderFinalPrice(order);
    order.subtotal = displaySubtotal;
    order.discountPercent = displayDiscountPercent;
    order.discountAmount = displayDiscountAmount;
    order.netPrice = displayFinalPrice;
    const priceText = `
      <div style="font-size: 11px;">
        <div>Subtotal: ฿${order.subtotal.toLocaleString()}</div>
        <div style="color: var(--color-gold-dark);">Discount (${order.discountPercent}%): -฿${order.discountAmount.toLocaleString()}</div>
        <div style="font-weight:700; color: var(--color-gold); font-size:13px; margin-top:2px;">Total: ฿${order.netPrice.toLocaleString()}</div>
      </div>
    `;
    
    // Workflow status dropdown selector
    const currentStatus = order.status || 'New Order';
    const shippingFields = normalizeOrderShippingFields(order);
    const shippingCarrierDisplay = getOrderShippingCarrierDisplay(order);
    
    // Map status to css selector tag
    let dropdownColorClass = 'new-order';
    if (currentStatus === 'Stone Selection Photo Sent') dropdownColorClass = 'photo-sent';
    if (currentStatus === 'Payment Received') dropdownColorClass = 'paid';
    if (currentStatus === 'Shipped') dropdownColorClass = 'shipped';
    if (currentStatus === 'Completed') dropdownColorClass = 'completed';
    
    const statusSelectHtml = `
      <select class="status-dropdown ${dropdownColorClass}" data-id="${order.id}">
        <option value="New Order" ${currentStatus === 'New Order' ? 'selected' : ''}>New Order</option>
        <option value="Stone Selection Photo Sent" ${currentStatus === 'Stone Selection Photo Sent' ? 'selected' : ''}>Photo Sent</option>
        <option value="Payment Received" ${currentStatus === 'Payment Received' ? 'selected' : ''}>Paid</option>
        <option value="Shipped" ${currentStatus === 'Shipped' ? 'selected' : ''}>Shipped</option>
        <option value="Completed" ${currentStatus === 'Completed' ? 'selected' : ''}>Completed</option>
      </select>
    `;

    const workflowMetaHtml = `
      <div class="order-workflow-stack">
        ${statusSelectHtml}
        <div class="order-shipping-stack">
          <label class="order-inline-field">
            <span class="order-inline-label">ผู้ให้บริการ</span>
            <select class="form-control-select order-carrier-select">
              ${buildOrderCarrierOptionsHtml(shippingFields.shippingCarrier)}
            </select>
          </label>
          <label class="order-inline-field order-carrier-custom-field" ${shippingFields.shippingCarrier === 'Other' ? '' : 'hidden'}>
            <span class="order-inline-label">ระบุเพิ่มเติม</span>
            <input type="text" class="order-inline-input order-carrier-custom-input" value="${escapeHtml(shippingFields.shippingCarrierCustom)}" placeholder="ชื่อบริษัทขนส่ง">
          </label>
          <label class="order-inline-field">
            <span class="order-inline-label">เลขพัสดุ</span>
            <input type="text" class="order-inline-input order-tracking-input" value="${escapeHtml(shippingFields.trackingNumber)}" placeholder="เช่น TH1234567890">
          </label>
          ${shippingCarrierDisplay || shippingFields.trackingNumber ? `
            <div class="order-shipping-summary">
              ${shippingCarrierDisplay ? `<div>ผู้ให้บริการ: ${escapeHtml(shippingCarrierDisplay)}</div>` : ''}
              ${shippingFields.trackingNumber ? `<div>เลขพัสดุ: ${escapeHtml(shippingFields.trackingNumber)}</div>` : ''}
            </div>
          ` : ''}
          ${buildOrderNotificationStateHtml(order)}
        </div>
      </div>
    `;
    
    tr.innerHTML = `
      <td data-label="Order ID">
        <strong style="color: var(--color-navy-dark);">${order.id}</strong>
        <div style="font-size: 10px; color: var(--color-navy-muted); margin-top:2px;">${formattedDate}</div>
      </td>
      <td data-label="Customer"><strong>${order.customerName}</strong></td>
      <td data-label="Specs">
        <div>Wrist: ${wristText}</div>
        <div style="font-size: 11px; color: var(--color-navy-muted);">Bead: ${beadText} &bull; ${beadCountText}</div>
        <div style="font-size: 11px; color: var(--color-navy-muted);">${CRM_COMPONENT_LABELS.charm}: ${charmText}</div>
        <div style="font-size: 11px; color: var(--color-navy-muted);">${CRM_COMPONENT_LABELS.spacer}: ${spacerText}</div>
      </td>
      <td data-label="Bracelet Layout">${braceletPreviewHtml}</td>
      <td data-label="Pricing">${priceText}</td>
      <td data-label="Status">${workflowMetaHtml}</td>
      <td data-label="Invoice" class="text-right">
        <div class="order-row-actions">
          <button class="btn btn-outline btn-order-detail" data-id="${order.id}">
            View Detail
          </button>
          <button class="btn btn-outline btn-invoice-export" data-id="${order.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Export
          </button>
        </div>
      </td>
    `;
    
    // Event bindings inside rows
    const dropdown = tr.querySelector('.status-dropdown');
    const carrierSelect = tr.querySelector('.order-carrier-select');
    const carrierCustomInput = tr.querySelector('.order-carrier-custom-input');
    const trackingInput = tr.querySelector('.order-tracking-input');

    dropdown.addEventListener('change', (e) => handleOrderStatusChange(order.id, e.target.value, tr));
    carrierSelect?.addEventListener('change', async () => {
      toggleCarrierCustomField(tr);
      await persistOrderWorkflowDetails(order.id, tr, dropdown.value);
    });
    carrierCustomInput?.addEventListener('change', async () => {
      await persistOrderWorkflowDetails(order.id, tr, dropdown.value);
    });
    trackingInput?.addEventListener('change', async () => {
      await persistOrderWorkflowDetails(order.id, tr, dropdown.value);
    });
    
    const detailBtn = tr.querySelector('.btn-order-detail');
    detailBtn.addEventListener('click', () => openOrderDetailModal(order.id));

    const exportBtn = tr.querySelector('.btn-invoice-export');
    exportBtn.addEventListener('click', () => openInvoiceModal(order.id));
    
    DOM.ordersTableBody.appendChild(tr);
  });
}

async function handleOrderStatusChange(orderId, newStatus, rowElement = null) {
  const workflowUpdates = rowElement ? readOrderWorkflowInputs(rowElement) : {};
  const success = await updateOrderStatus(orderId, newStatus, workflowUpdates);
  if (success) {
    addLog(`Changed order ${orderId} status to '${newStatus}'.`);
    showToast(`Order status updated to: ${newStatus}`);
    await loadDashboardData();
  }
}

function getOrderCharmDisplayText(order) {
  const charmItems = getOrderCharmItems(order);
  if (charmItems.length > 0) {
    return charmItems.map((charm) => {
      const charmName = charm.nameTh && charm.nameEn
        ? `${charm.nameTh} (${charm.nameEn})`
        : charm.nameEn || charm.nameTh || charm.sku || charm.id || charm.charmId || CRM_COMPONENT_LABELS.charm;
      const charmMeta = [];
      if (charm.sizeCm) charmMeta.push(`${Number(charm.sizeCm).toFixed(1)} cm`);
      if (charm.sku) charmMeta.push(charm.sku);
      return charmMeta.length > 0 ? `${charmName} โ€ข ${charmMeta.join(' โ€ข ')}` : charmName;
    }).join(', ');
  }
  if (!order?.hasCharm) return `No ${CRM_COMPONENT_LABELS.charm}`;
  const charmName = order.charmNameTh && order.charmNameEn
    ? `${order.charmNameTh} (${order.charmNameEn})`
    : order.charmNameEn || order.charmNameTh || CRM_COMPONENT_LABELS.charm;
  const charmMeta = [];
  if (order.charmSizeCm) {
    charmMeta.push(`${Number(order.charmSizeCm).toFixed(1)} cm`);
  }
  if (order.charmSku) {
    charmMeta.push(order.charmSku);
  }
  return charmMeta.length > 0 ? `${charmName} • ${charmMeta.join(' • ')}` : charmName;
}

function getOrderSpacerDisplayText(order) {
  const spacerItems = getOrderSpacerItems(order);
  if (!order?.hasSpacer && spacerItems.length === 0) return `No ${CRM_COMPONENT_LABELS.spacer}`;
  if (spacerItems.length === 0) return `No ${CRM_COMPONENT_LABELS.spacer}`;
  const spacerDetails = spacerItems.reduce((acc, spacer) => {
    const key = `${spacer.nameTh || spacer.nameEn} (${spacer.displaySizeMm || 6}mm)`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(spacerDetails).map(([name, count]) => `${name} x ${count} ชิ้น`).join(', ');
}

async function openOrderDetailModal(orderId) {
  const orders = await getSharedOrders();
  const order = orders.find((entry) => entry.id === orderId);
  if (!order || !DOM.orderDetailBody || !DOM.orderDetailModal) return;

  const shippingInfo = getOrderShippingInfo(order);
  const shippingFields = normalizeOrderShippingFields(order);
  const shippingCarrierDisplay = getOrderShippingCarrierDisplay(order);
  const paymentSentAt = formatDetailDateTime(order?.notifications?.paymentReceivedSentAt);
  const shippedSentAt = formatDetailDateTime(order?.notifications?.shippedSentAt);
  const rawJson = JSON.stringify(order, null, 2);
  const detailSubtotal = getOrderSubtotal(order);
  const detailDiscountPercent = getOrderDiscountPercent(order);
  const detailDiscountAmount = getOrderDiscountAmount(order);
  const detailFinalPrice = getOrderFinalPrice(order);

  DOM.orderDetailBody.innerHTML = `
    <div class="order-detail-summary">
      <div>
        <span>Order ID</span>
        <strong>${detailValue(order.id)}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong>${detailValue(order.status || 'New Order')}</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>${detailMoneyValue(detailFinalPrice)}</strong>
      </div>
    </div>

    <div class="order-detail-grid">
      <section class="order-detail-section">
        <h4>Order Identity</h4>
        ${renderOrderDetailFields([
          { label: 'Order ID', value: order.id },
          { label: 'Created', value: detailDateValue(order.date), rawHtml: true },
          { label: 'Current Status', value: order.status || 'New Order' },
          { label: 'Stripe Checkout Session ID', value: order.stripeCheckoutSessionId },
          { label: 'Stripe Payment Status', value: order.stripePaymentStatus },
          { label: 'Stripe Checkout Status', value: order.stripeCheckoutStatus }
        ])}
      </section>

      <section class="order-detail-section">
        <h4>Customer / Recipient</h4>
        ${renderOrderDetailFields([
          { label: 'Customer Name', value: order.customerName },
          { label: 'Recipient Name', value: shippingInfo.recipientName },
          { label: 'Phone Number', value: shippingInfo.phoneNumber },
          { label: 'LINE userId', value: order.lineUserId }
        ])}
      </section>

      <section class="order-detail-section">
        <h4>Shipping Information</h4>
        ${renderOrderDetailFields([
          { label: 'Full Address', value: shippingInfo.addressLine },
          { label: 'Province', value: shippingInfo.province },
          { label: 'Postal Code', value: shippingInfo.postalCode },
          { label: 'Shipping Carrier', value: shippingCarrierDisplay || shippingFields.shippingCarrier },
          { label: 'Custom Carrier', value: shippingFields.shippingCarrierCustom },
          { label: 'Tracking Number', value: shippingFields.trackingNumber }
        ])}
      </section>

      <section class="order-detail-section">
        <h4>Notification Status</h4>
        ${renderOrderDetailFields([
          { label: 'Paid LINE Notification', value: paymentSentAt || 'Not sent yet' },
          { label: 'Shipped LINE Notification', value: shippedSentAt || 'Not sent yet' }
        ])}
      </section>

      <section class="order-detail-section order-detail-section-wide">
        <h4>Bracelet Items</h4>
        ${renderOrderBraceletPreview(order, {
          className: 'order-bracelet-preview-detail',
          title: `Bracelet layout for ${order.id}`
        })}
        ${renderOrderDetailFields([
          { label: 'Wrist Size', value: order.wristSize ? `${Number(order.wristSize).toFixed(1)} cm` : '' },
          { label: 'Bead Size', value: order.beadSize === 'mixed' ? 'Mixed' : (order.beadSize ? `${order.beadSize}mm` : '') },
          { label: 'Total Item Count', value: getOrderDetailItemCount(order) || '' }
        ])}
        <div class="order-detail-subsection">
          <h5>Stones</h5>
          ${renderOrderDetailList(getOrderStoneDetailEntries(order))}
        </div>
        <div class="order-detail-subsection">
          <h5>${CRM_COMPONENT_LABELS.charm}</h5>
          ${renderOrderDetailList(getOrderCharmDetailEntries(order))}
        </div>
        <div class="order-detail-subsection">
          <h5>${CRM_COMPONENT_LABELS.spacer}</h5>
          ${renderOrderDetailList(getOrderSpacerDetailEntries(order))}
        </div>
      </section>

      <section class="order-detail-section">
        <h4>Pricing</h4>
        ${renderOrderDetailFields([
          { label: 'Subtotal', value: detailMoneyValue(detailSubtotal), rawHtml: true },
          { label: 'Discount Percent', value: detailDiscountPercent !== undefined ? `${detailDiscountPercent}%` : '' },
          { label: 'Discount Amount', value: detailMoneyValue(detailDiscountAmount), rawHtml: true },
          { label: 'Final Total', value: detailMoneyValue(detailFinalPrice), rawHtml: true },
          { label: 'Currency', value: 'THB' }
        ])}
      </section>

      <section class="order-detail-section order-detail-section-wide">
        <details class="order-raw-json">
          <summary>Raw Order JSON</summary>
          <pre>${escapeHtml(rawJson)}</pre>
        </details>
      </section>
    </div>
  `;

  DOM.orderDetailModal.classList.add('show');
}

function closeOrderDetailModal() {
  if (DOM.orderDetailModal) {
    DOM.orderDetailModal.classList.remove('show');
  }
  if (DOM.orderDetailBody) {
    DOM.orderDetailBody.innerHTML = '<div class="empty-state">Select an order to view details.</div>';
  }
}

// ==========================================
// 10. Printable Invoice Exporting
// ==========================================
async function openInvoiceModal(orderId) {
  const orders = await getSharedOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  
  CRMState.selectedInvoiceOrder = order;
  
  DOM.invId.textContent = order.id;
  
  const formattedDate = new Date(order.date).toLocaleDateString('en-TH', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  DOM.invDate.textContent = `Date: ${formattedDate}`;
  
  DOM.invCustomer.textContent = order.customerName;
  
  // Status Badge
  let statusClass = 'badge-new';
  if (order.status === 'Stone Selection Photo Sent') statusClass = 'badge-photo';
  if (order.status === 'Payment Received') statusClass = 'badge-paid';
  if (order.status === 'Shipped') statusClass = 'badge-shipped';
  if (order.status === 'Completed') statusClass = 'badge-completed';
  DOM.invStatusBadge.innerHTML = `<span class="badge ${statusClass}">${order.status}</span>`;
  
  DOM.invWrist.textContent = `${order.wristSize.toFixed(1)} cm`;
  DOM.invLength.textContent = `${(order.wristSize + 1.5).toFixed(1)} cm (Tolerance included)`;
  DOM.invCharm.textContent = getOrderCharmDisplayText(order);
  DOM.invSpacer.textContent = getOrderSpacerDisplayText(order);
  order.subtotal = getOrderSubtotal(order);
  order.discountPercent = getOrderDiscountPercent(order);
  order.discountAmount = getOrderDiscountAmount(order);
  order.netPrice = getOrderFinalPrice(order);
  
  DOM.invSubtotal.textContent = `฿${order.subtotal.toLocaleString()}`;
  DOM.invDiscountLabel.textContent = `LINE Special Discount (${order.discountPercent}%):`;
  DOM.invDiscountAmount.textContent = `-฿${order.discountAmount.toLocaleString()}`;
  DOM.invNetTotal.textContent = `฿${order.netPrice.toLocaleString()}`;
  
  DOM.invConfigCode.textContent = order.configurationCode;
  
  // 1. Draw SVG bead layout map strip
  drawInvoiceSvgBeadMap(getOrderBraceletSequence(order));
  
  // 2. Populate billing items table breakdown
  drawInvoicePricingTable(order);
  
  DOM.invoiceExportModal.classList.add('show');
}

function closeInvoiceModal() {
  DOM.invoiceExportModal.classList.remove('show');
  CRMState.selectedInvoiceOrder = null;
}

// Draw visual linear representation of bracelet beads sequence in print invoice
function drawInvoiceSvgBeadMap(beads) {
  const svg = DOM.invBeadSvg;
  svg.innerHTML = '';
  
  if (!beads || beads.length === 0) return;
  
  const svgWidth = 500;
  const cy = 40;
  const count = beads.length;
  
  // Draw elastic thread string underneath
  const thread = document.createElementNS("http://www.w3.org/2000/svg", "line");
  thread.setAttribute("x1", "15");
  thread.setAttribute("y1", cy);
  thread.setAttribute("x2", svgWidth - 15);
  thread.setAttribute("y2", cy);
  thread.setAttribute("stroke", "#cbd5e1");
  thread.setAttribute("stroke-width", "2");
  thread.setAttribute("stroke-dasharray", "4 4");
  svg.appendChild(thread);
  
  // Calculate horizontal spacing dynamically
  const startX = 25;
  const endX = svgWidth - 25;
  const availableWidth = endX - startX;
  const spacing = count > 1 ? availableWidth / (count - 1) : availableWidth;
  
  beads.forEach((bead, idx) => {
    const cx = startX + idx * spacing;
    
    // Scale visual circle radius depending on bead size (4mm, 6mm, 8mm)
    const mmSize = bead.size || 6;
    let r = 8; // Default 6mm
    if (mmSize === 4) r = 5;
    if (mmSize === 8) r = 11;
    
    // Group container for sheen
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Base color circle
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", r);
    c.setAttribute("fill", bead.color || "#94a3b8");
    c.setAttribute("stroke", "#64748b");
    c.setAttribute("stroke-width", "0.5");
    g.appendChild(c);
    
    // 3D shiny glare effect overlay circle
    const sheen = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    sheen.setAttribute("cx", cx - (r * 0.2));
    sheen.setAttribute("cy", cy - (r * 0.2));
    sheen.setAttribute("r", r * 0.4);
    sheen.setAttribute("fill", "#ffffff");
    sheen.setAttribute("opacity", "0.35");
    g.appendChild(sheen);
    
    svg.appendChild(g);
  });
}

function drawInvoicePricingTable(order) {
  const itemizedBilling = getOrderItemizedBilling(order);
  if (itemizedBilling.length > 0) {
    DOM.invItemsBody.innerHTML = '';
    itemizedBilling.forEach((item) => {
      const type = String(item.type || item.componentType || 'item').toLowerCase();
      const nameTh = item.nameTh || item.name || item.id || type;
      const nameEn = item.nameEn || item.sku || item.stoneId || item.charmId || item.spacerId || '';
      const sizeText = type === 'charm'
        ? (item.sizeCm ? `${Number(item.sizeCm).toFixed(1)} cm` : '-')
        : `${item.size || item.displaySizeMm || item.effectiveLengthMm || '-'} mm`;
      const qty = Number(item.quantity || item.count || 1) || 1;
      const unitPrice = Number(item.unitPrice ?? item.price ?? item.priceUnit ?? 0);
      const totalPrice = Number(item.totalPrice ?? unitPrice * qty);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight:600; color:#1e293b;">${escapeHtml(nameTh)}</div>
          <div style="font-size:10px; color:#64748b;">${escapeHtml(nameEn)}</div>
        </td>
        <td>${escapeHtml(sizeText)}</td>
        <td>${qty.toLocaleString()}</td>
        <td class="text-right">เธฟ${unitPrice.toLocaleString()}</td>
        <td class="text-right" style="font-weight:600; color:#1e293b;">เธฟ${totalPrice.toLocaleString()}</td>
      `;
      DOM.invItemsBody.appendChild(tr);
    });
    return;
  }

  // Aggregate details
  const aggregated = {};
  const beads = order?.beads || [];
  
  beads.forEach(bead => {
    const key = `${bead.stoneId}_${bead.size}`;
    
    // Get unit price from database catalog
    const stones = STONES;
    const stoneData = stones.find(s => s.id === bead.stoneId);
    const unitPrice = getStonePriceForSize(stoneData, bead.size);
    
    if (aggregated[key]) {
      aggregated[key].qty++;
      aggregated[key].totalPrice += unitPrice;
    } else {
      aggregated[key] = {
        nameTh: bead.nameTh,
        nameEn: bead.name,
        size: bead.size,
        qty: 1,
        unitPrice: unitPrice,
        totalPrice: unitPrice
      };
    }
  });
  
  DOM.invItemsBody.innerHTML = '';
  
  Object.values(aggregated).forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight:600; color:#1e293b;">${item.nameTh}</div>
        <div style="font-size:10px; color:#64748b;">${item.nameEn}</div>
      </td>
      <td>${item.size} mm</td>
      <td>${item.qty} เม็ด</td>
      <td class="text-right">฿${item.unitPrice}</td>
      <td class="text-right" style="font-weight:600; color:#1e293b;">฿${item.totalPrice.toLocaleString()}</td>
    `;
    DOM.invItemsBody.appendChild(tr);
  });

  if (order?.hasCharm) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight:600; color:#1e293b;">${order.charmNameTh || CRM_COMPONENT_LABELS.charm}</div>
        <div style="font-size:10px; color:#64748b;">${order.charmNameEn || order.charmSku || ''}</div>
      </td>
      <td>${order.charmSizeCm ? `${Number(order.charmSizeCm).toFixed(1)} cm` : '-'}</td>
      <td>1 ชิ้น</td>
      <td class="text-right">฿${Number(order.charmPrice || 0).toLocaleString()}</td>
      <td class="text-right" style="font-weight:600; color:#1e293b;">฿${Number(order.charmPrice || 0).toLocaleString()}</td>
    `;
    DOM.invItemsBody.appendChild(tr);
  }

  if (order?.hasSpacer && Array.isArray(order.spacers) && order.spacers.length > 0) {
    const aggregatedSpacers = order.spacers.reduce((spacerMap, spacer) => {
      const key = `${spacer.spacerId}_${spacer.effectiveLengthMm}`;
      if (!spacerMap[key]) {
        spacerMap[key] = {
          ...spacer,
          qty: 0,
          totalPrice: 0
        };
      }
      spacerMap[key].qty++;
      spacerMap[key].totalPrice += Number(spacer.price || 0);
      return spacerMap;
    }, {});

    Object.values(aggregatedSpacers).forEach(spacer => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight:600; color:#1e293b;">${spacer.nameTh || CRM_COMPONENT_LABELS.spacer}</div>
          <div style="font-size:10px; color:#64748b;">${spacer.nameEn || ''}</div>
        </td>
        <td>${spacer.displaySizeMm || spacer.size || 6} mm</td>
        <td>${spacer.qty} ชิ้น</td>
        <td class="text-right">฿${Number(spacer.price || 0)}</td>
        <td class="text-right" style="font-weight:600; color:#1e293b;">฿${spacer.totalPrice.toLocaleString()}</td>
      `;
      DOM.invItemsBody.appendChild(tr);
    });
  }
}

// Invoice printing
function triggerPrint() {
  window.print();
}

// Copy invoice content summary to clipboard
function copyLINEInvoiceSummary() {
  const order = CRMState.selectedInvoiceOrder;
  if (!order) return;
  order.subtotal = getOrderSubtotal(order);
  order.discountPercent = getOrderDiscountPercent(order);
  order.discountAmount = getOrderDiscountAmount(order);
  order.netPrice = getOrderFinalPrice(order);
  
  const lines = [];
  lines.push(`🔮 *LUCKY.COLORSTONE Order Bill* 🔮`);
  lines.push(`Order ID: ${order.id}`);
  lines.push(`----------------------------------`);
  lines.push(`👤 Customer Name: ${order.customerName}`);
  lines.push(`📏 Wrist Specs: ${order.wristSize.toFixed(1)} cm`);
  lines.push(`💎 Bead size: ${order.beadSize === 'mixed' ? 'Mixed Sizes' : order.beadSize + 'mm'}`);
  lines.push(`📿 Total Beads: ${order.totalBeads} beads`);
  lines.push(`✨ ${CRM_COMPONENT_LABELS.charm}: ${getOrderCharmDisplayText(order)}`);
  if (order.hasSpacer && Array.isArray(order.spacers) && order.spacers.length > 0) {
    const spacerDetails = order.spacers.reduce((acc, spacer) => {
      const key = `${spacer.nameTh || spacer.nameEn} (${spacer.displaySizeMm || 6}mm)`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const spacerStrings = Object.entries(spacerDetails).map(([name, count]) => `${name} x ${count} ชิ้น`);
    lines.push(`✨ ${CRM_COMPONENT_LABELS.spacer}: ${spacerStrings.join(', ')}`);
  }
  lines.push(``);
  lines.push(`💳 Price Details:`);
  lines.push(`Subtotal: ฿${order.subtotal.toLocaleString()}`);
  lines.push(`Discount (${order.discountPercent}%): -฿${order.discountAmount.toLocaleString()}`);
  lines.push(`*Net Total:* ฿${order.netPrice.toLocaleString()}`);
  lines.push(``);
  lines.push(`🔗 Design Configuration Code:`);
  lines.push(order.configurationCode);
  lines.push(``);
  lines.push(`Thank you for designing with us! We have received your order details.`);
  
  const summaryText = lines.join('\n');
  navigator.clipboard.writeText(summaryText)
    .then(() => {
      showToast("Order invoice text summary copied to clipboard!");
      addLog(`Copied invoice LINE summary text for ${order.id}.`);
    })
    .catch((err) => {
      alert("Failed to copy summary to clipboard.");
    });
}

// ==========================================
// 11. Tab 4 settings / Sandbox utilities
// ==========================================
function setupFunctionalEvents() {
  // Inventory CRUD bindings
  DOM.btnOpenAddStoneModal.addEventListener('click', openAddStoneForm);
  DOM.btnStoneModalClose.addEventListener('click', closeStoneForm);
  DOM.btnCancelStoneForm.addEventListener('click', closeStoneForm);
  DOM.stoneCrudForm.addEventListener('submit', handleSaveStoneType);
  if (DOM.crudStoneImageFile) {
    DOM.crudStoneImageFile.addEventListener('change', async (event) => {
      const file = event.target.files?.[0] || null;
      try {
        if (!file) {
          resetImageUploadState("Stone");
          updateImagePreview(DOM.crudStoneImagePreview, DOM.crudStoneImage.value);
          return;
        }
        const pending = await prepareImageSelection("Stone", file);
        updateImagePreview(DOM.crudStoneImagePreview, pending?.dataUrl || "");
        setUploadStatus(DOM.crudStoneUploadStatus, `Ready to upload: ${file.name}`, "info");
      } catch (err) {
        console.error(err);
        setUploadStatus(DOM.crudStoneUploadStatus, err.message || "Unable to read image file.", "warn");
      }
    });
  }
  if (DOM.btnUploadStoneImage) {
    DOM.btnUploadStoneImage.addEventListener('click', async () => {
      try {
        await uploadImageToMediaService("Stone");
      } catch (err) {
        console.error(err);
        setUploadStatus(DOM.crudStoneUploadStatus, err.message || "Image upload failed.", "warn");
        showToast(err.message || "Image upload failed.");
      }
    });
  }
  if (DOM.crudStoneImage) {
    DOM.crudStoneImage.addEventListener('input', () => {
      CRMState.pendingStoneImage = null;
      if (DOM.crudStoneImageFile) DOM.crudStoneImageFile.value = "";
      setUploadStatus(DOM.crudStoneUploadStatus, "Manual URL updated. File selection cleared.", "info");
      updateImagePreview(DOM.crudStoneImagePreview, DOM.crudStoneImage.value);
    });
  }
  DOM.inventorySearch.addEventListener('input', () => {
    renderInventoryFromCache();
  });
  DOM.inventoryTypeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      CRMState.inventoryTypeFilter = tab.dataset.inventoryType || 'all';
      renderInventoryFromCache();
    });
  });
  DOM.simulatorCategoryTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      CRMState.simulatorCategory = tab.dataset.simulatorCategory || 'stones';
      const cache = getSimulatorCatalogCache();
      renderBraceletLayoutSimulator(cache.stones, cache.charms, cache.spacers);
    });
  });
  if (DOM.btnSimulatorResetLayout) {
    DOM.btnSimulatorResetLayout.addEventListener('click', () => {
      resetSimulatorLayout();
      const cache = getSimulatorCatalogCache();
      renderBraceletLayoutSimulator(cache.stones, cache.charms, cache.spacers);
      showToast('Layout reset to default order.');
    });
  }
  if (DOM.btnSimulatorSaveLayout) {
    DOM.btnSimulatorSaveLayout.addEventListener('click', async () => {
      const originalText = DOM.btnSimulatorSaveLayout.textContent;
      DOM.btnSimulatorSaveLayout.disabled = true;
      DOM.btnSimulatorSaveLayout.textContent = 'Saving...';

      try {
        CRMState.simulatorLayout = await saveSharedCatalogLayoutOrder(getCatalogLayoutDraft());
        CRMState.simulatorLayoutLoaded = true;
        showToast('Catalog layout saved to shared settings.');
        const cache = getSimulatorCatalogCache();
        renderBraceletLayoutSimulator(cache.stones, cache.charms, cache.spacers);
      } catch (error) {
        console.error('Failed to save catalog layout to shared settings', error);
        showToast('Production layout save failed. Draft is still kept locally.');
      } finally {
        DOM.btnSimulatorSaveLayout.disabled = false;
        DOM.btnSimulatorSaveLayout.textContent = originalText;
      }
    });
  }
  if (DOM.btnOpenAddCategoryModal) {
    DOM.btnOpenAddCategoryModal.addEventListener('click', openAddCategoryForm);
  }
  if (DOM.btnCategoryModalClose) {
    DOM.btnCategoryModalClose.addEventListener('click', closeCategoryForm);
  }
  if (DOM.btnCancelCategoryForm) {
    DOM.btnCancelCategoryForm.addEventListener('click', closeCategoryForm);
  }
  if (DOM.categoryCrudForm) {
    DOM.categoryCrudForm.addEventListener('submit', handleSaveCategoryType);
  }
  if (DOM.crudCategoryId) {
    DOM.crudCategoryId.addEventListener('input', () => {
      if (!DOM.crudCategoryId.readOnly) {
        DOM.crudCategorySlug.value = normalizeCategoryKey(DOM.crudCategoryId.value);
      }
    });
  }
  if (DOM.categoriesSearch) {
    DOM.categoriesSearch.addEventListener('input', () => loadDashboardData());
  }
  if (DOM.categoriesScopeFilter) {
    DOM.categoriesScopeFilter.addEventListener('change', () => loadDashboardData());
  }
  if (DOM.categoriesStatusFilter) {
    DOM.categoriesStatusFilter.addEventListener('change', () => loadDashboardData());
  }
  if (DOM.categoriesSort) {
    DOM.categoriesSort.addEventListener('change', () => loadDashboardData());
  }
  DOM.btnOpenAddCharmModal.addEventListener('click', openAddCharmForm);
  DOM.btnCharmModalClose.addEventListener('click', closeCharmForm);
  DOM.btnCancelCharmForm.addEventListener('click', closeCharmForm);
  DOM.charmCrudForm.addEventListener('submit', handleSaveCharmType);
  if (DOM.crudCharmImageFile) {
    DOM.crudCharmImageFile.addEventListener('change', async (event) => {
      const file = event.target.files?.[0] || null;
      try {
        if (!file) {
          resetImageUploadState("Charm");
          updateImagePreview(DOM.crudCharmImagePreview, DOM.crudCharmImage.value);
          return;
        }
        const pending = await prepareImageSelection("Charm", file);
        updateImagePreview(DOM.crudCharmImagePreview, pending?.dataUrl || "");
        setUploadStatus(DOM.crudCharmUploadStatus, `Ready to upload: ${file.name}`, "info");
      } catch (err) {
        console.error(err);
        setUploadStatus(DOM.crudCharmUploadStatus, err.message || "Unable to read image file.", "warn");
      }
    });
  }
  if (DOM.btnUploadCharmImage) {
    DOM.btnUploadCharmImage.addEventListener('click', async () => {
      try {
        await uploadImageToMediaService("Charm");
      } catch (err) {
        console.error(err);
        setUploadStatus(DOM.crudCharmUploadStatus, err.message || "Image upload failed.", "warn");
        showToast(err.message || "Image upload failed.");
      }
    });
  }
  if (DOM.crudCharmImage) {
    DOM.crudCharmImage.addEventListener('input', () => {
      CRMState.pendingCharmImage = null;
      if (DOM.crudCharmImageFile) DOM.crudCharmImageFile.value = "";
      setUploadStatus(DOM.crudCharmUploadStatus, "Manual URL updated. File selection cleared.", "info");
      updateImagePreview(DOM.crudCharmImagePreview, DOM.crudCharmImage.value);
    });
  }
  if (DOM.charmsSearch) {
    DOM.charmsSearch.addEventListener('input', () => loadDashboardData());
  }
  if (DOM.charmsSort) {
    DOM.charmsSort.addEventListener('change', () => loadDashboardData());
  }
  if (DOM.charmsActiveFilter) {
    DOM.charmsActiveFilter.addEventListener('change', () => loadDashboardData());
  }
  if (DOM.charmsStockFilter) {
    DOM.charmsStockFilter.addEventListener('change', () => loadDashboardData());
  }
  if (DOM.charmsCollectionFilter) {
    DOM.charmsCollectionFilter.addEventListener('change', () => loadDashboardData());
  }
  if (DOM.categoriesTableBody) {
    DOM.categoriesTableBody.addEventListener('change', async (event) => {
      const target = event.target;
      const categoryId = target?.dataset?.categoryId;
      if (!categoryId) return;

      if (target.classList.contains('category-order-input')) {
        const nextOrder = Number(target.value);
        if (!Number.isFinite(nextOrder)) {
          await loadDashboardData();
          return;
        }
        await saveCategoryQuickField(categoryId, { displayOrder: nextOrder }, 'Updated category order');
      }

      if (target.classList.contains('category-toggle-input')) {
        await saveCategoryQuickField(categoryId, { isActive: target.checked }, target.checked ? 'Activated category' : 'Deactivated category');
      }
    });
  }
  if (DOM.inventoryTableBody) {
    DOM.inventoryTableBody.addEventListener('change', async (event) => {
      const target = event.target;
      if (!target?.classList?.contains('inventory-stock-input')) return;
      const itemType = target.dataset.itemType;
      const itemId = target.dataset.itemId;
      const stockQty = Number(target.value);
      if (!itemType || !itemId || !Number.isFinite(stockQty)) {
        await loadDashboardData();
        return;
      }
      await saveInventoryStockQty(itemType, itemId, stockQty);
    });
  }
  if (DOM.charmsTableBody) {
    DOM.charmsTableBody.addEventListener('change', async (event) => {
      const target = event.target;
      const charmId = target?.dataset?.charmId;
      if (!charmId) return;

      if (target.classList.contains('charm-order-input')) {
        const nextOrder = Number(target.value);
        if (!Number.isFinite(nextOrder)) {
          await loadDashboardData();
          return;
        }
        await saveCharmQuickField(charmId, { displayOrder: nextOrder }, 'Updated talisman order');
      }

      if (target.classList.contains('charm-stock-input')) {
        const stockQty = normalizeStockQtyForCrm(target.value, 0);
        await saveCharmQuickField(charmId, {
          availability: {
            stockQty,
            inStock: stockQty > 0
          }
        }, `Updated talisman stock to ${stockQty}`);
        return;
      }

      if (target.classList.contains('charm-toggle-input')) {
        const field = target.dataset.field;
        if (field === 'isActive') {
          await saveCharmQuickField(charmId, { availability: { isActive: target.checked } }, target.checked ? 'Marked talisman visible' : 'Marked talisman hidden');
        } else if (field === 'inStock') {
          const charms = await getSharedCharmCatalog();
          const charm = charms.find((entry) => entry.id === charmId);
          const stockQty = target.checked ? Math.max(1, getCrmStockQty(charm)) : 0;
          await saveCharmQuickField(charmId, { availability: { stockQty, inStock: target.checked && stockQty > 0 } }, target.checked ? 'Marked talisman in stock' : 'Marked talisman out of stock');
        }
      }
    });
  }

  DOM.analyticsRangeButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const nextRange = button.dataset.analyticsRange || '7d';
      if (CRMState.analyticsRange === nextRange && !CRMState.analyticsLoading) return;
      CRMState.analyticsRange = nextRange;
      syncAnalyticsRangeButtons();
      if (CRMState.activeTab === 'analytics') {
        renderAnalyticsSummary(await fetchAnalyticsSummary(nextRange));
      }
    });
  });

  if (DOM.btnRefreshAnalytics) {
    DOM.btnRefreshAnalytics.addEventListener('click', async () => {
      if (CRMState.activeTab === 'analytics') {
        renderAnalyticsSummary(await fetchAnalyticsSummary(CRMState.analyticsRange));
      }
    });
  }
  
  // Orders filters
  DOM.orderStatusFilter.addEventListener('change', () => loadDashboardData());
  DOM.ordersSearch.addEventListener('input', () => loadDashboardData());
  
  // Invoice action bindings
  DOM.btnInvoiceModalClose.addEventListener('click', closeInvoiceModal);
  DOM.btnPrintInvoice.addEventListener('click', triggerPrint);
  DOM.btnCopyInvoiceMessage.addEventListener('click', copyLINEInvoiceSummary);
  if (DOM.btnOrderDetailModalClose) {
    DOM.btnOrderDetailModalClose.addEventListener('click', closeOrderDetailModal);
  }
  if (DOM.orderDetailModal) {
    DOM.orderDetailModal.addEventListener('click', (event) => {
      if (event.target === DOM.orderDetailModal) {
        closeOrderDetailModal();
      }
    });
  }
  
  // Global settings form submit
  DOM.globalSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const discountVal = parseInt(DOM.globalDiscountPercent.value);
    
    if (isNaN(discountVal) || discountVal < 0 || discountVal > 100) {
      alert("Please enter a valid percentage between 0 and 100.");
      return;
    }
    
    const settings = await getSharedSettings();
    settings.globalDiscountPercent = discountVal;
    settings.discountEnabled = DOM.discountEnabled ? DOM.discountEnabled.checked : true;
    settings.showDiscountBanner = settings.discountEnabled;
    
    await saveSharedSettings(settings);
    addLog(`Changed global discount rate to ${discountVal}% and discount ${settings.discountEnabled ? 'enabled' : 'disabled'}.`);
    showToast(`Global settings saved.`);
    await loadDashboardData();
  });
  
  // Reset database controls
  DOM.btnResetDatabase.addEventListener('click', async () => {
    const proceed = await showCustomConfirm(
      "WARNING: Are you sure you want to reset the entire database to original seed defaults? This will erase all customer orders, custom stones, and setting rates in the database!",
      "Reset Database"
    );
    if (proceed) {
      try {
        const res = await fetch("/api/reset", { method: "POST" });
        if (res.ok) {
          addLog("Database reset to defaults.", "warn");
          showToast("Database reset successful!");
          window.location.reload();
        } else {
          alert("Reset failed: " + res.statusText);
        }
      } catch (err) {
        alert("Failed to connect to reset API: " + err.message);
      }
    }
  });
  
  // Seed demo orders
  DOM.btnSeedDemoOrders.addEventListener('click', async () => {
    await seedDemoOrders();
  });
}

// Sandbox demo order generator
async function seedDemoOrders() {
  // Let's seed 3 realistic looking bracelet order logs
  const demoOrders = [
    {
      customerName: "Khun Somchai",
      wristSize: 16.5,
      beadSize: "8",
      totalBeads: 22,
      beads: [
        { stoneId: "golden_rutile", name: "Golden Rutile Quartz", nameTh: "ไหมทอง", color: "#E2C974", image: "assets/golden_rutile.png", size: 8 },
        { stoneId: "golden_rutile", name: "Golden Rutile Quartz", nameTh: "ไหมทอง", color: "#E2C974", image: "assets/golden_rutile.png", size: 8 },
        { stoneId: "tigers_eye", name: "Tiger's Eye", nameTh: "ไทเกอร์อาย", color: "#B07C3D", image: "assets/tigers_eye.png", size: 8 },
        { stoneId: "tigers_eye", name: "Tiger's Eye", nameTh: "ไทเกอร์อาย", color: "#B07C3D", image: "assets/tigers_eye.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "golden_rutile", name: "Golden Rutile Quartz", nameTh: "ไหมทอง", color: "#E2C974", image: "assets/golden_rutile.png", size: 8 },
        { stoneId: "golden_rutile", name: "Golden Rutile Quartz", nameTh: "ไหมทอง", color: "#E2C974", image: "assets/golden_rutile.png", size: 8 },
        { stoneId: "tigers_eye", name: "Tiger's Eye", nameTh: "ไทเกอร์อาย", color: "#B07C3D", image: "assets/tigers_eye.png", size: 8 },
        { stoneId: "tigers_eye", name: "Tiger's Eye", nameTh: "ไทเกอร์อาย", color: "#B07C3D", image: "assets/tigers_eye.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "golden_rutile", name: "Golden Rutile Quartz", nameTh: "ไหมทอง", color: "#E2C974", image: "assets/golden_rutile.png", size: 8 },
        { stoneId: "golden_rutile", name: "Golden Rutile Quartz", nameTh: "ไหมทอง", color: "#E2C974", image: "assets/golden_rutile.png", size: 8 },
        { stoneId: "tigers_eye", name: "Tiger's Eye", nameTh: "ไทเกอร์อาย", color: "#B07C3D", image: "assets/tigers_eye.png", size: 8 },
        { stoneId: "tigers_eye", name: "Tiger's Eye", nameTh: "ไทเกอร์อาย", color: "#B07C3D", image: "assets/tigers_eye.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "golden_rutile", name: "Golden Rutile Quartz", nameTh: "ไหมทอง", color: "#E2C974", image: "assets/golden_rutile.png", size: 8 }
      ],
      subtotal: 2780,
      discountPercent: 20,
      discountAmount: 556,
      netPrice: 2224,
      status: "Payment Received",
      configurationCode: "eyJ3IjoxNi41LCJiIjoiOCIsIm4iOiJLaHVuIFNvbWNoYWkiLCJzIjpbeyJpIjoiZ29sZGVuX3J1dGlsZSIsInoiOjR9XX0="
    },
    {
      customerName: "Khun Lalita",
      wristSize: 15.0,
      beadSize: "6",
      totalBeads: 27,
      beads: [
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "rose_quartz", name: "Rose Quartz", nameTh: "โรสควอตซ์", color: "#FFCAD4", image: "assets/rose_quartz.png", size: 6 },
        { stoneId: "amethyst", name: "Amethyst", nameTh: "อเมทิสต์", color: "#9F86C0", image: "assets/amethyst.png", size: 6 }
      ],
      subtotal: 2820,
      discountPercent: 20,
      discountAmount: 564,
      netPrice: 2256,
      status: "New Order",
      configurationCode: "eyJuIjoiS2h1biBMYWxpdGEiLCJ3IjoxNS4wLCJiIjoiNiIsInMiOlt7ImkiOiJyb3NlX3F1YXJ0eiIsInoiOjZ9XX0="
    },
    {
      customerName: "Khun Tanakorn",
      wristSize: 18.0,
      beadSize: "mixed",
      totalBeads: 28,
      beads: [
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 },
        { stoneId: "lapis_lazuli", name: "Lapis Lazuli", nameTh: "ลาพิส ลาซูลี", color: "#2A4B7C", image: "assets/lapis_lazuli.png", size: 6 },
        { stoneId: "green_aventurine", name: "Green Aventurine", nameTh: "กรีน อเวนเจอรีน", color: "#6E9A82", image: "assets/green_aventurine.png", size: 6 },
        { stoneId: "black_obsidian", name: "Black Obsidian", nameTh: "ออบซิเดียน", color: "#1E1E1E", image: "assets/black_obsidian.png", size: 8 }
      ],
      subtotal: 2980,
      discountPercent: 20,
      discountAmount: 596,
      netPrice: 2384,
      status: "Shipped",
      configurationCode: "eyJuIjoiS2h1biBUYW5ha29ybiIsInciOjE4LjAsImIiOiJtaXhlZCIsInMiOlt7ImkiOiJibGFja19vYnNpZGlhbiIsInoiOjh9XX0="
    }
  ];
  
  const currentOrders = await getSharedOrders();
  for (const o of demoOrders) {
    // Avoid double seeding if items already exist
    if (!currentOrders.some(co => co.customerName === o.customerName)) {
      await addSharedOrder(o);
    }
  }
  
  addLog("Seeded 3 demo sandbox orders into database.");
  showToast("Demo orders seeded!");
  await loadDashboardData();
}

// Toast notification helper
function showToast(message) {
  const toast = DOM.crmToast;
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
