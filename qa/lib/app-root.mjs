import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const REQUIRED_FILES = ['index.html', 'app.js', 'crm.html', 'crm.js', 'data.js'];
const ADVANCED_MARKERS = [
  ['app.js', 'visibleSpacerPresentationItems'],
  ['crm.js', 'catalogItemBadges'],
  ['product-card-badges.js', 'catalogBadgePresets']
];
const ADVANCED_FILES = [
  'assets/charms/heart-gold.webp',
  'assets/charms/star-gold.webp',
  'assets/spacers/Mallow.webp'
];

function isApplicationRoot(directory) {
  return REQUIRED_FILES.every((file) => fs.existsSync(path.join(directory, file)));
}

function supportsCurrentQaCoverage(directory) {
  return isApplicationRoot(directory)
    && ADVANCED_FILES.every((file) => fs.existsSync(path.join(directory, file)))
    && ADVANCED_MARKERS.every(([file, marker]) => {
      const filePath = path.join(directory, file);
      return fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').includes(marker);
    });
}

function candidateDirectories() {
  const candidateRoot = path.join(REPO_ROOT, '.local-candidates');
  if (!fs.existsSync(candidateRoot)) return [];
  return fs.readdirSync(candidateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(candidateRoot, entry.name))
    .filter(isApplicationRoot)
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

export function resolveApplicationRoot({ requireAdvanced = false } = {}) {
  const configured = String(process.env.QA_APP_ROOT || '').trim();
  if (configured) {
    const resolved = path.resolve(REPO_ROOT, configured);
    if (!isApplicationRoot(resolved)) {
      throw new Error(`QA_APP_ROOT is not an application directory: ${resolved}`);
    }
    if (requireAdvanced && !supportsCurrentQaCoverage(resolved)) {
      throw new Error(`QA_APP_ROOT does not contain the current advanced QA markers: ${resolved}`);
    }
    return { root: resolved, source: 'QA_APP_ROOT', advanced: supportsCurrentQaCoverage(resolved) };
  }

  if (isApplicationRoot(REPO_ROOT) && supportsCurrentQaCoverage(REPO_ROOT)) {
    return { root: REPO_ROOT, source: 'repository', advanced: supportsCurrentQaCoverage(REPO_ROOT) };
  }

  const advancedCandidate = candidateDirectories().find(supportsCurrentQaCoverage);
  if (advancedCandidate) {
    return { root: advancedCandidate, source: 'latest-local-candidate', advanced: true };
  }

  if (requireAdvanced) {
    throw new Error('No application root contains the current advanced QA markers and required assets. Set QA_APP_ROOT explicitly.');
  }

  if (isApplicationRoot(REPO_ROOT)) {
    return { root: REPO_ROOT, source: 'repository', advanced: false };
  }

  throw new Error('No application root found. Set QA_APP_ROOT explicitly.');
}

export function appRelative(root, ...segments) {
  return path.join(root, ...segments);
}
