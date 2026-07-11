import { 
  getCategoryLabelById,
  getSharedCatalog, 
  getSharedCharmCatalog,
  getSharedCategoryCatalog,
  saveSharedCharmCatalogEntry,
  deleteSharedCharmCatalogEntry,
  saveSharedCategoryCatalogEntry,
  deleteSharedCategoryCatalogEntry,
  saveSharedCatalog, 
  deleteSharedCatalog,
  getSharedSettings, 
  saveSharedSettings, 
  getSharedOrders, 
  updateOrderStatus,
  refreshCatalog,
  refreshCategoryCatalog,
  refreshCharmCatalog,
  STONES,
  ORDERS,
  SETTINGS,
  getStonePriceForSize,
  addSharedOrder
} from './data.js';

// ==========================================
// 1. CRM Application State
// ==========================================
const CRMState = {
  sessionActive: false,
  activeTab: 'overview', // 'overview', 'inventory', 'categories', 'charms', 'orders', 'settings'
  activeEditStoneId: null, // null when creating, stoneId when editing
  activeEditStoneColor: '#E2C974',
  activeEditCharmId: null,
  activeEditCategoryId: null,
  pendingStoneImage: null,
  pendingCharmImage: null,
  charmSort: 'displayOrder-asc',
  charmActiveFilter: 'all',
  charmStockFilter: 'all',
  charmCollectionFilter: 'all',
  categorySort: 'displayOrder-asc',
  categoryScopeFilter: 'all',
  categoryStatusFilter: 'all',
  categorySearch: '',
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
    inventory: document.getElementById('btnTabInventory'),
    categories: document.getElementById('btnTabCategories'),
    charms: document.getElementById('btnTabCharms'),
    orders: document.getElementById('btnTabOrders'),
    settings: document.getElementById('btnTabSettings')
  },
  mobileNavButtons: {
    overview: document.getElementById('btnMobTabOverview'),
    inventory: document.getElementById('btnMobTabInventory'),
    categories: document.getElementById('btnMobTabCategories'),
    charms: document.getElementById('btnMobTabCharms'),
    orders: document.getElementById('btnMobTabOrders'),
    settings: document.getElementById('btnMobTabSettings')
  },
  
  // Tab Content Views
  tabViews: {
    overview: document.getElementById('tabOverview'),
    inventory: document.getElementById('tabInventory'),
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
  
  // Tab 2: Inventory CRUD
  inventorySearch: document.getElementById('inventorySearch'),
  btnOpenAddStoneModal: document.getElementById('btnOpenAddStoneModal'),
  inventoryTableBody: document.getElementById('inventoryTableBody'),

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
  imageEl.src = value || IMAGE_PREVIEW_PLACEHOLDER;
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
  imageEl.src = value || IMAGE_THUMB_PLACEHOLDER;
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
  showToast(`${kind} image uploaded.`);
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
    inventory: "Stone Inventory Manager (Module A)",
    categories: "Catalog Category Manager",
    charms: "Shared Charm Catalog Management",
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
  
  await Promise.all([
    refreshCatalog(),
    refreshCategoryCatalog(),
    refreshCharmCatalog()
  ]);
  
  setTimeout(async () => {
    DOM.syncIndicator.className = 'sync-status text-green';
    DOM.syncIndicator.innerHTML = '<span class="pulse-dot"></span> Real-time Connected';
    
    addLog(`Database synchronized (${keyName}).`);
    await loadDashboardData();
  }, 400);
}

