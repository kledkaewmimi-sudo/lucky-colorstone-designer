import { findTools, readRegistry } from '../lib/registry.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

const filters = {
  category: argValue('--category'),
  status: argValue('--status'),
  tag: argValue('--tag'),
  text: argValue('--text')
};
const tools = findTools(readRegistry(), filters);
const json = process.argv.includes('--json');
if (json) {
  console.log(JSON.stringify(tools, null, 2));
} else if (tools.length === 0) {
  console.log('No matching QA tools.');
} else {
  for (const tool of tools) {
    console.log(`${tool.id}\t${tool.status}\t${tool.category}\t${tool.canonicalPath}`);
    console.log(`  ${tool.command}`);
  }
}
