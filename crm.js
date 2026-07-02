import { 
  CATEGORIES, 
  getSharedCatalog, 
  getSharedCharmCatalog,
  saveSharedCharmCatalogEntry,
  deleteSharedCharmCatalogEntry,
  saveSharedCatalog, 
  deleteSharedCatalog,
  getSharedSettings, 
  saveSharedSettings, 
  getSharedOrders, 
  updateOrderStatus,
  refreshCatalog,
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
  activeTab: 'overview', // 'overview', 'inventory', 'charms', 'orders', 'settings'
  activeEditStoneId: null, // null when creating, stoneId when editing
  activeEditCharmId: null,
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
    charms: document.getElementById('btnTabCharms'),
    orders: document.getElementById('btnTabOrders'),
    settings: document.getElementById('btnTabSettings')
  },
  mobileNavButtons: {
    overview: document.getElementById('btnMobTabOverview'),
    inventory: document.getElementById('btnMobTabInventory'),
    charms: document.getElementById('btnMobTabCharms'),
    orders: document.getElementById('btnMobTabOrders'),
    settings: document.getElementById('btnMobTabSettings')
  },
  
  // Tab Content Views
  tabViews: {
    overview: document.getElementById('tabOverview'),
    inventory: document.getElementById('tabInventory'),
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

  // Tab 3: Charm Catalog
  charmsSearch: document.getElementById('charmsSearch'),
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
  crudStoneColor: document.getElementById('crudStoneColor'),
  crudStoneInStock: document.getElementById('crudStoneInStock'),
  crudStoneMeaningTh: document.getElementById('crudStoneMeaningTh'),
  crudStoneMeaningEn: document.getElementById('crudStoneMeaningEn'),
  btnStoneModalClose: document.getElementById('btnStoneModalClose'),
  btnCancelStoneForm: document.getElementById('btnCancelStoneForm'),

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
  invBeadSvg: document.getElementById('invBeadSvg'),
  invItemsBody: document.getElementById('invItemsBody'),
  invSubtotal: document.getElementById('invSubtotal'),
  invDiscountLabel: document.getElementById('invDiscountLabel'),
  invDiscountAmount: document.getElementById('invDiscountAmount'),
  invNetTotal: document.getElementById('invNetTotal'),
  invConfigCode: document.getElementById('invConfigCode')
};

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
    charms: "Shared Charm Catalog (Read Only)",
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
  
  // Render views based on active tab
  if (CRMState.activeTab === 'overview') {
    renderRecentOrdersList(orders);
  } else if (CRMState.activeTab === 'inventory') {
    renderInventoryCatalog(stones);
  } else if (CRMState.activeTab === 'charms') {
    renderCharmCatalog(charms);
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
    const catName = CATEGORIES[stone.category]?.th || stone.category;
    
    // Stock Status badge
    const isAvailable = stone.inStock !== false;
    const stockBadge = isAvailable 
      ? '<span class="badge badge-in-stock">In Stock</span>' 
      : '<span class="badge badge-out-of-stock">Out of Stock</span>';
    
    tr.innerHTML = `
      <td data-label="Bead">
        <img class="table-bead-img" src="${stone.image}" alt="${stone.name}" style="background-color: ${stone.color || 'transparent'}">
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
      <td data-label="Category"><span class="badge badge-${stone.category}">${catName}</span></td>
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

function formatCharmStatusBadge(label, isActiveState) {
  return isActiveState
    ? `<span class="badge badge-in-stock">${label}</span>`
    : `<span class="badge badge-out-of-stock">${label}</span>`;
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

function renderCharmCatalog(charms) {
  const query = DOM.charmsSearch.value.trim().toLowerCase();
  const filtered = charms
    .slice()
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .filter((charm) => {
      const haystack = [
        charm.id,
        charm.sku,
        charm.name?.th,
        charm.name?.en,
        charm.type,
        charm.collection
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

  DOM.charmsTableBody.innerHTML = '';
  if (filtered.length === 0) {
    DOM.charmsTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No matching charms found.</td></tr>';
    return;
  }

  filtered.forEach((charm) => {
    const imageSrc = charm.image?.primary || '';
    const sizeCm = Number(charm.business?.sizeCm || 0);
    const price = Number(charm.pricing?.base || 0);
    const isInStock = charm.availability?.inStock !== false;
    const isActive = charm.availability?.isActive !== false;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Image">
        <img class="table-bead-img charm-admin-img" src="${imageSrc}" alt="${charm.name?.en || charm.id}" onerror="this.style.display='none'">
      </td>
      <td data-label="Charm">
        <div class="stone-title-th">${charm.name?.th || '-'}</div>
        <div class="stone-title-en">${charm.name?.en || '-'}</div>
        <div class="charm-meta-stack">
          <span>ID: <strong>${charm.id}</strong></span>
          <span>SKU: <strong>${charm.sku || '-'}</strong></span>
          <span>Type: <strong>${charm.type || '-'}</strong></span>
          <span>Collection: <strong>${charm.collection || '-'}</strong></span>
        </div>
      </td>
      <td data-label="Business">
        <div class="charm-business-stack">
          <span>Size: <strong>${sizeCm ? `${sizeCm.toFixed(1)} cm` : '-'}</strong></span>
          <span>Price: <strong>฿${price.toLocaleString()}</strong></span>
          <span>Order: <strong>${charm.displayOrder ?? '-'}</strong></span>
        </div>
      </td>
      <td data-label="Status">
        <div class="charm-status-stack">
          ${formatCharmStatusBadge(isInStock ? 'In Stock' : 'Out of Stock', isInStock)}
          ${formatCharmStatusBadge(isActive ? 'Active' : 'Inactive', isActive)}
        </div>
      </td>
      <td data-label="Render Tuning">
        <div class="tuning-chip-row">${formatCharmTuningSummary(charm)}</div>
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

function openAddCharmForm() {
  CRMState.activeEditCharmId = null;
  DOM.charmModalTitle.textContent = "Add New Charm";
  DOM.charmCrudForm.reset();
  DOM.crudCharmRecordId.value = "";
  DOM.crudCharmId.disabled = false;
  DOM.crudCharmInStock.checked = true;
  DOM.crudCharmIsActive.checked = true;
  DOM.crudCharmDisplayOrder.value = "";
  setReadOnlyCharmTuning({});
  DOM.charmCrudModal.classList.add('show');
}

async function openEditCharmForm(charmId) {
  const charms = await getSharedCharmCatalog();
  const charm = charms.find((entry) => entry.id === charmId);
  if (!charm) return;

  CRMState.activeEditCharmId = charmId;
  DOM.charmModalTitle.textContent = `Edit Charm: ${charm.name?.th || charm.id}`;
  DOM.crudCharmRecordId.value = charm.id;
  DOM.crudCharmId.value = charm.id;
  DOM.crudCharmId.disabled = true;
  DOM.crudCharmSku.value = charm.sku || "";
  DOM.crudCharmNameEn.value = charm.name?.en || "";
  DOM.crudCharmNameTh.value = charm.name?.th || "";
  DOM.crudCharmType.value = charm.type || "";
  DOM.crudCharmCollection.value = charm.collection || "";
  DOM.crudCharmImage.value = charm.image?.primary || "";
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
function openAddStoneForm() {
  CRMState.activeEditStoneId = null;
  DOM.stoneModalTitle.textContent = "Add New Stone Type";
  DOM.crudStoneId.value = "";
  DOM.stoneCrudForm.reset();
  DOM.crudStoneInStock.checked = true;
  DOM.crudStoneColor.value = "#E2C974";
  DOM.crudStonePriceP4.value = "";
  DOM.crudStonePriceP6.value = "";
  DOM.crudStonePriceP8.value = "";
  
  // Set all size checkboxes checked
  document.querySelectorAll('.crud-size-chk').forEach(c => c.checked = true);
  
  DOM.stoneCrudModal.classList.add('show');
}

async function openEditStoneForm(stoneId) {
  const stones = await getSharedCatalog();
  const stone = stones.find(s => s.id === stoneId);
  if (!stone) return;
  
  CRMState.activeEditStoneId = stoneId;
  DOM.stoneModalTitle.textContent = `Edit Details: ${stone.nameTh}`;
  DOM.crudStoneId.value = stone.id;
  
  DOM.crudStoneNameEn.value = stone.name;
  DOM.crudStoneNameTh.value = stone.nameTh;
  DOM.crudStonePriceP4.value = stone.p4 !== undefined ? stone.p4 : stone.price || 0;
  DOM.crudStonePriceP6.value = stone.p6 !== undefined ? stone.p6 : stone.price || 0;
  DOM.crudStonePriceP8.value = stone.p8 !== undefined ? stone.p8 : stone.price || 0;
  DOM.crudStoneCategory.value = stone.category;
  DOM.crudStoneImage.value = stone.image;
  DOM.crudStoneColor.value = stone.color || "#FFFFFF";
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
  const image = DOM.crudStoneImage.value;
  const color = DOM.crudStoneColor.value;
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
    const success = await deleteSharedCatalog(stoneId);
    if (success) {
      addLog(`Deleted stone ID '${stoneId}' (${stone.nameTh}) from inventory.`, 'warn');
      showToast("Stone type deleted.");
      await loadDashboardData();
    }
  }
}

// ==========================================
// 9. Tab 3: Order Management System (OMS)
// ==========================================
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
      </td>
      <td data-label="Bead Map">${beadMapContainerHtml}</td>
      <td data-label="Pricing">${priceText}</td>
      <td data-label="Status">${statusSelectHtml}</td>
      <td data-label="Invoice" class="text-right">
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
      </td>
    `;
    
    // Event bindings inside rows
    const dropdown = tr.querySelector('.status-dropdown');
    dropdown.addEventListener('change', (e) => handleOrderStatusChange(order.id, e.target.value));
    
    const exportBtn = tr.querySelector('.btn-invoice-export');
    exportBtn.addEventListener('click', () => openInvoiceModal(order.id));
    
    DOM.ordersTableBody.appendChild(tr);
  });
}