// ==========================================
// 7. Load / Calculate Dashboard Stats
// ==========================================
async function loadDashboardData() {
  const stones = await getSharedCatalog();
  const categories = await getSharedCategoryCatalog();
  const charms = await getSharedCharmCatalog();
  const orders = await getSharedOrders();
  const settings = await getSharedSettings();
  
  // Calculate Metric values
  const totalOrdersCount = orders.length;
  
  const netRevenueAmount = orders.reduce((sum, order) => sum + (order.netPrice || 0), 0);
  
  const activeStonesCount = stones.filter(s => s.inStock !== false).length;
  const oosStonesCount = stones.filter(s => s.inStock === false).length;
  
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
    renderInventoryCatalog(stones);
  } else if (CRMState.activeTab === 'categories') {
    renderCategoryCatalog(categories, stones, charms);
  } else if (CRMState.activeTab === 'charms') {
    renderCharmCatalog(charms, categories);
  } else if (CRMState.activeTab === 'orders') {
    renderOrdersList(orders);
  } else if (CRMState.activeTab === 'settings') {
    DOM.globalDiscountPercent.value = globalDiscountRateVal;
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
        <span class="ro-price">฿${(order.netPrice || 0).toLocaleString()}</span>
      </div>
    `;
    DOM.overviewRecentOrders.appendChild(item);
  });
}

// ==========================================
// 8. Tab 2: Stone Inventory CRUD (Module A)
// ==========================================
function renderInventoryCatalog(stones) {
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
    const isAvailable = stone.inStock !== false;
    const stockBadge = isAvailable 
      ? '<span class="badge badge-in-stock">In Stock</span>' 
      : '<span class="badge badge-out-of-stock">Out of Stock</span>';
    
    tr.innerHTML = `
      <td data-label="Bead">
        <img class="table-bead-img inventory-stone-img" src="${stone.image}" alt="${stone.name}" onerror="this.src='${IMAGE_THUMB_PLACEHOLDER}'">
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

function getCategoryScopeLabel(entityType) {
  return entityType === 'charm' ? 'Charm' : 'Stone';
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
          <span>Charms: ${usage.charmCount}</span>
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
      const isInStock = charm.availability?.inStock !== false;
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
    DOM.charmsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No matching charms found.</td></tr>';
    return;
  }

  filtered.forEach((charm) => {
    const imageSrc = charm.image?.primary || '';
    const sizeCm = Number(charm.business?.sizeCm || 0);
    const price = Number(charm.pricing?.base || 0);
    const isInStock = charm.availability?.inStock !== false;
    const isActive = charm.availability?.isActive !== false;
    const categoryLabel = getCategoryLabelById(charm.collection || charm.categoryId, 'charm');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Image">
        <img class="table-bead-img charm-admin-img" src="${imageSrc}" alt="${charm.name?.en || charm.id}" onerror="this.src='${IMAGE_THUMB_PLACEHOLDER}'">
      </td>
      <td data-label="Charm">
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
          ${formatCharmStatusBadge(isInStock ? 'In Stock' : 'Out of Stock', isInStock)}
        </div>
      </td>
      <td data-label="Render Tuning Summary">
        <div class="tuning-chip-row">${formatCharmTuningSummary(charm)}</div>
      </td>
      <td data-label="Actions">
        <div class="action-btns charm-action-btns">
          <button class="action-btn edit" data-id="${charm.id}" title="Edit Charm business fields">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${charm.id}" title="Delete Charm">
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
  DOM.charmModalTitle.textContent = "Add New Charm";
  DOM.charmCrudForm.reset();
  DOM.crudCharmRecordId.value = "";
  DOM.crudCharmId.disabled = false;
  DOM.crudCharmInStock.checked = true;
  DOM.crudCharmIsActive.checked = true;
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
  const charms = await getSharedCharmCatalog();
  const charm = charms.find((entry) => entry.id === charmId);
  if (!charm) return;

  const categories = await getSharedCategoryCatalog('all');
  syncCategoryAssignmentSelects(categories, '', charm.collection || charm.categoryId);

  CRMState.activeEditCharmId = charmId;
  DOM.charmModalTitle.textContent = `Edit Charm: ${charm.name?.th || charm.id}`;
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
  DOM.crudCharmMeaningTh.value = charm.meaning?.th || "";
  DOM.crudCharmMeaningEn.value = charm.meaning?.en || "";
  DOM.crudCharmInStock.checked = charm.availability?.inStock !== false;
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
      inStock: DOM.crudCharmInStock.checked,
      isActive: DOM.crudCharmIsActive.checked
    },
    renderTuning: existingCharm?.renderTuning || {},
    displayOrder: Number(DOM.crudCharmDisplayOrder.value || 0)
  };

  const saved = await saveSharedCharmCatalogEntry(normalizedRecord);
  if (saved) {
    if (CRMState.activeEditCharmId) {
      addLog(`Edited charm ID '${saved.id}' (${saved.name?.th || saved.name?.en}).`);
      showToast("Charm details updated!");
    } else {
      addLog(`Created new charm ID '${saved.id}' (${saved.name?.th || saved.name?.en}).`);
      showToast("New charm added to catalog!");
    }
  }

  closeCharmForm();
  await loadDashboardData();
}

