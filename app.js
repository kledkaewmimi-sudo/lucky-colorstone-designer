import { STONES, CATEGORIES, refreshCatalog, getSharedSettings, addSharedOrder, getStonePriceForSize } from './data.js';

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
  beadSize: '6',            // '4', '6', '8', or 'mixed'
  mixedPlacingSize: 6,      // Default size to place in mixed mode
  ownerName: '',            // Personalized bracelet owner name
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

// ==========================================
// 4. Initialisation
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
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
  
  // Fetch initial catalog from API
  await refreshCatalog();
  
  // Initialise step UI components
  initWristSizeGrid();
  initBeadSizeOptions();
  initCatalogFilters();
  
  // Setup Event Listeners
  setupNavigationEvents();
  setupDesignerEvents();
  setupModalEvents();
  setupLandingEvents();
  
  // Polling for updates every 3 seconds to reflect CRM changes instantly
  setInterval(async () => {
    const updated = await refreshCatalog();
    if (updated) {
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
      State.beadSize = parsed.beadSize || '6';
      State.mixedPlacingSize = parsed.mixedPlacingSize || 6;
      State.ownerName = parsed.ownerName || '';
      State.selectedStones = parsed.selectedStones || [];
      
      // Normalize unique IDs to prevent clashes and empty values
      const seenIds = new Set();
      State.selectedStones.forEach((b, idx) => {
        if (!b.uniqueId || seenIds.has(b.uniqueId)) {
          b.uniqueId = idx + 1;
        }
        seenIds.add(b.uniqueId);
      });
      State.uniqueCounter = State.selectedStones.length;
      
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
    selectedStones: State.selectedStones,
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

async function renderStepViews() {
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
      // Disable next only if no stones are added
      DOM.btnNext.disabled = State.selectedStones.length === 0;
    } else if (State.currentStep === 4) {
      DOM.btnNext.innerHTML = `สั่งซื้อผ่าน LINE &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>`;
      DOM.btnNext.className = 'footer-btn btn-order';
      DOM.btnNext.disabled = false;
    }
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
      await handleLineOrder();
    } else {
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
      const prevBeadSize = State.beadSize;
      const targetBeadSize = card.getAttribute('data-bead-size');
      
      if (prevBeadSize === targetBeadSize) return;

      // Update state immediately without confirm dialog
      State.beadSize = targetBeadSize;
      
      DOM.beadSizeCards.forEach(c => {
        if (c.getAttribute('data-bead-size') === State.beadSize) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
      
      updateEstimationText();
      
      if (State.selectedStones.length > 0) {
        if (State.beadSize === 'mixed') {
          // Keep existing beads but allow mixed sizing
          State.selectedStones.forEach(b => {
            b.size = parseInt(prevBeadSize) || 6;
          });
        } else {
          // Set all existing beads to the new size
          const newSize = parseInt(State.beadSize);
          State.selectedStones.forEach(b => {
            b.size = newSize;
          });
          adjustBeadsToNewCapacity();
        }
      }
      
      saveState();
    });
  });
}

function updateEstimationText() {
  const braceletLenMm = (State.wristSize + TOLERANCE_CM) * 10;
  DOM.estimationWristSizeText.textContent = `${State.wristSize.toFixed(1)} cm`;
  DOM.estimationLengthText.textContent = `${(State.wristSize + TOLERANCE_CM).toFixed(1)} cm (${braceletLenMm}mm)`;
  
  if (State.beadSize === 'mixed') {
    DOM.estimationCapacityText.textContent = `Varies dynamically as you design using 4mm, 6mm, & 8mm stones.`;
  } else {
    const size = parseInt(State.beadSize);
    const capacity = Math.floor(braceletLenMm / size);
    DOM.estimationCapacityText.textContent = `Fits approximately ${capacity} beads (${size}mm).`;
  }
}

