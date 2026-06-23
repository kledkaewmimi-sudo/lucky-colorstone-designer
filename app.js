import { STONES, CATEGORIES } from './data.js';

// ==========================================
// 1. Global Application State
// ==========================================
const State = {
  currentStep: 1,
  wristSize: 16.0,          // Default wrist size in cm
  beadSize: '6',            // '4', '6', '8', or 'mixed'
  mixedPlacingSize: 6,      // Default size to place in mixed mode
  ownerName: '',            // Personalized bracelet owner name
  selectedStones: [],       // Array of placed beads: { stoneId: string, size: number, uniqueId: number }
  activeCategory: 'all',    // Current category filter in Step 3
  activeSlotIndex: null,    // Index of selected slot in Step 3 (-1 or null for append)
  uniqueCounter: 0          // For generating unique IDs for animation keys
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
  toastMessage: document.getElementById('toastMessage')
};

// ==========================================
// 3. Constants & Configuration
// ==========================================
const WRIST_SIZES = Array.from({ length: 13 }, (_, i) => 14.0 + i * 0.5); // 14.0, 14.5, ..., 20.0
const TOLERANCE_CM = 1.5; // Adding 1.5 cm standard padding for bracelets

// ==========================================
// 4. Initialisation
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Load persisted state if exists
  loadPersistedState();
  
  // Setup LIFF (LINE Front-end Framework)
  initLIFF();
  
  // Initialise step UI components
  initWristSizeGrid();
  initBeadSizeOptions();
  initCatalogFilters();
  
  // Setup Event Listeners
  setupNavigationEvents();
  setupDesignerEvents();
  setupModalEvents();
  
  // Perform first render
  renderApp();
});

// LIFF Initialization
function initLIFF() {
  if (typeof liff !== 'undefined') {
    liff.init({ liffId: "2006325990-2eND805V" }) // Example LIFF ID, can be replaced by users later
      .then(() => {
        console.log("LIFF Initialized successfully");
        if (liff.isLoggedIn()) {
          liff.getProfile().then(profile => {
            if (profile.displayName && !State.ownerName) {
              State.ownerName = profile.displayName;
              DOM.braceletOwnerName.value = profile.displayName;
              renderApp();
            }
          });
        }
      })
      .catch((err) => {
        console.warn("LIFF Initialization failed. Fallback URL will be used.", err);
      });
  }
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
      State.currentStep = parsed.currentStep || 1;
      
      DOM.braceletOwnerName.value = State.ownerName;
    } catch (e) {
      console.error("Failed to parse persisted state", e);
    }
  }
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

// ==========================================
// 5. App Render Routing
// ==========================================
function renderApp() {
  renderStepper();
  renderStepViews();
  saveState();
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
    "Step 1: Wrist Measurement",
    "Step 2: Bead Size Selection",
    "Step 3: Custom Bracelet Designer",
    "Step 4: Summary & Order"
  ];
  DOM.stepIndicatorLabel.innerText = stepLabels[State.currentStep - 1];
}

// Switch between Step Views
function renderStepViews() {
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
    renderStep4();
  }

  // Configure navigation buttons in sticky footer
  if (State.currentStep === 1) {
    DOM.btnBack.style.visibility = 'hidden';
    DOM.btnNext.innerHTML = `Select Bead Size &nbsp;
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6"/>
      </svg>`;
    DOM.btnNext.className = 'footer-btn btn-next';
    DOM.btnNext.disabled = false;
  } else {
    DOM.btnBack.style.visibility = 'visible';
    
    if (State.currentStep === 2) {
      DOM.btnNext.innerHTML = `Start Designing &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>`;
      DOM.btnNext.className = 'footer-btn btn-next';
      DOM.btnNext.disabled = false;
    } else if (State.currentStep === 3) {
      DOM.btnNext.innerHTML = `Review Order &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>`;
      DOM.btnNext.className = 'footer-btn btn-next';
      // Disable next only if no stones are added
      DOM.btnNext.disabled = State.selectedStones.length === 0;
    } else if (State.currentStep === 4) {
      DOM.btnNext.innerHTML = `Order via LINE &nbsp;
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>`;
      DOM.btnNext.className = 'footer-btn btn-order';
      DOM.btnNext.disabled = false;
    }
  }
}

// Navigate to step
function goToStep(step) {
  if (step < 1 || step > 4) return;
  State.currentStep = step;
  renderApp();
}

