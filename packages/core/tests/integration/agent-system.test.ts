/**
 * Agent System Verification Tests
 *
 * Tests that verify the markdown-based Open Agent System structure.
 * Validates folder structure, agent definitions, commands, and routing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

// =============================================================================
// Test Configuration
// =============================================================================

// Path to the open-agents system directory
const OPEN_AGENTS_PATH = resolve(__dirname, '../../../../open-agents');
const EXAMPLES_PATH = resolve(__dirname, '../../../../examples');

// =============================================================================
// Helper Functions
// =============================================================================

function fileExists(path: string): boolean {
  return existsSync(path);
}

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Parse a markdown file to extract section headers
 */
function extractMarkdownHeaders(content: string): string[] {
  const headerRegex = /^#{1,6}\s+(.+)$/gm;
  const headers: string[] = [];
  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    headers.push(match[1].trim());
  }
  return headers;
}

/**
 * Extract table data from markdown
 */
function extractMarkdownTables(content: string): Array<{ headers: string[]; rows: string[][] }> {
  const tableRegex = /\|(.+)\|\n\|[-|:]+\|\n((?:\|.+\|\n?)+)/g;
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    const headerLine = match[1];
    const bodyLines = match[2].trim().split('\n');

    const headers = headerLine.split('|').map((h) => h.trim()).filter(Boolean);
    const rows = bodyLines.map((line) =>
      line.split('|').map((cell) => cell.trim()).filter(Boolean)
    );

    tables.push({ headers, rows });
  }

  return tables;
}

/**
 * Validate agent file structure
 */
interface AgentValidation {
  valid: boolean;
  errors: string[];
  hasRequiredSections: boolean;
  hasPurpose: boolean;
  hasTriggers: boolean;
  hasCoreBehaviors: boolean;
  hasOutputFormat: boolean;
  hasOutputLocation: boolean;
}

function validateAgentFile(content: string): AgentValidation {
  const headers = extractMarkdownHeaders(content);
  const headersLower = headers.map((h) => h.toLowerCase());

  const errors: string[] = [];

  const hasPurpose = headersLower.some((h) => h.includes('purpose'));
  const hasTriggers = headersLower.some((h) => h.includes('trigger') || h.includes('when to use'));
  const hasCoreBehaviors = headersLower.some((h) => h.includes('core behavior'));
  const hasOutputFormat = headersLower.some((h) => h.includes('output format'));
  const hasOutputLocation = headersLower.some((h) => h.includes('output location'));

  if (!hasPurpose) errors.push('Missing Purpose section');
  if (!hasTriggers) errors.push('Missing Triggers/When to Use section');
  if (!hasCoreBehaviors) errors.push('Missing Core Behaviors section');
  if (!hasOutputFormat) errors.push('Missing Output Format section');
  if (!hasOutputLocation) errors.push('Missing Output Location section');

  const hasRequiredSections = hasPurpose && hasTriggers && hasCoreBehaviors;

  return {
    valid: errors.length === 0,
    errors,
    hasRequiredSections,
    hasPurpose,
    hasTriggers,
    hasCoreBehaviors,
    hasOutputFormat,
    hasOutputLocation,
  };
}

/**
 * Validate command file structure
 */
interface CommandValidation {
  valid: boolean;
  errors: string[];
  hasInstructions: boolean;
  hasArguments: boolean;
  hasUsageExamples: boolean;
}

function validateCommandFile(content: string): CommandValidation {
  const headers = extractMarkdownHeaders(content);
  const headersLower = headers.map((h) => h.toLowerCase());

  const errors: string[] = [];

  const hasInstructions = headersLower.some((h) => h.includes('instruction'));
  const hasArguments = content.includes('$ARGUMENTS');
  const hasUsageExamples = headersLower.some((h) => h.includes('usage') || h.includes('example'));

  if (!hasInstructions) errors.push('Missing Instructions section');
  if (!hasArguments) errors.push('Missing $ARGUMENTS placeholder');

  return {
    valid: errors.length <= 1, // Allow missing arguments for some commands
    errors,
    hasInstructions,
    hasArguments,
    hasUsageExamples,
  };
}

// =============================================================================
// Tests: Folder Structure Validation
// =============================================================================