async function handleOrderStatusChange(orderId, newStatus) {
  const success = await updateOrderStatus(orderId, newStatus);
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
      <td class="text-right">เธฟ${Number(order.charmPrice || 0).toLocaleString()}</td>
      <td class="text-right" style="font-weight:600; color:#1e293b;">เธฟ${Number(order.charmPrice || 0).toLocaleString()}</td>
    `;
    DOM.invItemsBody.appendChild(tr);
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
  DOM.inventorySearch.addEventListener('input', () => {
    const query = DOM.inventorySearch.value.trim();
    loadDashboardData();
  });
  DOM.btnOpenAddCharmModal.addEventListener('click', openAddCharmForm);
  DOM.btnCharmModalClose.addEventListener('click', closeCharmForm);
  DOM.btnCancelCharmForm.addEventListener('click', closeCharmForm);
  DOM.charmCrudForm.addEventListener('submit', handleSaveCharmType);
  if (DOM.charmsSearch) {
    DOM.charmsSearch.addEventListener('input', () => loadDashboardData());
  }
  
  // Orders filters
  DOM.orderStatusFilter.addEventListener('change', () => loadDashboardData());
  DOM.ordersSearch.addEventListener('input', () => loadDashboardData());
  
  // Invoice action bindings
  DOM.btnInvoiceModalClose.addEventListener('click', closeInvoiceModal);
  DOM.btnPrintInvoice.addEventListener('click', triggerPrint);
  DOM.btnCopyInvoiceMessage.addEventListener('click', copyLINEInvoiceSummary);
  
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