function adjustBeadsToNewCapacity() {
  const lenMm = (State.wristSize + TOLERANCE_CM) * 10;
  const size = parseInt(State.beadSize);
  if (isNaN(size)) return; // mixed size bypass
  
  const maxCap = Math.floor(lenMm / size);
  if (State.selectedStones.length > maxCap) {
    State.selectedStones = State.selectedStones.slice(0, maxCap);
    showToast(`Removed trailing beads to fit new size capacity.`);
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

// ==========================================
// 8. Step 3: Interactive Canvas & Catalog
// ==========================================
function setupDesignerEvents() {
  // Reset Button
  DOM.btnResetBracelet.addEventListener('click', async () => {
    if (State.selectedStones.length > 0) {
      const proceed = await showCustomConfirm(
        "Are you sure you want to clear your current bracelet design? (รีเซ็ตกำไล)",
        "Reset Bracelet"
      );
      if (proceed) {
        State.selectedStones = [];
        State.activeSlotIndex = null;
        showToast("Bracelet cleared!");
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
    : availableStones.filter(s => s.category === State.activeCategory);
    
  filtered.forEach(stone => {
    const card = document.createElement('div');
    card.className = 'stone-card';
    card.setAttribute('data-stone-id', stone.id);
    
    // Add Info Icon Button
    const infoBtn = document.createElement('button');
    infoBtn.className = 'info-icon-btn';
    infoBtn.innerHTML = 'i';
    infoBtn.title = "View Meanings";
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Avoid triggering card addition
      openStoneInfoModal(stone);
    });
    card.appendChild(infoBtn);
    
    // Stone Image Container
    const imgCont = document.createElement('div');
    imgCont.className = 'stone-img-container';
    const img = document.createElement('img');
    img.src = stone.image;
    img.alt = stone.name;
    img.className = 'stone-img';
    imgCont.appendChild(img);
    card.appendChild(imgCont);
    
    // Details
    const details = document.createElement('div');
    details.className = 'stone-details';
    
    const thName = document.createElement('div');
    thName.className = 'stone-name-th';
    thName.textContent = stone.nameTh;
    details.appendChild(thName);
    
    const enName = document.createElement('div');
    enName.className = 'stone-name-en';
    enName.textContent = stone.name;
    details.appendChild(enName);
    
    // Price & Add button row
    const priceRow = document.createElement('div');
    priceRow.className = 'stone-price-row';
    
    const priceTag = document.createElement('div');
    priceTag.className = 'stone-price-tag';
    const currentSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
    const price = getStonePriceForSize(stone, currentSize);
    priceTag.textContent = `฿${price}`;
    priceRow.appendChild(priceTag);
    
    const addBtn = document.createElement('button');
    addBtn.className = 'stone-add-btn';
    addBtn.innerHTML = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addStoneToBracelet(stone.id);
    });
    priceRow.appendChild(addBtn);
    
    details.appendChild(priceRow);
    card.appendChild(details);
    
    // Add card click to add to loop
    card.addEventListener('click', () => {
      addStoneToBracelet(stone.id);
    });
    
    DOM.stoneCatalogGrid.appendChild(card);
  });
}

// Fill entire loop with one stone type
function fillEntireBracelet(stoneId) {
  const stoneData = STONES.find(s => s.id === stoneId);
  if (!stoneData) return;
  
  const placedSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
  const braceletLengthMm = (State.wristSize + TOLERANCE_CM) * 10;
  
  // Fill the entire capacity with this stone
  State.selectedStones = [];
  State.newlyAddedIds = [];
  let currentTotalDiameter = 0;
  
  while (currentTotalDiameter + placedSize <= braceletLengthMm + 1.0) {
    State.uniqueCounter++;
    State.selectedStones.push({
      stoneId: stoneId,
      size: placedSize,
      uniqueId: State.uniqueCounter
    });
    State.newlyAddedIds.push(State.uniqueCounter);
    currentTotalDiameter += placedSize;
  }
  
  State.activeSlotIndex = null;
  showToast(`Filled entire bracelet with ${stoneData.nameTh}.`);
  renderStep3();
  saveState();
}

// Add Stone Logic
function addStoneToBracelet(stoneId) {
  const stoneData = STONES.find(s => s.id === stoneId);
  if (!stoneData) return;
  
  const placedSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
  const braceletLengthMm = (State.wristSize + TOLERANCE_CM) * 10;
  
  // Calculate total diameter of current beads
  const currentTotalDiameter = State.selectedStones.reduce((sum, s) => sum + s.size, 0);
  
  // Dynamic remainingMm Calculation to prevent over-filling
  const remainingMm = braceletLengthMm - currentTotalDiameter;
  
  // Check if there is enough space left for this bead
  if (remainingMm < placedSize) {
    showToast(`กำไลเต็มแล้ว! เหลือพื้นที่ ${remainingMm.toFixed(1)}mm (ขนาดหินที่จะใส่: ${placedSize}mm)`);
    return;
  }
  
  State.uniqueCounter++;
  const newBead = {
    stoneId: stoneId,
    size: placedSize,
    uniqueId: State.uniqueCounter
  };
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
  
  DOM.btnNext.disabled = State.selectedStones.length === 0;
}

// Remove Stone Logic
function removeStoneFromBracelet(index) {
  if (index < 0 || index >= State.selectedStones.length) return;
  const removed = State.selectedStones.splice(index, 1);
  State.activeSlotIndex = null; // Reset selection
  showToast("Bead removed.");
  
  renderStep3();
  saveState();
  
  DOM.btnNext.disabled = State.selectedStones.length === 0;
}

// Core Loop Rendering (Dynamic SVG circular path)
function renderBraceletCanvas() {
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
  
  const cx = 125;
  const cy = 125;
  const rCanvas = 82; // SVG radius for drawing
  
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
  
  const braceletLenMm = (State.wristSize + TOLERANCE_CM) * 10;
  
  // Get active size to place
  const placingSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
  
  // Placed beads list
  const placedList = State.selectedStones;
  const placedCount = placedList.length;
  const sumPlacedDiameter = placedList.reduce((sum, b) => sum + b.size, 0);
  
  // Calculate remaining space and placeholders
  const spaceLeft = braceletLenMm - sumPlacedDiameter;
  const numPlaceholders = Math.max(0, Math.floor(spaceLeft / placingSize));
  
  const totalItems = placedCount + numPlaceholders;
  
  // Construct arrays of diameters for all elements in layout
  const elementSizes = [];
  for (let i = 0; i < placedCount; i++) {
    elementSizes.push(placedList[i].size);
  }
  for (let i = 0; i < numPlaceholders; i++) {
    elementSizes.push(placingSize);
  }
  
  // Total sum of all diameters in circular layout
  const totalVirtualDiameter = elementSizes.reduce((sum, size) => sum + size, 0);
  
  // Scale factor from mm to SVG px circumference
  // Scale dynamically to totalVirtualDiameter so that all beads touch perfectly and cover 360 degrees
  const loopCircumferenceMm = totalVirtualDiameter > 0 ? totalVirtualDiameter : braceletLenMm;
  const scaleMmToPx = (2 * Math.PI * rCanvas) / loopCircumferenceMm;
  
  // Render nodes
  let accumulatedAngle = -Math.PI / 2; // Start rendering at top of circle (-90 deg)
  
  for (let i = 0; i < totalItems; i++) {
    const sizeMm = elementSizes[i];
    const itemAngleWidth = (sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    const centerAngle = accumulatedAngle + itemAngleWidth / 2;
    
    // Convert polar coordinates to rectangular SVG coords
    const bx = cx + rCanvas * Math.cos(centerAngle);
    const by = cy + rCanvas * Math.sin(centerAngle);
    const bRadiusPx = (sizeMm / 2) * scaleMmToPx;
    
    const isPlaced = i < placedCount;
    
    // Group element for bead visual nodes
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    if (isPlaced) {
      const bead = placedList[i];
      const isNewBead = State.newlyAddedIds && State.newlyAddedIds.includes(bead.uniqueId);
      group.setAttribute("class", `bead-node placed ${isNewBead ? 'newly-added' : ''}`);
      
      const stoneId = bead.stoneId;
      const stoneData = STONES.find(s => s.id === stoneId) || STONES[0];
      const uniqueClipId = `clip-${placedList[i].uniqueId}`;
      
      // 1. Create clip path dynamically
      const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
      clip.setAttribute("id", uniqueClipId);
      const clipCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      clipCircle.setAttribute("cx", bx);
      clipCircle.setAttribute("cy", by);
      clipCircle.setAttribute("r", bRadiusPx);
      clip.appendChild(clipCircle);
      defs.appendChild(clip);
      
      // 2. Render flat color circle underneath (as fallback/base color)
      const baseCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      baseCircle.setAttribute("cx", bx);
      baseCircle.setAttribute("cy", by);
      baseCircle.setAttribute("r", bRadiusPx);
      baseCircle.setAttribute("fill", stoneData.color || '#E2E8F0');
      group.appendChild(baseCircle);
      
      // Wrapper group for absolute clipping
      const imgGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      imgGroup.setAttribute("clip-path", `url(#${uniqueClipId})`);
      
      // 3. Render stone image clipped with outward rotation
      const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
      img.setAttributeNS("http://www.w3.org/1999/xlink", "href", stoneData.image);
      const scaleFactor = 1.3;
      const imgSize = bRadiusPx * 2 * scaleFactor;
      img.setAttribute("x", bx - imgSize / 2);
      img.setAttribute("y", by - imgSize / 2);
      img.setAttribute("width", imgSize);
      img.setAttribute("height", imgSize);
      img.setAttribute("class", "bead-image");
      const angleDeg = (centerAngle * 180 / Math.PI) + 90;
      img.setAttribute("transform", `rotate(${angleDeg}, ${bx}, ${by})`);
      imgGroup.appendChild(img);
      group.appendChild(imgGroup);
      
      // 4. Render 3D sheen overlay gradient
      const sheenCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      sheenCircle.setAttribute("cx", bx);
      sheenCircle.setAttribute("cy", by);
      sheenCircle.setAttribute("r", bRadiusPx);
      sheenCircle.setAttribute("fill", "url(#sphericalShading)");
      sheenCircle.setAttribute("opacity", "0.75");
      sheenCircle.setAttribute("pointer-events", "none");
      group.appendChild(sheenCircle);
      
      // 5. Highlight ring / border glow
      const border = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      border.setAttribute("cx", bx);
      border.setAttribute("cy", by);
      border.setAttribute("r", bRadiusPx - 0.5);
      border.setAttribute("fill", "none");
      border.setAttribute("stroke", stoneData.color);
      border.setAttribute("stroke-width", "1");
      border.setAttribute("opacity", "0.5");
      group.appendChild(border);
      
      // If active highlighted slot, render the active glowing ring
      if (i === State.activeSlotIndex) {
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
      
      // Click bead to select/highlight it
      const currentIdx = i;
      group.addEventListener('click', () => removeStoneFromBracelet(currentIdx));
      
    } else {
      group.setAttribute("class", "bead-node placeholder");
      // It is a placeholder empty slot, rendered as a Pastel Purple dotted circle outline
      const isFirstPlaceholder = i === placedCount;
      
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
        showToast("Select a stone from the catalog below to add!");
      });
    }
    
    svg.appendChild(group);
    
    // Progress the angle
    accumulatedAngle += itemAngleWidth;
  }
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
  const totalStonesPrice = State.selectedStones.reduce((sum, b) => {
    const sData = STONES.find(s => s.id === b.stoneId);
    return sum + getStonePriceForSize(sData, b.size);
  }, 0);
  
  const totalDiameter = State.selectedStones.reduce((sum, b) => sum + b.size, 0);
  const braceletLengthMm = (State.wristSize + TOLERANCE_CM) * 10;
  const remainingSpace = Math.max(0, braceletLengthMm - totalDiameter);
  
  // Toggle mixed sizes bar if mixed selection
  if (State.beadSize === 'mixed') {
    DOM.mixedSizeSelectorBar.style.display = 'flex';
    DOM.mixedToggleBtns.forEach(btn => {
      if (parseInt(btn.getAttribute('data-size')) === State.mixedPlacingSize) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  } else {
    DOM.mixedSizeSelectorBar.style.display = 'none';
  }
  
  // Render statistics text
  DOM.canvasPriceText.textContent = `฿${totalStonesPrice.toLocaleString()}`;
  
  let capText = '';
  if (State.beadSize === 'mixed') {
    capText = `${State.selectedStones.length} เม็ด`;
  } else {
    const size = parseInt(State.beadSize);
    const capacity = Math.floor(braceletLengthMm / size);
    capText = `${State.selectedStones.length} / ${capacity} เม็ด`;
  }
  DOM.canvasBeadCountText.textContent = capText;
  
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
  if (remainingSpace <= 1.0) {
    DOM.canvasCenterSub.textContent = "Full Capacity";
    DOM.canvasCenterSub.className = "center-subvalue overflow";
  } else {
    DOM.canvasCenterSub.textContent = "Perfect Fit";
    DOM.canvasCenterSub.className = "center-subvalue fit";
  }
  
  // Render SVG loop and catalog
  renderBraceletCanvas();
  renderCatalogGrid();
  
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
  
  // Specs boxes
  DOM.specWristSize.textContent = `${State.wristSize.toFixed(1)} cm`;
  DOM.specLength.textContent = `${(State.wristSize + TOLERANCE_CM).toFixed(1)} cm`;
  
  let beadSizeLabel = '';
  if (State.beadSize === 'mixed') {
    beadSizeLabel = 'Mixed';
  } else {
    beadSizeLabel = `${State.beadSize}mm`;
  }
  DOM.specBeadSize.textContent = beadSizeLabel;
  DOM.specBeadsCount.textContent = `${State.selectedStones.length} เม็ด`;
  
  // Aggregate stones selected for receipt and meanings
  const aggregatedStones = {}; // key: stoneId_size, val: { stoneId, size, count, totalPrice }
  const uniqueStoneIds = new Set();
  
  State.selectedStones.forEach(placedBead => {
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
  
  // Populate stone meanings
  DOM.meaningsList.innerHTML = '';
  uniqueStoneIds.forEach(id => {
    const stone = STONES.find(s => s.id === id);
    if (stone) {
      const div = document.createElement('div');
      div.className = 'meaning-item';
      div.innerHTML = `
        <div class="meaning-item-title">${stone.nameTh} (${stone.name})</div>
        <div class="meaning-item-desc">${stone.meaningTh} - ${stone.meaning}</div>
      `;
      DOM.meaningsList.appendChild(div);
    }
  });

  // Trigger HTML5 Canvas image compilation in the background asynchronously
  const heroPreview = document.getElementById('exportHeroPreview');
  const heroLoading = document.getElementById('exportHeroLoading');
  const btnHero = document.getElementById('btnDownloadHero');
  if (heroPreview) heroPreview.style.display = 'none';
  if (heroLoading) heroLoading.style.display = 'block';
  if (btnHero) btnHero.disabled = true;

  setTimeout(async () => {
    try {
      await generateImageExports(subtotal, discount, finalPrice, aggregatedStones, uniqueStoneIds);
    } catch (e) {
      console.error("Canvas compilation failed", e);
    }
  }, 100);
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

// Asynchronously pre-load bead texture images
async function preloadBeadImages(urls) {
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
async function generateImageExports(subtotal, discount, finalPrice, aggregatedStones, uniqueStoneIds) {
  const uniqueUrls = [];
  State.selectedStones.forEach(b => {
    const stoneData = STONES.find(s => s.id === b.stoneId);
    if (stoneData && stoneData.image && !uniqueUrls.includes(stoneData.image)) {
      uniqueUrls.push(stoneData.image);
    }
  });

  const imageCache = await preloadBeadImages(uniqueUrls);

  // 1. Hero Shot (1080x1080)
  const heroCanvas = document.createElement("canvas");
  heroCanvas.width = 1080;
  heroCanvas.height = 1080;
  const ctx = heroCanvas.getContext("2d");

  // Cream background
  ctx.fillStyle = "#FDF5E6";
  ctx.fillRect(0, 0, 1080, 1080);

  const cx = 540;
  const cy = 540;
  const rCanvas = 360;

  const braceletLenMm = (State.wristSize + TOLERANCE_CM) * 10;
  const placedList = State.selectedStones;
  const sumPlacedDiameter = placedList.reduce((sum, b) => sum + b.size, 0);
  const loopCircumferenceMm = sumPlacedDiameter > 0 ? sumPlacedDiameter : braceletLenMm;
  const scaleMmToPx = (2 * Math.PI * rCanvas) / loopCircumferenceMm;

  let accumulatedAngle = -Math.PI / 2;

  placedList.forEach(bead => {
    const sizeMm = bead.size;
    const itemAngleWidth = (sizeMm / loopCircumferenceMm) * 2 * Math.PI;
    const centerAngle = accumulatedAngle + itemAngleWidth / 2;

    const bx = cx + rCanvas * Math.cos(centerAngle);
    const by = cy + rCanvas * Math.sin(centerAngle);
    const bRadiusPx = (sizeMm / 2) * scaleMmToPx;

    const stoneData = STONES.find(s => s.id === bead.stoneId) || STONES[0];
    const imgUrl = stoneData ? stoneData.image : "";
    const imgObj = imageCache[imgUrl];

    ctx.save();
    ctx.translate(bx, by);
    const angleDeg = centerAngle + Math.PI / 2;
    ctx.rotate(angleDeg); // Rotate to face outward

    // Base circle
    ctx.beginPath();
    ctx.arc(0, 0, bRadiusPx, 0, 2 * Math.PI);
    ctx.fillStyle = stoneData.color || "#E2E8F0";
    ctx.fill();

    // Clip & Draw bead image
    if (imgObj) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, bRadiusPx, 0, 2 * Math.PI);
      ctx.clip();
      const scaleFactor = 1.3;
      const imgSize = bRadiusPx * 2 * scaleFactor;
      ctx.drawImage(imgObj, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    // Shading overlay
    const sheen = ctx.createRadialGradient(-bRadiusPx * 0.36, -bRadiusPx * 0.36, bRadiusPx * 0.1, 0, 0, bRadiusPx);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.65)");
    sheen.addColorStop(0.45, "rgba(255, 255, 255, 0.15)");
    sheen.addColorStop(0.85, "rgba(0, 0, 0, 0.35)");
    sheen.addColorStop(1, "rgba(0, 0, 0, 0.75)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(0, 0, bRadiusPx, 0, 2 * Math.PI);
    ctx.fill();

    // Highlight border stroke
    ctx.beginPath();
    ctx.arc(0, 0, bRadiusPx - 0.5, 0, 2 * Math.PI);
    ctx.strokeStyle = stoneData.color || "#000000";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.stroke();

    ctx.restore();
    accumulatedAngle += itemAngleWidth;
  });

  const heroDataUrl = heroCanvas.toDataURL("image/png");
  const heroPreview = document.getElementById("exportHeroPreview");
  const heroLoading = document.getElementById("exportHeroLoading");
  const btnHero = document.getElementById("btnDownloadHero");

  if (heroPreview) {
    heroPreview.src = heroDataUrl;
    heroPreview.style.display = "block";
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
  rCtx.font = "bold 36px Georgia, serif";
  rCtx.textAlign = "center";
  rCtx.fillText("LUCKY.COLORSTONE", 400, 90);

  rCtx.fillStyle = "#8B0000";
  rCtx.font = "bold 13px Arial, sans-serif";
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
  rCtx.font = "14px Arial, sans-serif";
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
  rCtx.font = "bold 14px Arial, sans-serif";
  rCtx.fillText("Wrist Size", 150, 285);
  rCtx.fillText("Length", 310, 285);
  rCtx.fillText("Bead Size", 470, 285);
  rCtx.fillText("Beads Count", 630, 285);

  rCtx.fillStyle = "#8B0000";
  rCtx.font = "bold 18px Arial, sans-serif";
  rCtx.fillText(`${State.wristSize.toFixed(1)} cm`, 150, 315);
  rCtx.fillText(`${(State.wristSize + TOLERANCE_CM).toFixed(1)} cm`, 310, 315);
  rCtx.fillText(State.beadSize === 'mixed' ? "Mixed" : `${State.beadSize}mm`, 470, 315);
  rCtx.fillText(`${State.selectedStones.length} beads`, 630, 315);

  drawDashedDivider(370);

  // Stringing Map Header
  rCtx.textAlign = "center";
  rCtx.fillStyle = "#40304D";
  rCtx.font = "bold 15px Arial, sans-serif";
  rCtx.fillText("VISUAL STRINGING MAP (ลำดับการร้อย)", 400, 410);

  const mapY = 465;
  const totalBeadSizeMm = placedList.reduce((sum, b) => sum + b.size, 0);
  const horizontalPadding = 80;
  const availableWidth = 800 - 2 * horizontalPadding;
  const beadScale = totalBeadSizeMm > 0 ? (availableWidth / totalBeadSizeMm) : 5;
  const maxRadius = 18;
  const linearScale = Math.min(beadScale, maxRadius * 2 / 6);

  let accumulatedX = 400 - (totalBeadSizeMm * linearScale) / 2;

  placedList.forEach(bead => {
    const sizeMm = bead.size;
    const bRad = (sizeMm / 2) * linearScale;
    const bx = accumulatedX + bRad;

    const stoneData = STONES.find(s => s.id === bead.stoneId) || STONES[0];
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
    accumulatedX += sizeMm * linearScale;
  });

  drawDashedDivider(525);

  // Pricing lines
  rCtx.textAlign = "left";
  rCtx.fillStyle = "#554466";
  rCtx.font = "15px Arial, sans-serif";
  rCtx.fillText("Original Subtotal:", 70, 570);
  rCtx.fillText("LINE Special Promotion (20% Discount):", 70, 605);
  
  rCtx.font = "bold 20px Arial, sans-serif";
  rCtx.fillStyle = "#40304D";
  rCtx.fillText("Total Net Price:", 70, 650);

  rCtx.textAlign = "right";
  rCtx.font = "15px Arial, sans-serif";
  rCtx.fillStyle = "#554466";
  rCtx.fillText(`฿${subtotal.toLocaleString()}`, 730, 570);
  rCtx.fillStyle = "#8B0000";
  rCtx.fillText(`-฿${discount.toLocaleString()}`, 730, 605);

  rCtx.font = "bold 24px Arial, sans-serif";
  rCtx.fillStyle = "#8B0000";
  rCtx.fillText(`฿${finalPrice.toLocaleString()}`, 730, 650);

  drawDashedDivider(690);

  // Meanings list
  rCtx.textAlign = "left";
  rCtx.fillStyle = "#40304D";
  rCtx.font = "bold 16px Arial, sans-serif";
  rCtx.fillText("✨ STONE MEANINGS & METAPHYSICAL BENEFITS", 70, 735);

  let meaningY = 770;
  uniqueStoneIds.forEach(id => {
    const stone = STONES.find(s => s.id === id);
    if (stone && meaningY < 1120) {
      rCtx.fillStyle = "#8B0000";
      rCtx.font = "bold 14px Arial, sans-serif";
      rCtx.fillText(`• ${stone.nameTh} (${stone.name})`, 70, meaningY);
      
      rCtx.fillStyle = "#554466";
      rCtx.font = "italic 12px Arial, sans-serif";
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
  rCtx.font = "italic 13px Arial, sans-serif";
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
async function submitOrderToCRM(showToastNotification = true) {
  if (State.selectedStones.length === 0) {
    if (showToastNotification) showToast("Bracelet is empty!");
    return null;
  }
  
  const discountPercent = 20;
  
  const totalStonesPrice = State.selectedStones.reduce((sum, b) => {
    const sData = STONES.find(s => s.id === b.stoneId);
    return sum + getStonePriceForSize(sData, b.size);
  }, 0);
  const discount = Math.round(totalStonesPrice * 0.2);
  const netPrice = totalStonesPrice - discount;
  
  // Design details encoded payload
  const designData = {
    w: State.wristSize,
    b: State.beadSize,
    n: State.ownerName,
    s: State.selectedStones.map(s => ({ i: s.stoneId, z: s.size }))
  };
  const jsonString = JSON.stringify(designData);
  const base64Code = btoa(unescape(encodeURIComponent(jsonString)));
  
  const orderPayload = {
    customerName: State.ownerName || "Khun Guest",
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
    subtotal: totalStonesPrice,
    discountPercent: discountPercent,
    discountAmount: discount,
    netPrice: netPrice,
    configurationCode: base64Code
  };
  
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
  
  let beadSizeText = '';
  if (State.beadSize === 'mixed') {
    beadSizeText = `Mixed Sizes (ผสมขนาด)`;
  } else {
    beadSizeText = `${State.beadSize} mm`;
  }
  lines.push(`- Bead Selection: ${beadSizeText}`);
  lines.push(`- Total Beads: ${State.selectedStones.length} beads`);
  lines.push(``);
  
  // Aggregate items
  lines.push(`💎 *Design Details:*`);
  const counts = {};
  State.selectedStones.forEach(b => {
    const key = `${b.stoneId} (${b.size}mm)`;
    counts[key] = (counts[key] || 0) + 1;
  });
  
  Object.entries(counts).forEach(([item, count]) => {
    lines.push(`- ${item} x ${count} beads`);
  });
  lines.push(``);
  
  // Pricing
  const totalStonesPrice = State.selectedStones.reduce((sum, b) => {
    const sData = STONES.find(s => s.id === b.stoneId);
    return sum + getStonePriceForSize(sData, b.size);
  }, 0);
  const discount = Math.round(totalStonesPrice * 0.2);
  const netPrice = totalStonesPrice - discount;
  
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
    s: State.selectedStones.map(s => ({ i: s.stoneId, z: s.size }))
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

function openStoneInfoModal(stone) {
  currentModalStone = stone;
  DOM.modalStoneName.textContent = stone.name;
  DOM.modalStoneImg.src = stone.image;
  DOM.modalStoneTitleTh.textContent = stone.nameTh;
  DOM.modalStoneTitleEn.textContent = stone.name;
  DOM.modalStoneMeaning.textContent = `${stone.meaningTh} / ${stone.meaning}`;
  DOM.modalStonePrice.textContent = `฿${stone.p4 || 0} (4mm) / ฿${stone.p6 || 0} (6mm) / ฿${stone.p8 || 0} (8mm)`;
  
  DOM.stoneInfoModal.classList.add('show');
}

function closeStoneInfoModal() {
  DOM.stoneInfoModal.classList.remove('show');
  currentModalStone = null;
}

function setupModalEvents() {
  DOM.btnModalClose.addEventListener('click', closeStoneInfoModal);
  
  DOM.stoneInfoModal.addEventListener('click', (e) => {
    if (e.target === DOM.stoneInfoModal) {
      closeStoneInfoModal();
    }
  });
  
  DOM.btnModalAdd.addEventListener('click', () => {
    if (currentModalStone) {
      addStoneToBracelet(currentModalStone.id);
      closeStoneInfoModal();
    }
  });
  
  DOM.btnModalFillAll.addEventListener('click', () => {
    if (currentModalStone) {
      fillEntireBracelet(currentModalStone.id);
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