async function deleteCharmType(charmId) {
  const charms = await getSharedCharmCatalog();
  const charm = charms.find((entry) => entry.id === charmId);
  if (!charm) return;

  const proceed = await showCustomConfirm(
    `Are you sure you want to delete '${charm.name?.th || charm.id} (${charm.sku || charm.id})' from the charm catalog?`,
    "Delete Charm"
  );

  if (proceed) {
    const success = await deleteSharedCharmCatalogEntry(charmId);
    if (success) {
      addLog(`Deleted charm ID '${charmId}' (${charm.name?.th || charm.name?.en}).`, 'warn');
      showToast("Charm deleted.");
      await loadDashboardData();
    }
  }
}

// Form Opening & Resetting
async function openAddStoneForm() {
  CRMState.activeEditStoneId = null;
  CRMState.activeEditStoneColor = '#E2C974';
  DOM.stoneModalTitle.textContent = "Add New Stone Type";
  DOM.crudStoneId.value = "";
  DOM.stoneCrudForm.reset();
  DOM.crudStoneInStock.checked = true;
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
  const stones = await getSharedCatalog();
  const stone = stones.find(s => s.id === stoneId);
  if (!stone) return;

  const categories = await getSharedCategoryCatalog('all');
  syncCategoryAssignmentSelects(categories, stone.categoryId || stone.category);
  
  CRMState.activeEditStoneId = stoneId;
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
  DOM.crudStoneInStock.checked = stone.inStock !== false;
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
  const inStock = DOM.crudStoneInStock.checked;
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
    inStock: inStock,
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
  const stones = await getSharedCatalog();
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
  if (Array.isArray(order.charms) && order.charms.length > 0) {
    return aggregateOrderDetailItems(
      order.charms,
      (charm) => `${charm.id || charm.charmId || charm.sku || charm.nameEn || charm.nameTh || 'charm'}_${charm.sizeCm || ''}`,
      (charm) => {
        const name = charm.nameTh && charm.nameEn
          ? `${charm.nameTh} (${charm.nameEn})`
          : charm.nameEn || charm.nameTh || charm.sku || charm.id || 'Charm';
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
  return aggregateOrderDetailItems(
    Array.isArray(order.beads) ? order.beads : [],
    (bead) => `${bead.stoneId || bead.name || bead.nameTh || 'stone'}_${bead.size || ''}`,
    (bead) => {
      const name = bead.nameTh && bead.name
        ? `${bead.nameTh} (${bead.name})`
        : bead.name || bead.nameTh || bead.stoneId || 'Stone';
      return `${name}${bead.size ? ` - ${bead.size}mm` : ''}`;
    }
  );
}

function getOrderSpacerDetailEntries(order = {}) {
  return aggregateOrderDetailItems(
    Array.isArray(order.spacers) ? order.spacers : [],
    (spacer) => `${spacer.spacerId || spacer.nameEn || spacer.nameTh || 'spacer'}_${spacer.effectiveLengthMm || spacer.displaySizeMm || ''}`,
    (spacer) => {
      const name = spacer.nameTh && spacer.nameEn
        ? `${spacer.nameTh} (${spacer.nameEn})`
        : spacer.nameEn || spacer.nameTh || spacer.spacerId || 'Spacer';
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
  const charmCount = Array.isArray(order.charms) && order.charms.length > 0
    ? order.charms.length
    : (order.hasCharm ? (Number(order.charmCount || 1) || 1) : 0);
  const spacerCount = Number(order.spacerCount || (Array.isArray(order.spacers) ? order.spacers.length : 0)) || 0;
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
    const charmText = order.hasCharm ? `${order.charmNameEn || order.charmNameTh || 'Charm'} (${Number(order.charmSizeCm || 0).toFixed(1)} cm)` : 'No Charm';
    const spacerText = order.hasSpacer ? `${order.spacerCount} spacers` : 'No Spacer';
    
    // Render visual bead sequence inline
    const beadMapNodeHtmls = (order.beads || []).map((bead, bIndex) => {
      // Map size to visual class
      const sizeClass = `size-${bead.size || 6}`;
      const tooltip = `${bIndex + 1}. ${bead.nameTh} (${bead.size}mm)`;
      return `
        <div class="bead-map-node ${sizeClass}" style="background-color: ${bead.color || '#E2E8F0'}" data-tooltip="${tooltip}">
          <img src="${bead.image}" alt="" onerror="this.style.display='none'">
        </div>
      `;
    }).join('');
    
    const beadMapContainerHtml = `<div class="bead-map-canvas">${beadMapNodeHtmls}</div>`;
    
    // Price summary details
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
        <div style="font-size: 11px; color: var(--color-navy-muted);">Charm: ${charmText}</div>
        <div style="font-size: 11px; color: var(--color-navy-muted);">Spacer: ${spacerText}</div>
      </td>
      <td data-label="Bead Map">${beadMapContainerHtml}</td>
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
  if (!order?.hasCharm) return 'No Charm';
  const charmName = order.charmNameTh && order.charmNameEn
    ? `${order.charmNameTh} (${order.charmNameEn})`
    : order.charmNameEn || order.charmNameTh || 'Charm';
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
  if (!order?.hasSpacer || !Array.isArray(order.spacers) || order.spacers.length === 0) return 'No Spacer';
  const spacerDetails = order.spacers.reduce((acc, spacer) => {
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
        <strong>${detailMoneyValue(order.netPrice)}</strong>
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
          <h5>Charms</h5>
          ${renderOrderDetailList(getOrderCharmDetailEntries(order))}
        </div>
        <div class="order-detail-subsection">
          <h5>Spacers</h5>
          ${renderOrderDetailList(getOrderSpacerDetailEntries(order))}
        </div>
      </section>

      <section class="order-detail-section">
        <h4>Pricing</h4>
        ${renderOrderDetailFields([
          { label: 'Subtotal', value: detailMoneyValue(order.subtotal), rawHtml: true },
          { label: 'Discount Percent', value: order.discountPercent !== undefined ? `${order.discountPercent}%` : '' },
          { label: 'Discount Amount', value: detailMoneyValue(order.discountAmount), rawHtml: true },
          { label: 'Final Total', value: detailMoneyValue(order.netPrice), rawHtml: true },
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
  
  DOM.invSubtotal.textContent = `฿${order.subtotal.toLocaleString()}`;
  DOM.invDiscountLabel.textContent = `LINE Special Discount (${order.discountPercent}%):`;
  DOM.invDiscountAmount.textContent = `-฿${order.discountAmount.toLocaleString()}`;
  DOM.invNetTotal.textContent = `฿${order.netPrice.toLocaleString()}`;
  
  DOM.invConfigCode.textContent = order.configurationCode;
  
  // 1. Draw SVG bead layout map strip
  drawInvoiceSvgBeadMap(order.beads);
  
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
        <div style="font-weight:600; color:#1e293b;">${order.charmNameTh || 'Charm'}</div>
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
          <div style="font-weight:600; color:#1e293b;">${spacer.nameTh || 'Spacer'}</div>
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
  
  const lines = [];
  lines.push(`🔮 *LUCKY.COLORSTONE Order Bill* 🔮`);
  lines.push(`Order ID: ${order.id}`);
  lines.push(`----------------------------------`);
  lines.push(`👤 Customer Name: ${order.customerName}`);
  lines.push(`📏 Wrist Specs: ${order.wristSize.toFixed(1)} cm`);
  lines.push(`💎 Bead size: ${order.beadSize === 'mixed' ? 'Mixed Sizes' : order.beadSize + 'mm'}`);
  lines.push(`📿 Total Beads: ${order.totalBeads} beads`);
  lines.push(`✨ Charm: ${getOrderCharmDisplayText(order)}`);
  if (order.hasSpacer && Array.isArray(order.spacers) && order.spacers.length > 0) {
    const spacerDetails = order.spacers.reduce((acc, spacer) => {
      const key = `${spacer.nameTh || spacer.nameEn} (${spacer.displaySizeMm || 6}mm)`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const spacerStrings = Object.entries(spacerDetails).map(([name, count]) => `${name} x ${count} ชิ้น`);
    lines.push(`✨ Spacers: ${spacerStrings.join(', ')}`);
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
    const query = DOM.inventorySearch.value.trim();
    loadDashboardData();
  });
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
        await saveCharmQuickField(charmId, { displayOrder: nextOrder }, 'Updated charm order');
      }

      if (target.classList.contains('charm-toggle-input')) {
        const field = target.dataset.field;
        if (field === 'isActive') {
          await saveCharmQuickField(charmId, { availability: { isActive: target.checked } }, target.checked ? 'Marked charm visible' : 'Marked charm hidden');
        } else if (field === 'inStock') {
          await saveCharmQuickField(charmId, { availability: { inStock: target.checked } }, target.checked ? 'Marked charm in stock' : 'Marked charm out of stock');
        }
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
    
    await saveSharedSettings(settings);
    addLog(`Changed global discount rate to ${discountVal}%.`);
    showToast(`Global discount saved: ${discountVal}%`);
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