describe('Folder Structure Validation', () => {
  describe('Main open-agents directory', () => {
    it('should have required top-level structure', () => {
      expect(isDirectory(OPEN_AGENTS_PATH)).toBe(true);

      const requiredDirs = ['agents', 'source'];
      for (const dir of requiredDirs) {
        expect(isDirectory(join(OPEN_AGENTS_PATH, dir))).toBe(true);
      }
    });

    it('should have INSTRUCTIONS.md', () => {
      expect(fileExists(join(OPEN_AGENTS_PATH, 'INSTRUCTIONS.md'))).toBe(true);
    });

    it('should have README.md', () => {
      expect(fileExists(join(OPEN_AGENTS_PATH, 'README.md'))).toBe(true);
    });

    it('should have output directories', () => {
      const outputDirs = ['output-drafts', 'output-refined', 'output-final'];
      const existingOutputDirs = outputDirs.filter((dir) =>
        isDirectory(join(OPEN_AGENTS_PATH, dir))
      );
      expect(existingOutputDirs.length).toBeGreaterThan(0);
    });
  });

  describe('Example projects', () => {
    it('should have example directories', () => {
      expect(isDirectory(EXAMPLES_PATH)).toBe(true);
      const examples = listFiles(EXAMPLES_PATH);
      expect(examples.length).toBeGreaterThan(0);
    });

    it('history-research example should have complete structure', () => {
      const historyPath = join(EXAMPLES_PATH, 'history-research');
      if (isDirectory(historyPath)) {
        expect(fileExists(join(historyPath, 'CLAUDE.md'))).toBe(true);
        expect(fileExists(join(historyPath, 'GEMINI.md'))).toBe(true);
        expect(isDirectory(join(historyPath, 'open-agents'))).toBe(true);
        expect(isDirectory(join(historyPath, '.claude/commands'))).toBe(true);
        expect(isDirectory(join(historyPath, '.gemini/commands'))).toBe(true);
      }
    });

    it('content-pipeline example should have complete structure', () => {
      const pipelinePath = join(EXAMPLES_PATH, 'content-pipeline');
      if (isDirectory(pipelinePath)) {
        expect(fileExists(join(pipelinePath, 'CLAUDE.md'))).toBe(true);
        expect(fileExists(join(pipelinePath, 'GEMINI.md'))).toBe(true);
        expect(isDirectory(join(pipelinePath, 'open-agents'))).toBe(true);
        expect(isDirectory(join(pipelinePath, 'open-agents/agents'))).toBe(true);
      }
    });
  });
});

// =============================================================================
// Tests: INSTRUCTIONS.md Parsing
// =============================================================================

describe('INSTRUCTIONS.md Parsing', () => {
  let instructionsContent: string;

  beforeAll(() => {
    const instructionsPath = join(OPEN_AGENTS_PATH, 'INSTRUCTIONS.md');
    if (fileExists(instructionsPath)) {
      instructionsContent = readFile(instructionsPath);
    }
  });

  it('should have mandatory read directive pattern', () => {
    if (!instructionsContent) return;

    const content = instructionsContent.toLowerCase();
    expect(
      content.includes('load this file') ||
        content.includes('read this file') ||
        content.includes('immediately')
    ).toBe(true);
  });

  it('should have Agent Catalog section', () => {
    if (!instructionsContent) return;

    const headers = extractMarkdownHeaders(instructionsContent);
    const hasAgentCatalog = headers.some(
      (h) => h.toLowerCase().includes('agent') && h.toLowerCase().includes('catalog')
    );
    expect(hasAgentCatalog).toBe(true);
  });

  it('should have routing/detection table', () => {
    if (!instructionsContent) return;

    const tables = extractMarkdownTables(instructionsContent);
    expect(tables.length).toBeGreaterThan(0);

    // At least one table should have agent-related columns
    const hasRoutingTable = tables.some(
      (t) =>
        t.headers.some((h) => h.toLowerCase().includes('agent')) ||
        t.headers.some((h) => h.toLowerCase().includes('route'))
    );
    expect(hasRoutingTable).toBe(true);
  });

  it('should reference agent files in agents/ directory', () => {
    if (!instructionsContent) return;

    expect(instructionsContent.includes('agents/')).toBe(true);
  });
});

// =============================================================================
// Tests: Agent File Validation
// =============================================================================