// Setup Back/Next Events
function setupNavigationEvents() {
  DOM.btnBack.addEventListener('click', () => {
    goToStep(State.currentStep - 1);
  });
  
  DOM.btnNext.addEventListener('click', () => {
    if (State.currentStep === 4) {
      handleLineOrder();
    } else {
      goToStep(State.currentStep + 1);
    }
  });

  // Home Button clicks
  const goHome = (e) => {
    e.preventDefault();
    if (confirm("Go back to Step 1? Your current design will be saved.")) {
      goToStep(1);
    }
  };
  DOM.btnHome.addEventListener('click', goHome);
  DOM.headerLogo.addEventListener('click', goHome);
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
      DOM.visualWristSizeText.textContent = `${size.toFixed(1)} cm`;
      
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
  DOM.visualWristSizeText.textContent = `${State.wristSize.toFixed(1)} cm`;
  DOM.braceletOwnerName.value = State.ownerName;
}

// ==========================================
// 7. Step 2: Bead Size Logic
// ==========================================
function initBeadSizeOptions() {
  DOM.beadSizeCards.forEach(card => {
    card.addEventListener('click', () => {
      DOM.beadSizeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      const prevBeadSize = State.beadSize;
      State.beadSize = card.getAttribute('data-bead-size');
      saveState();
      
      updateEstimationText();
      
      // Alert/adjust beads if bead size changes
      if (prevBeadSize !== State.beadSize && State.selectedStones.length > 0) {
        if (confirm("Changing bead size will clear or resize your current bracelet design. Proceed?")) {
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
        } else {
          // Revert selection
          State.beadSize = prevBeadSize;
          DOM.beadSizeCards.forEach(c => {
            if (c.getAttribute('data-bead-size') === prevBeadSize) {
              c.classList.add('active');
            } else {
              c.classList.remove('active');
            }
          });
        }
      }
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
  DOM.btnResetBracelet.addEventListener('click', () => {
    if (State.selectedStones.length > 0 && confirm("Are you sure you want to clear your current bracelet design? (รีเซ็ตกำไล)")) {
      State.selectedStones = [];
      State.activeSlotIndex = null;
      showToast("Bracelet cleared!");
      renderStep3();
      saveState();
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
  
  const filtered = State.activeCategory === 'all' 
    ? STONES 
    : STONES.filter(s => s.category === State.activeCategory);
    
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
    priceTag.textContent = `฿${stone.price}`;
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

// Add Stone Logic
function addStoneToBracelet(stoneId) {
  const stoneData = STONES.find(s => s.id === stoneId);
  if (!stoneData) return;
  
  const placedSize = State.beadSize === 'mixed' ? State.mixedPlacingSize : parseInt(State.beadSize);
  const braceletLengthMm = (State.wristSize + TOLERANCE_CM) * 10;
  
  // Calculate total diameter of current beads
  const currentTotalDiameter = State.selectedStones.reduce((sum, s) => sum + s.size, 0);
  
  // Check if there is enough space left for this bead
  if (currentTotalDiameter + placedSize > braceletLengthMm + 1.0) { // Allow 1mm tolerance for tight fit
    showToast("Bracelet is full! (กำไลเต็มแล้ว)");
    return;
  }
  
  State.uniqueCounter++;
  const newBead = {
    stoneId: stoneId,
    size: placedSize,
    uniqueId: State.uniqueCounter
  };
  
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
  
  // Re-evaluate next button disable status
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
  
  // Re-evaluate next button disable status
  DOM.btnNext.disabled = State.selectedStones.length === 0;
}

// Core Loop Rendering (Dynamic SVG circular path)
function renderBraceletCanvas() {
  const svg = DOM.braceletSvg;
  // Clear SVG first, keeping defs
  const defs = svg.querySelector('defs') || createSvgDefs();
  svg.innerHTML = '';
  svg.appendChild(defs);
  
  const cx = 125;
  const cy = 125;
  const rCanvas = 82; // SVG radius for drawing
  
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
  // Max circumference of loop in mm is totalVirtualDiameter or braceletLenMm, whichever is larger (to avoid shrinking)
  const maxLoopCircumferenceMm = Math.max(braceletLenMm, totalVirtualDiameter);
  const scaleMmToPx = (2 * Math.PI * rCanvas) / maxLoopCircumferenceMm;
  
  // Render nodes
  let accumulatedAngle = -Math.PI / 2; // Start rendering at top of circle (-90 deg)
  
  for (let i = 0; i < totalItems; i++) {
    const sizeMm = elementSizes[i];
    const itemAngleWidth = (sizeMm / maxLoopCircumferenceMm) * 2 * Math.PI;
    const centerAngle = accumulatedAngle + itemAngleWidth / 2;
    
    // Convert polar coordinates to rectangular SVG coords
    const bx = cx + rCanvas * Math.cos(centerAngle);
    const by = cy + rCanvas * Math.sin(centerAngle);
    const bRadiusPx = (sizeMm / 2) * scaleMmToPx;
    
    const isPlaced = i < placedCount;
    
    // Group element for bead visual nodes
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", `bead-node ${isPlaced ? 'placed' : 'placeholder'}`);
    
    if (isPlaced) {
      const stoneId = placedList[i].stoneId;
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
      
      // 3. Render stone image clipped
      const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
      img.setAttributeNS("http://www.w3.org/1999/xlink", "href", stoneData.image);
      img.setAttribute("x", bx - bRadiusPx);
      img.setAttribute("y", by - bRadiusPx);
      img.setAttribute("width", bRadiusPx * 2);
      img.setAttribute("height", bRadiusPx * 2);
      img.setAttribute("clip-path", `url(#${uniqueClipId})`);
      img.setAttribute("class", "bead-image");
      group.appendChild(img);
      
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
      
      // Remove bead on click
      const currentIdx = i;
      group.addEventListener('click', () => removeStoneFromBracelet(currentIdx));
      
    } else {
      // It is a placeholder empty slot
      const isFirstPlaceholder = i === placedCount;
      
      // Dashed circle slot
      const slot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      slot.setAttribute("cx", bx);
      slot.setAttribute("cy", by);
      slot.setAttribute("r", bRadiusPx - 1);
      slot.setAttribute("fill", "none");
      slot.setAttribute("stroke", isFirstPlaceholder ? "var(--color-gold)" : "var(--color-navy-muted)");
      slot.setAttribute("stroke-width", isFirstPlaceholder ? "2" : "1.5");
      slot.setAttribute("stroke-dasharray", isFirstPlaceholder ? "4 2" : "3 3");
      slot.setAttribute("class", "bead-slot-border");
      
      if (isFirstPlaceholder) {
        slot.setAttribute("filter", "drop-shadow(0 0 4px var(--color-gold))");
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
        plus1.setAttribute("stroke", "var(--color-gold-dark)");
        plus1.setAttribute("stroke-width", "1.5");
        
        const plus2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        plus2.setAttribute("x1", bx);
        plus2.setAttribute("y1", by - 4);
        plus2.setAttribute("x2", bx);
        plus2.setAttribute("y2", by + 4);
        plus2.setAttribute("stroke", "var(--color-gold-dark)");
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
  
  return defs;
}

// Render step 3 workspace elements
function renderStep3() {
  const totalStonesPrice = State.selectedStones.reduce((sum, b) => {
    const sData = STONES.find(s => s.id === b.stoneId);
    return sum + (sData ? sData.price : 0);
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
  
  DOM.canvasSpaceText.textContent = `เหลือ ${remainingSpace.toFixed(1)} mm`;
  
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
}

// ==========================================
// 9. Step 4: Final Summary & Commercial Logic
// ==========================================
function renderStep4() {
  const nameLabel = State.ownerName ? State.ownerName : "Khun Guest";
  DOM.summaryTitleText.textContent = `LUCKY.COLORSTONE for ${nameLabel}`;
  
  // Set today's date formatted
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const today = new Date();
  DOM.summaryDateText.textContent = `Date: ${today.toLocaleDateString('en-US', options)}`;
  
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
    const price = stoneData ? stoneData.price : 0;
    
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
  
  // Calculate special discount (20%)
  const discount = Math.round(subtotal * 0.20);
  const finalPrice = subtotal - discount;
  
  DOM.priceSubtotal.textContent = `฿${subtotal.toLocaleString()}`;
  DOM.priceDiscount.textContent = `-฿${discount.toLocaleString()}`;
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
}

// Generate Formatted LINE Order Message & Redirection
function handleLineOrder() {
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
    return sum + (sData ? sData.price : 0);
  }, 0);
  const discount = Math.round(totalStonesPrice * 0.20);
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
  DOM.modalStonePrice.textContent = `฿${stone.price} / เม็ด`;
  
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
