import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../beryl-visuals.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const catalogPreviewModule = await readFile(new URL('../beryl-catalog-preview.js', import.meta.url), 'utf8');
const {
  BERYL_CATALOG_FADE_MS,
  BERYL_CATALOG_HOLD_MS,
  BERYL_VISUAL_IMAGES,
  advanceBerylCatalogSchedulerState,
  createBerylCatalogSchedulerState,
  validateBerylCatalogSchedulerSequence
} = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const {
  createBerylCatalogPreview,
  createBerylCatalogPreviewController
} = await import(`data:text/javascript,${encodeURIComponent(`${source}\n${catalogPreviewModule.replace(/import[\s\S]*?from '\.\/beryl-visuals\.js';\n/, '')}`)}`);

class FakeTimers {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, at: this.now + delay });
    return id;
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  advance(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort(([, left], [, right]) => left.at - right.at)[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.at;
      task.callback();
    }
    this.now = target;
  }
}

function createFakeBerylCard() {
  const greenImage = {
    className: 'stone-img', dataset: {}, style: {}, src: '', alt: 'Beryl', complete: true, naturalWidth: 100,
    setAttribute() {}
  };
  const container = {
    children: [greenImage],
    querySelector: (selector) => selector === 'img.stone-img' ? greenImage : null,
    appendChild: (element) => container.children.push(element)
  };
  const card = {
    dataset: {}, isConnected: true,
    ownerDocument: {
      createElement: () => ({
        className: '', dataset: {}, style: {}, src: '', alt: '', complete: true, naturalWidth: 100,
        setAttribute() {}
      })
    },
    querySelector: (selector) => selector === '.stone-img-container' ? container : null
  };
  return { card, container };
}

function visibleLayerIndex(layers) {
  return layers.findIndex((layer) => layer.style.opacity === '1');
}

test('Beryl scheduler has three complete green, pink, blue loops with equal timing', () => {
  const diagnostic = validateBerylCatalogSchedulerSequence(3);
  assert.deepEqual(BERYL_VISUAL_IMAGES, [
    'assets/Beryl.webp', 'assets/Beryl pink.webp', 'assets/Beryl blue.webp'
  ]);
  assert.equal(BERYL_VISUAL_IMAGES.length, 3);
  assert.deepEqual(diagnostic.sequence, Array.from({ length: 9 }, (_, index) => BERYL_VISUAL_IMAGES[index % 3]));
  assert.deepEqual(diagnostic.holdDurations, Array(9).fill(BERYL_CATALOG_HOLD_MS));
  assert.deepEqual(diagnostic.fadeDurations, Array(9).fill(BERYL_CATALOG_FADE_MS));
});

test('Beryl scheduler starts green and has a safe cleanup/remount sequence', () => {
  let state = createBerylCatalogSchedulerState();
  assert.equal(BERYL_VISUAL_IMAGES[state.currentIndex], 'assets/Beryl.webp');
  state = advanceBerylCatalogSchedulerState(state);
  assert.deepEqual(state.transition, { from: 'assets/Beryl.webp', to: 'assets/Beryl pink.webp' });
  state = advanceBerylCatalogSchedulerState(state);
  assert.deepEqual(state.transition, { from: 'assets/Beryl pink.webp', to: 'assets/Beryl blue.webp' });
  state = advanceBerylCatalogSchedulerState(state);
  assert.deepEqual(state.transition, { from: 'assets/Beryl blue.webp', to: 'assets/Beryl.webp' });
});

test('permanent Beryl DOM layers visibly cycle green, pink, blue for three full loops', () => {
  const { card, container } = createFakeBerylCard();
  const preview = createBerylCatalogPreview(card);
  const timers = new FakeTimers();
  const controller = createBerylCatalogPreviewController(preview, timers);

  assert.equal(container.children.length, 3);
  assert.deepEqual(preview.layers.map((layer) => layer.src), BERYL_VISUAL_IMAGES);
  assert.deepEqual(preview.layers.map((layer) => layer.style.opacity), ['1', '0', '0']);

  timers.advance(BERYL_CATALOG_HOLD_MS);
  assert.deepEqual(preview.layers.map((layer) => layer.style.opacity), ['0', '1', '0']);
  timers.advance(BERYL_CATALOG_FADE_MS);
  assert.deepEqual(preview.layers.map((layer) => layer.style.opacity), ['0', '1', '0']);
  timers.advance(BERYL_CATALOG_HOLD_MS + BERYL_CATALOG_FADE_MS);
  assert.deepEqual(preview.layers.map((layer) => layer.style.opacity), ['0', '0', '1']);

  for (let transition = 2; transition < 9; transition += 1) {
    const expectedVisibleLayer = (transition + 1) % 3;
    timers.advance(BERYL_CATALOG_HOLD_MS);
    assert.equal(visibleLayerIndex(preview.layers), expectedVisibleLayer);
    timers.advance(BERYL_CATALOG_FADE_MS);
    assert.equal(visibleLayerIndex(preview.layers), expectedVisibleLayer);
  }

  assert.equal(preview.layers.map((layer) => layer.src).join('|'), BERYL_VISUAL_IMAGES.join('|'));
  assert.equal(controller.getCurrentIndex(), 0);
  assert.equal(controller.hasPendingTimer(), true);
});

test('permanent Beryl layers restart from green after a catalog remount', () => {
  const first = createFakeBerylCard();
  const firstPreview = createBerylCatalogPreview(first.card);
  const timers = new FakeTimers();
  const firstController = createBerylCatalogPreviewController(firstPreview, timers);
  timers.advance(BERYL_CATALOG_HOLD_MS + BERYL_CATALOG_FADE_MS);
  assert.equal(visibleLayerIndex(firstPreview.layers), 1);
  first.card.isConnected = false;
  firstController.stop();

  const remounted = createFakeBerylCard();
  const remountedPreview = createBerylCatalogPreview(remounted.card);
  const remountedController = createBerylCatalogPreviewController(remountedPreview, timers);
  assert.equal(visibleLayerIndex(remountedPreview.layers), 0);
  timers.advance(BERYL_CATALOG_HOLD_MS + BERYL_CATALOG_FADE_MS);
  assert.equal(visibleLayerIndex(remountedPreview.layers), 1);
  timers.advance(BERYL_CATALOG_HOLD_MS + BERYL_CATALOG_FADE_MS);
  assert.equal(visibleLayerIndex(remountedPreview.layers), 2);
  timers.advance(BERYL_CATALOG_HOLD_MS + BERYL_CATALOG_FADE_MS);
  assert.equal(visibleLayerIndex(remountedPreview.layers), 0);
  assert.equal(remountedController.hasPendingTimer(), true);
});

test('Step 3 grid replaces old Beryl controller before rebuilding its DOM', () => {
  const gridStart = appSource.indexOf('function renderCatalogGrid()');
  const gridSource = appSource.slice(gridStart, appSource.indexOf('function getFirstEmptyLoopSlotIndex()', gridStart));
  assert.ok(gridStart >= 0);
  assert.ok(gridSource.indexOf('stopBerylCatalogRotation();') < gridSource.indexOf('DOM.stoneCatalogGrid.innerHTML = \'\';'));
  assert.match(appSource, /createBerylCatalogPreview\(card\)/);
  assert.match(appSource, /waitForBerylCatalogPreviewReady\(berylCatalogPreview\)/);
  assert.match(appSource, /createBerylCatalogPreviewController\(preview\)/);
  assert.equal(appSource.includes('loadAndDecodeBerylImage'), false);
  assert.equal(appSource.includes('berylCatalogSchedulerRunning'), false);
});