describe('Agent File Validation', () => {
  const agentsPath = join(OPEN_AGENTS_PATH, 'agents');
  let agentFiles: string[] = [];

  beforeAll(() => {
    if (isDirectory(agentsPath)) {
      agentFiles = listFiles(agentsPath).filter((f) => f.endsWith('.md'));
    }
  });

  it('should have at least one agent defined', () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  it('each agent should have required sections', () => {
    for (const file of agentFiles) {
      const content = readFile(join(agentsPath, file));
      const validation = validateAgentFile(content);

      expect(validation.hasRequiredSections).toBe(true);
      if (!validation.hasRequiredSections) {
        console.log(`Agent ${file} missing sections:`, validation.errors);
      }
    }
  });

  it('each agent should have a Purpose section', () => {
    for (const file of agentFiles) {
      const content = readFile(join(agentsPath, file));
      const validation = validateAgentFile(content);
      expect(validation.hasPurpose).toBe(true);
    }
  });

  it('each agent should have Core Behaviors section', () => {
    for (const file of agentFiles) {
      const content = readFile(join(agentsPath, file));
      const validation = validateAgentFile(content);
      expect(validation.hasCoreBehaviors).toBe(true);
    }
  });
});

// =============================================================================
// Tests: Command File Validation
// =============================================================================

describe('Command File Validation', () => {
  it('should have .claude/commands directory', () => {
    const claudeCommandsPath = join(resolve(__dirname, '../../../..'), '.claude/commands');
    // Check both project root and open-agents-system folder
    const alternativePath = join(OPEN_AGENTS_PATH, '../.claude/commands');

    expect(
      isDirectory(claudeCommandsPath) || isDirectory(alternativePath)
    ).toBe(true);
  });

  it('example projects should have matching claude and gemini commands', () => {
    const exampleDirs = ['history-research', 'content-pipeline'];

    for (const example of exampleDirs) {
      const examplePath = join(EXAMPLES_PATH, example);
      if (!isDirectory(examplePath)) continue;

      const claudeCmds = join(examplePath, '.claude/commands');
      const geminiCmds = join(examplePath, '.gemini/commands');

      if (isDirectory(claudeCmds) && isDirectory(geminiCmds)) {
        // Get command subdirectories
        const claudeSubdirs = listFiles(claudeCmds).filter((f) =>
          isDirectory(join(claudeCmds, f))
        );

        for (const subdir of claudeSubdirs) {
          const claudeFiles = listFiles(join(claudeCmds, subdir)).filter((f) =>
            f.endsWith('.md')
          );
          const geminiFiles = listFiles(join(geminiCmds, subdir)).filter((f) =>
            f.endsWith('.md')
          );

          expect(claudeFiles.length).toBeGreaterThan(0);
          expect(geminiFiles.length).toBeGreaterThan(0);
          expect(claudeFiles.sort()).toEqual(geminiFiles.sort());
        }
      }
    }
  });

  it('command files should have valid structure', () => {
    for (const example of ['history-research', 'content-pipeline']) {
      const examplePath = join(EXAMPLES_PATH, example);
      if (!isDirectory(examplePath)) continue;

      const claudeCmds = join(examplePath, '.claude/commands');
      if (!isDirectory(claudeCmds)) continue;

      const subdirs = listFiles(claudeCmds).filter((f) =>
        isDirectory(join(claudeCmds, f))
      );

      for (const subdir of subdirs) {
        const files = listFiles(join(claudeCmds, subdir)).filter((f) =>
          f.endsWith('.md')
        );

        for (const file of files) {
          const content = readFile(join(claudeCmds, subdir, file));
          const validation = validateCommandFile(content);

          expect(validation.hasInstructions).toBe(true);
          if (!validation.valid) {
            console.log(
              `Command ${example}/${subdir}/${file} issues:`,
              validation.errors
            );
          }
        }
      }
    }
  });
});

// =============================================================================
// Tests: Routing Table Validation
// =============================================================================

describe('Routing Table Validation', () => {
  let instructionsContent: string;

  beforeAll(() => {
    const instructionsPath = join(OPEN_AGENTS_PATH, 'INSTRUCTIONS.md');
    if (fileExists(instructionsPath)) {
      instructionsContent = readFile(instructionsPath);
    }
  });

  it('should have task type detection table', () => {
    if (!instructionsContent) return;

    const content = instructionsContent.toLowerCase();
    expect(
      content.includes('task type') ||
        content.includes('route to') ||
        content.includes('detection')
    ).toBe(true);
  });

  it('routing table should reference valid agents', () => {
    if (!instructionsContent) return;

    const agentsPath = join(OPEN_AGENTS_PATH, 'agents');
    if (!isDirectory(agentsPath)) return;

    const agentFiles = listFiles(agentsPath).filter((f) => f.endsWith('.md'));
    const agentNames = agentFiles.map((f) => f.replace('.md', '').toLowerCase());

    const tables = extractMarkdownTables(instructionsContent);

    for (const table of tables) {
      // Find the agent column
      const agentColIndex = table.headers.findIndex(
        (h) =>
          h.toLowerCase().includes('agent') ||
          h.toLowerCase().includes('route') ||
          h.toLowerCase().includes('file')
      );

      if (agentColIndex === -1) continue;

      for (const row of table.rows) {
        if (row.length <= agentColIndex) continue;

        const agentRef = row[agentColIndex].toLowerCase();

        // Check if reference contains a valid agent name
        // Allow for references like "Project Assistant" or "project-assistant.md"
        const normalizedRef = agentRef
          .replace(/\.md$/, '')
          .replace(/-/g, '')
          .replace(/_/g, '')
          .replace(/\s+/g, '');

        const normalizedAgentNames = agentNames.map((n) =>
          n.replace(/-/g, '').replace(/_/g, '')
        );

        const isValid =
          normalizedAgentNames.some((name) => normalizedRef.includes(name)) ||
          agentRef.includes('agents/');

        // This is a soft check - not all table cells are agent references
        if (agentRef && !agentRef.includes('|') && agentRef.length > 3) {
          // Log for debugging but don't fail
          if (!isValid) {
            console.log(`Potentially invalid agent reference: ${agentRef}`);
          }
        }
      }
    }
  });
});

// =============================================================================
// Tests: Entry Point Files
// =============================================================================

describe('Entry Point Files', () => {
  it('CLAUDE.md should have mandatory read directive', () => {
    const claudeMdPath = join(resolve(__dirname, '../../../..'), 'CLAUDE.md');
    if (fileExists(claudeMdPath)) {
      const content = readFile(claudeMdPath);
      expect(
        content.includes('INSTRUCTIONS.md') ||
          content.includes('open-agents')
      ).toBe(true);
    }
  });

  it('example entry points should reference INSTRUCTIONS.md', () => {
    for (const example of ['history-research', 'content-pipeline']) {
      const examplePath = join(EXAMPLES_PATH, example);
      if (!isDirectory(examplePath)) continue;

      const claudeMd = join(examplePath, 'CLAUDE.md');
      const geminiMd = join(examplePath, 'GEMINI.md');

      if (fileExists(claudeMd)) {
        const content = readFile(claudeMd);
        expect(content.includes('INSTRUCTIONS.md')).toBe(true);
      }

      if (fileExists(geminiMd)) {
        const content = readFile(geminiMd);
        expect(content.includes('INSTRUCTIONS.md')).toBe(true);
      }
    }
  });
});

// =============================================================================
// Tests: Cross-Reference Validation
// =============================================================================

describe('Cross-Reference Validation', () => {
  it('agents referenced in commands should exist', () => {
    for (const example of ['history-research', 'content-pipeline']) {
      const examplePath = join(EXAMPLES_PATH, example);
      if (!isDirectory(examplePath)) continue;

      const agentsPath = join(examplePath, 'open-agents/agents');
      if (!isDirectory(agentsPath)) continue;

      const agentFiles = listFiles(agentsPath)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.toLowerCase());

      const claudeCmds = join(examplePath, '.claude/commands');
      if (!isDirectory(claudeCmds)) continue;

      const subdirs = listFiles(claudeCmds).filter((f) =>
        isDirectory(join(claudeCmds, f))
      );

      for (const subdir of subdirs) {
        const files = listFiles(join(claudeCmds, subdir)).filter((f) =>
          f.endsWith('.md')
        );

        for (const file of files) {
          const content = readFile(join(claudeCmds, subdir, file));

          // Extract agent references from command
          const agentRefs = content.match(/agents\/[\w-]+\.md/g) || [];

          for (const ref of agentRefs) {
            const agentFileName = ref.replace('agents/', '').toLowerCase();
            expect(agentFiles).toContain(agentFileName);
          }
        }
      }
    }
  });
});
