import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './app-root.mjs';

export const REGISTRY_PATH = path.join(REPO_ROOT, 'qa', 'registry.json');
export const VALID_CATEGORIES = new Set([
  'catalog',
  'crm',
  'layout',
  'browser',
  'bracelet-rendering',
  'checkout',
  'backend',
  'security',
  'deployment'
]);
export const VALID_STATUSES = new Set([
  'active',
  'quarantined',
  'environment-gated',
  'outdated',
  'broken',
  'phase-specific'
]);
export const VALID_SAFETY_LEVELS = new Set([
  'none',
  'fixture',
  'remote-read',
  'remote-write-approved'
]);
export const VALID_RUNNERS = new Set(['node-test', 'node-script']);

export function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

export function validateRegistry(registry = readRegistry(), { ciMode = false } = {}) {
  const issues = [];
  const ids = new Set();
  if (registry.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!Array.isArray(registry.tools)) {
    issues.push('tools must be an array');
    return issues;
  }

  for (const [index, tool] of registry.tools.entries()) {
    const label = tool?.id || `tools[${index}]`;
    for (const field of ['id', 'title', 'category', 'canonicalPath', 'purpose', 'command', 'status', 'lastVerified', 'evidence']) {
      if (!String(tool?.[field] || '').trim()) issues.push(`${label}: missing ${field}`);
    }
    if (tool?.id) {
      if (ids.has(tool.id)) issues.push(`duplicate tool id: ${tool.id}`);
      ids.add(tool.id);
    }
    if (!VALID_CATEGORIES.has(tool?.category)) issues.push(`${label}: invalid category ${tool?.category}`);
    if (!VALID_STATUSES.has(tool?.status)) issues.push(`${label}: invalid status ${tool?.status}`);
    if (!VALID_RUNNERS.has(tool?.runner)) issues.push(`${label}: invalid runner ${tool?.runner}`);
    if (!VALID_SAFETY_LEVELS.has(tool?.safety?.level)) issues.push(`${label}: invalid safety level ${tool?.safety?.level}`);
    if (!Array.isArray(tool?.suites)) issues.push(`${label}: suites must be an array`);
    if (!Array.isArray(tool?.requiredEnv)) issues.push(`${label}: requiredEnv must be an array`);
    if (tool?.status === 'active') {
      const filePath = path.join(REPO_ROOT, tool.canonicalPath);
      if (!fs.existsSync(filePath) && !(ciMode && tool.ciEligible === false)) {
        issues.push(`${label}: active canonicalPath does not exist: ${tool.canonicalPath}`);
      }
    }
  }
  return issues;
}

export function findTools(registry, filters = {}) {
  const text = String(filters.text || '').toLowerCase();
  return registry.tools.filter((tool) => {
    if (filters.category && tool.category !== filters.category) return false;
    if (filters.status && tool.status !== filters.status) return false;
    if (filters.tag && !tool.tags.some((tag) => tag.toLowerCase().includes(filters.tag.toLowerCase()))) return false;
    if (text) {
      const haystack = [
        tool.id,
        tool.title,
        tool.purpose,
        tool.category,
        ...(tool.tags || []),
        ...(tool.productAreas || [])
      ].join(' ').toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}
