import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'README.md',
  'AGENTS.md',
  'spec/architecture/ADCOS-2.0.md',
  'spec/architecture/INVARIANTS.md',
  'spec/authority-model.md',
  'spec/connectivity-resource-provider.md',
  'spec/cross-device-coordination.md',
  'spec/reality-lab.md',
  'spec/group-organizations-and-purchasing.md',
  'spec/dependency-graph.md',
  'spec/work-orders.md',
  'spec/development-state/current-state.json',
  'spec/UPSTREAM-ZCODE.md',
  'docs/LLM-ARCHITECT-HANDOFF.md',
  'docs/research/ARCHITECTURE-REFERENCES.md',
];

const errors = [];
for (const path of requiredFiles) {
  try {
    await access(resolve(root, path));
  } catch {
    errors.push('Missing required source-of-truth file: ' + path);
  }
}

let state;
try {
  state = JSON.parse(await readFile(resolve(root, 'spec/development-state/current-state.json'), 'utf8'));
} catch (error) {
  errors.push('Cannot parse current-state JSON: ' + String(error));
}

if (state) {
  if (state.repository !== 'payswapdotorg/ADCOS-2.0') errors.push('current-state repository mismatch');
  if (state.source_of_truth !== 'repository') errors.push('current-state must declare repository as source of truth');
  if (state.max_concurrent_direct_workers !== 3) errors.push('exactly three direct worker lanes must be configured');
  if (state.tech_lead_is_worker !== false) errors.push('Tech Lead must not be counted as a fourth worker');
  if (!Array.isArray(state.frontier) || state.frontier.length === 0) errors.push('current-state frontier must be non-empty');
  if (!Array.isArray(state.frontier) || state.frontier.some((id) => !/^P[0-9]+-W[0-9]+$/.test(id))) {
    errors.push('frontier contains an invalid work-order ID');
  }
}

const workOrders = await readFile(resolve(root, 'spec/work-orders.md'), 'utf8').catch(() => '');
for (const id of state?.frontier ?? []) {
  if (!workOrders.includes(id)) errors.push('frontier work order is not defined in spec/work-orders.md: ' + id);
}
const architecture = await readFile(resolve(root, 'spec/architecture/ADCOS-2.0.md'), 'utf8').catch(() => '');
if (!architecture.includes('FROZEN FOR IMPLEMENTATION')) errors.push('architecture status must be explicit');
if (!architecture.includes('Cross-device cooperation')) errors.push('cross-device architecture section missing');
if (!architecture.includes('Lab and economic coordination')) errors.push('Lab/economic section missing');

if (errors.length) {
  process.stderr.write('ADCOS 2.0 project-spec check FAILED\n' + errors.map((x) => '- ' + x).join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('ADCOS 2.0 project-spec check PASSED (' + requiredFiles.length + ' required files; current-state and frontier valid)\n');
}
