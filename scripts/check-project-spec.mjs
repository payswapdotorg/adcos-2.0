#!/usr/bin/env node
// ADCOS 2.0 project-spec conformance checker (work order P0-W2).
//
// Verifies the governance invariants of an ADCOS 2.0 checkout:
//   1. every required source-of-truth file exists;
//   2. spec/development-state/current-state.json parses and declares the
//      expected repository, source of truth, worker-lane and frontier state;
//   3. every frontier work order is defined as a `## P*-*` heading in
//      spec/work-orders.md;
//   4. work-order IDs in spec/work-orders.md are unique;
//   5. current-state architecture_version is a non-empty string that appears
//      verbatim in spec/architecture/ADCOS-2.0.md;
//   6. the architecture lock declares FROZEN FOR IMPLEMENTATION and carries
//      the required locked sections.
//
// Usage: node scripts/check-project-spec.mjs [--root <repo-root>]
// `--root` defaults to process.cwd() so the checker can be pointed at
// fixture trees (see scripts/spec-check-fixtures/). Dependency-free:
// node: builtins only, Node >= 18.

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const usage = 'usage: node scripts/check-project-spec.mjs [--root <repo-root>]';

function printUsage(stream) {
  stream.write(usage + '\n');
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { root: process.cwd() };
  const usageErrors = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      const value = argv[i + 1];
      if (value === undefined || value === '') {
        usageErrors.push('--root requires a non-empty path argument');
      } else {
        options.root = value;
        i += 1;
      }
    } else if (arg.startsWith('--root=')) {
      const value = arg.slice('--root='.length);
      if (value === '') {
        usageErrors.push('--root requires a non-empty path argument');
      } else {
        options.root = value;
      }
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      usageErrors.push('unknown argument: ' + arg);
    }
  }
  return { options, usageErrors };
}

const { options, usageErrors } = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage(process.stdout);
  process.exit(0);
}

if (usageErrors.length > 0) {
  process.stderr.write('ADCOS 2.0 project-spec check FAILED\n' + usageErrors.map((x) => '- ' + x).join('\n') + '\n');
  printUsage(process.stderr);
  process.exit(2);
}

const root = resolve(options.root);

// ---------------------------------------------------------------------------
// Required source-of-truth files
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// current-state.json
// ---------------------------------------------------------------------------

