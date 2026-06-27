const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

const DATA_DIR = path.join(__dirname, 'data');
const STONES_FILE = path.join(DATA_DIR, 'stones.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists (create if missing)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✅ Data folder created at', DATA_DIR);
}

const DEFAULT_STONES = [
  {
    id: "golden_rutile",
    name: "Golden Rutile Quartz",
    nameTh: "ไหมทอง",
    p4: 100,
    p6: 150,
    p8: 200,
    category: "wealth",
    meaning: "Attracts wealth, prosperity, and success in business.",
    meaningTh: "ดึงดูดโชคลาภ เงินทอง ความมั่งคั่ง และความสำเร็จในหน้าที่การงาน เป็นหินแห่งความร่ำรวย",
    image: "assets/golden_rutile.png",
    color: "#E2C974",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "amethyst",
    name: "Amethyst",
    nameTh: "อเมทิสต์",
    p4: 80,
    p6: 120,
    p8: 160,
    category: "calm",
    meaning: "Brings peace, stress relief, and wisdom.",
    meaningTh: "ช่วยขจัดความเครียด ความวิตกกังวล และสร้างความสงบในจิตใจ ช่วยเพิ่มพูนสติปัญญาและการคิดวิเคราะห์",
    image: "assets/amethyst.png",
    color: "#9F86C0",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "rose_quartz",
    name: "Rose Quartz",
    nameTh: "โรสควอตซ์",
    p4: 60,
    p6: 90,
    p8: 120,
    category: "love",
    meaning: "Attracts love, compassion, and emotional healing.",
    meaningTh: "ดึงดูดความรัก ความเมตตา และความอบอุ่นใจ ช่วยเยียวยาอารมณ์ความรู้สึกและสร้างสัมพันธภาพที่ดี",
    image: "assets/rose_quartz.png",
    color: "#FFCAD4",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "lapis_lazuli",
    name: "Lapis Lazuli",
    nameTh: "ลาพิส ลาซูลี",
    p4: 70,
    p6: 110,
    p8: 150,
    category: "calm",
    meaning: "Enhances truth, wisdom, and intellectual ability.",
    meaningTh: "ช่วยเสริมสร้างความจริงใจ ความฉลาด และความสามารถในการเรียนรู้และการตัดสินใจที่ดี",
    image: "assets/lapis_lazuli.png",
    color: "#2A4B7C",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "tigers_eye",
    name: "Tiger's Eye",
    nameTh: "ไทเกอร์อาย",
    p4: 90,
    p6: 130,
    p8: 170,
    category: "protection",
    meaning: "Brings courage, protection, and mental clarity.",
    meaningTh: "นำพาความกล้าหาญ การปกป้องคุ้มครอง และความชัดเจนในจิตใจ ช่วยให้มีสมาธิและมีวิสัยทัศน์ที่กว้างไกล",
    image: "assets/tigers_eye.png",
    color: "#B07C3D",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "black_obsidian",
    name: "Black Obsidian",
    nameTh: "แบล็คออบซิเดียน",
    p4: 70,
    p6: 100,
    p8: 130,
    category: "protection",
    meaning: "Powerful protective stone against negativity and stress.",
    meaningTh: "หินปกป้องพลังลบและความเครียด ช่วยดูดซับสิ่งไม่ดีรอบตัวและเพิ่มพลังความมั่นใจในตนเอง",
    image: "assets/black_obsidian.png",
    color: "#1E1E1E",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "green_aventurine",
    name: "Green Aventurine",
    nameTh: "กรีน อเวนเจอรีน",
    p4: 75,
    p6: 110,
    p8: 145,
    category: "wealth",
    meaning: "Stone of opportunity, luck, and alignment of wealth.",
    meaningTh: "หินแห่งโอกาสและความโชคดี ช่วยดึงดูดโชคลาภ โอกาสใหม่ๆ และความเจริญรุ่งเรือง",
    image: "assets/green_aventurine.png",
    color: "#6E9A82",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "red_jasper",
    name: "Red Jasper",
    nameTh: "เรดแจสเปอร์",
    p4: 70,
    p6: 100,
    p8: 130,
    category: "protection",
    meaning: "Brings strength, courage, and grounding energy.",
    meaningTh: "ช่วยเสริมสร้างความแข็งแกร่ง ความอดทน และความมั่นคงในจิตใจ ช่วยควบคุมอารมณ์และขจัดความหวาดกลัว",
    image: "assets/red_jasper.png",
    color: "#B83A3A",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "malachite",
    name: "Malachite",
    nameTh: "มาลาไคต์",
    p4: 120,
    p6: 180,
    p8: 240,
    category: "protection",
    meaning: "Powerful protector and stone of transformation.",
    meaningTh: "หินแห่งการปกป้องและเปลี่ยนแปลง ช่วยเสริมความโชคดีในการเดินทางและขับไล่สิ่งชั่วร้าย",
    image: "assets/malachite.png",
    color: "#1E5631",
    sizes: [4, 6, 8],
    inStock: true
  },
  {
    id: "citrine",
    name: "Citrine",
    nameTh: "ซิทริน",
    p4: 90,
    p6: 140,
    p8: 190,
    category: "wealth",
    meaning: "Attracts abundance, prosperity, and success.",
    meaningTh: "หินแห่งความสำเร็จ ความรุ่งเรือง และความอุดมสมบูรณ์ ช่วยกระตุ้นจินตนาการและความคิดสร้างสรรค์",
    image: "assets/citrine.png",
    color: "#E5A93C",
    sizes: [4, 6, 8],
    inStock: true
  }
];