const statePath = resolve(root, 'spec/development-state/current-state.json');
let state;
try {
  state = JSON.parse(await readFile(statePath, 'utf8'));
} catch (error) {
  if (error instanceof SyntaxError) {
    errors.push('Cannot parse current-state JSON: ' + String(error));
  } else {
    // Missing/unreadable file (e.g. bogus --root): the root cause is already
    // reported by the required-file pass; report the read failure distinctly
    // so a parse error is never claimed where the file could not be read.
    errors.push('Cannot read current-state JSON: ' + String(error));
  }
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

// ---------------------------------------------------------------------------
// Work-order catalog: parse `## P*-*` headings, require unique IDs, and
// require every frontier ID to be defined as a work-order heading.
// ---------------------------------------------------------------------------

const workOrderIdPattern = /^##\s+(P[0-9]+-W[0-9]+)\b/gm;
const workOrdersPath = resolve(root, 'spec/work-orders.md');
const workOrders = await readFile(workOrdersPath, 'utf8').catch(() => '');
const workOrderIds = [];
for (const match of workOrders.matchAll(workOrderIdPattern)) {
  workOrderIds.push(match[1]);
}
const definedWorkOrderIds = new Set(workOrderIds);
const duplicateWorkOrderIds = [...new Set(workOrderIds.filter((id, index) => workOrderIds.indexOf(id) !== index))];
for (const id of duplicateWorkOrderIds) {
  errors.push('duplicate work-order ID in spec/work-orders.md: ' + id);
}

for (const id of state?.frontier ?? []) {
  if (!definedWorkOrderIds.has(id)) {
    errors.push('frontier work order is not defined in spec/work-orders.md: ' + id);
  }
}

// ---------------------------------------------------------------------------
// Architecture lock: version declaration and locked sections.
// ---------------------------------------------------------------------------

const architecturePath = resolve(root, 'spec/architecture/ADCOS-2.0.md');
let architecture = '';
let architectureAvailable = false;
try {
  architecture = await readFile(architecturePath, 'utf8');
  architectureAvailable = true;
} catch {
  // The missing-file error is already reported above; skip dependent checks.
}

if (state && architectureAvailable) {
  const version = state.architecture_version;
  if (typeof version !== 'string' || version.trim() === '') {
    errors.push('current-state architecture_version must be a non-empty string');
  } else if (!architecture.includes(version)) {
    errors.push('current-state architecture_version is not declared in spec/architecture/ADCOS-2.0.md: ' + version);
  }
}

if (architectureAvailable && !architecture.includes('FROZEN FOR IMPLEMENTATION')) {
  errors.push('architecture status must be explicit');
}

// Required locked sections of the architecture baseline (ARCH-BASELINE-001).
//
// A section is satisfied when a markdown heading (any `#` level) in one of
// its canonical documents contains one of the accepted heading aliases,
// case-insensitively and after whitespace normalization. The frozen corpus
// is the architecture lock plus the domain specifications it locked in the
// same baseline, so a required section may live either in
// spec/architecture/ADCOS-2.0.md itself or in the domain document dedicated
// to it. Aliases exist because the work-order vocabulary and the committed
// document headings describe the same locked sections with slightly
// different wording (e.g. the lock's `Resource contribution` heading is the
// `Connectivity resource contribution` section of the baseline).
const requiredLockedSections = [
  {
    name: 'Cross-device cooperation',
    docs: ['spec/architecture/ADCOS-2.0.md'],
    aliases: ['cross-device cooperation'],
  },
  {
    name: 'Lab and economic coordination',
    docs: ['spec/architecture/ADCOS-2.0.md'],
    aliases: ['lab and economic coordination'],
  },
  {
    name: 'Authority model',
    docs: ['spec/architecture/ADCOS-2.0.md', 'spec/authority-model.md'],
    aliases: ['authority model', 'authority and integration model'],
  },
  {
    name: 'Connectivity resource contribution',
    docs: ['spec/architecture/ADCOS-2.0.md', 'spec/connectivity-resource-provider.md'],
    aliases: ['connectivity resource contribution', 'resource contribution', 'connectivity resource provider'],
  },
  {
    name: 'Group organizations and collective purchasing',
    docs: ['spec/architecture/ADCOS-2.0.md', 'spec/group-organizations-and-purchasing.md'],
    aliases: [
      'group organizations and collective purchasing',
      'group provider organizations and collective purchasing',
    ],
  },
];

function normalizeHeading(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractHeadings(markdown) {
  const headings = [];
  for (const line of markdown.split('\n')) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) headings.push(normalizeHeading(match[1]));
  }
  return headings;
}

if (architectureAvailable) {
  const lockedDocHeadings = new Map();
  for (const section of requiredLockedSections) {
    let anyDocAvailable = false;
    let satisfied = false;
    for (const doc of section.docs) {
      let headings = lockedDocHeadings.get(doc);
      if (headings === undefined) {
        const content = await readFile(resolve(root, doc), 'utf8').catch(() => null);
        headings = content === null ? null : extractHeadings(content);
        lockedDocHeadings.set(doc, headings);
      }
      if (headings === null) continue; // missing file already reported above
      anyDocAvailable = true;
      if (headings.some((heading) => section.aliases.some((alias) => heading.includes(alias)))) {
        satisfied = true;
      }
    }
    if (anyDocAvailable && !satisfied) {
      errors.push('locked architecture section missing: ' + section.name + ' (expected a heading in ' + section.docs.join(' or ') + ')');
    }
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (errors.length) {
  process.stderr.write('ADCOS 2.0 project-spec check FAILED\n' + errors.map((x) => '- ' + x).join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    'ADCOS 2.0 project-spec check PASSED (' +
      requiredFiles.length +
      ' required files; ' +
      requiredLockedSections.length +
      ' locked sections; ' +
      workOrderIds.length +
      ' unique work orders; current-state, architecture version, and frontier valid)\n',
  );
}