function seedDatabase(force = false) {
  let shouldSeedStones = force || !fs.existsSync(STONES_FILE);
  if (!shouldSeedStones) {
    try {
      const content = fs.readFileSync(STONES_FILE, 'utf8').trim();
      if (content === '' || content === '[]' || content === '{}') {
        shouldSeedStones = true;
      }
    } catch (e) {
      shouldSeedStones = true;
    }
  }
  if (shouldSeedStones) {
    fs.writeFileSync(STONES_FILE, JSON.stringify(DEFAULT_STONES, null, 2), 'utf8');
  }

  let shouldSeedOrders = force || !fs.existsSync(ORDERS_FILE);
  if (!shouldSeedOrders) {
    try {
      const content = fs.readFileSync(ORDERS_FILE, 'utf8').trim();
      if (content === '') {
        shouldSeedOrders = true;
      }
    } catch (e) {
      shouldSeedOrders = true;
    }
  }
  if (shouldSeedOrders) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2), 'utf8');
  }

  let shouldSeedSettings = force || !fs.existsSync(SETTINGS_FILE);
  if (!shouldSeedSettings) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf8').trim();
      if (content === '') {
        shouldSeedSettings = true;
      }
    } catch (e) {
      shouldSeedSettings = true;
    }
  }
  if (shouldSeedSettings) {
    const defaultSettings = { globalDiscountPercent: 20 };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
  }
}

seedDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// Host-based routing middleware for subdomain separation
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const isCrmSubdomain = host.toLowerCase().startsWith('crm.');
  
  if (isCrmSubdomain) {
    // If accessing the crm subdomain root, serve the CRM dashboard
    if (req.path === '/' || req.path === '/index.html') {
      return res.sendFile(path.join(__dirname, 'crm.html'));
    }
  } else {
    // If accessing the customize domain, hide backend CRM dashboard and assets for security
    if (
      req.path.toLowerCase().startsWith('/crm.html') || 
      req.path.toLowerCase().startsWith('/crm.js') || 
      req.path.toLowerCase().startsWith('/crm.css')
    ) {
      return res.status(404).send('Not Found');
    }
  }
  next();
});

app.use(express.static(__dirname));

// API Routes
app.get('/api/stones', (req, res) => {
  try {
    const data = fs.readFileSync(STONES_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stones/save', (req, res) => {
  try {
    const stones = JSON.parse(fs.readFileSync(STONES_FILE, 'utf8'));
    const bodyObj = req.body;
    if (bodyObj && bodyObj.id) {
      const idx = stones.findIndex(s => s.id === bodyObj.id);
      if (idx !== -1) {
        stones[idx] = bodyObj;
      } else {
        stones.push(bodyObj);
      }
      fs.writeFileSync(STONES_FILE, JSON.stringify(stones, null, 2), 'utf8');
      res.json(bodyObj);
    } else {
      res.status(400).json({ error: 'Missing stone body or ID' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stones/delete', (req, res) => {
  try {
    const stones = JSON.parse(fs.readFileSync(STONES_FILE, 'utf8'));
    const { id } = req.body;
    if (id) {
      const filtered = stones.filter(s => s.id !== id);
      fs.writeFileSync(STONES_FILE, JSON.stringify(filtered, null, 2), 'utf8');
      res.json({ success: true, id });
    } else {
      res.status(400).json({ error: 'Missing ID' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders', (req, res) => {
  try {
    const data = fs.readFileSync(ORDERS_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    const bodyObj = req.body;
    if (bodyObj) {
      if (!bodyObj.id) {
        bodyObj.id = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
      }
      if (!bodyObj.date) {
        bodyObj.date = new Date().toISOString();
      }
      if (!bodyObj.status) {
        bodyObj.status = 'New Order';
      }
      orders.unshift(bodyObj);
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
      res.json(bodyObj);
    } else {
      res.status(400).json({ error: 'Empty body' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/update-status', (req, res) => {
  try {
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    const { id, status } = req.body;
    if (id && status) {
      const idx = orders.findIndex(o => o.id === id);
      if (idx !== -1) {
        orders[idx].status = status;
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
        res.json({ success: true, id, status });
      } else {
        res.status(404).json({ error: 'Order not found' });
      }
    } else {
      res.status(400).json({ error: 'Missing parameters' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/save', (req, res) => {
  try {
    const bodyObj = req.body;
    if (bodyObj) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(bodyObj, null, 2), 'utf8');
      res.json(bodyObj);
    } else {
      res.status(400).json({ error: 'Empty body' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reset', (req, res) => {
  try {
    seedDatabase(true);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback index.html router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`NodeJS Server running on port ${PORT}`);
});
