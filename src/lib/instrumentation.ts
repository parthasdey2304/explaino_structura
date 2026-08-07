/**
 * JavaScript Instrumentation Engine
 * 
 * This module instruments JavaScript code to capture execution snapshots.
 * It wraps code and injects state capture calls after variable assignments,
 * array mutations, and loop iterations.
 * 
 * Based on the "Snapshot Model" from infrastructure.md:
 * 1. Parse code to understand structure
 * 2. Inject logging after mutations
 * 3. Execute in a sandbox
 * 4. Capture snapshots of state at each step
 */

import type { Snapshot, VariableState } from './visualizerStore';

// Maximum steps to prevent infinite loops
const MAX_STEPS = 1000;

/**
 * Deep clone a value for snapshot capture
 */
function deepClone(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepClone);
  }
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries()).map(([k, v]) => [k, deepClone(v)]));
  }
  if (value instanceof Set) {
    return Array.from(value).map(deepClone);
  }
  const cloned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    cloned[key] = deepClone(val);
  }
  return cloned;
}

/**
 * Determine the type of a variable
 */
function getVariableType(value: unknown): VariableState['type'] {
  if (value === null || value === undefined) return 'primitive';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'function') return 'function';
  if (typeof value === 'object') return 'object';
  return 'primitive';
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'ƒ()';
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 5);
    const formatted = entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ');
    const ellipsis = Object.keys(value).length > 5 ? '...' : '';
    return `{${formatted}${ellipsis}}`;
  }
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

/**
 * Simple JavaScript code instrumenter
 * Injects __captureState() calls after statements, passing along the live
 * values of every variable declared so far (since __captureState can't see
 * into the caller's local scope via `this` — it's called as a plain
 * function, so `this` is undefined in strict/module code).
 */
export function instrumentCode(code: string): string {
  const lines = code.split('\n');
  const instrumentedLines: string[] = [];

  // Collect every variable/function name declared anywhere in the code so
  // we know what to snapshot at each capture point. Declared later in the
  // file than the capture point is fine: referencing it before its `let`/
  // `const` initializer just throws inside the try/catch below, and `var`/
  // `function` are hoisted anyway.
  const declaredNames = new Set<string>();
  const declPatterns = [
    /(?:let|const|var)\s+(\w+)/g,
    /function\s+(\w+)/g,
  ];
  for (const pattern of declPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      declaredNames.add(match[1]);
    }
  }
  const varNamesList = Array.from(declaredNames);

  // Builds an object literal like `{ a: a, b: b }` guarding against
  // ReferenceErrors for variables not yet initialized at this point.
  const buildScopeSnapshot = () => {
    if (varNamesList.length === 0) return '{}';
    const entries = varNamesList
      .map((name) => `${JSON.stringify(name)}: (typeof ${name} !== 'undefined' ? ${name} : undefined)`)
      .join(', ');
    return `{ ${entries} }`;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      instrumentedLines.push(line);
      continue;
    }

    // Add the original line
    instrumentedLines.push(line);

    // Check if this line is a statement that might change state
    const isVariableDeclaration = /^(let|const|var)\s+\w+/.test(trimmed);
    const isAssignment = /\w+\s*=/.test(trimmed) && !trimmed.includes('==');
    const isArrayMutation = /\w+\.(push|pop|shift|unshift|splice|sort|reverse|fill)\s*\(/.test(trimmed);
    const isIncrementDecrement = /\w+(\+\+|--)/.test(trimmed) || /(\+\+|--)\w+/.test(trimmed);

    // Capture state after state-changing statements
    if (isVariableDeclaration || isAssignment || isArrayMutation || isIncrementDecrement) {
      instrumentedLines.push(`  __captureState(${lineNum}, ${buildScopeSnapshot()});`);
    }
  }

  const escapedCode = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

  // Add capture function definition
  const captureFunction = `
let __stepNumber = 0;
const __capturedStates = [];

function __captureState(lineNum, scope) {
  __stepNumber++;
  if (__stepNumber > ${MAX_STEPS}) {
    throw new Error('Execution exceeded maximum steps (${MAX_STEPS}). Possible infinite loop.');
  }

  const vars = [];

  for (const name of Object.keys(scope)) {
    if (name.startsWith('__')) continue; // Skip internal variables
    try {
      const value = scope[name];
      if (value === undefined) continue; // Not declared/initialized yet
      vars.push({
        name: name,
        value: value,
        type: Array.isArray(value) ? 'array' : (typeof value === 'function' ? 'function' : (typeof value === 'object' && value !== null ? 'object' : 'primitive'))
      });
    } catch (e) {}
  }

  __capturedStates.push({
    lineNumber: lineNum,
    variables: vars,
    code: \`${escapedCode}\`
  });
}

const __result = (function() {
${instrumentedLines.join('\n')}
  return __capturedStates;
})();

return __result;
`;

  return captureFunction;
}

/**
 * Execute JavaScript code and capture snapshots
 */
export async function executeAndCapture(code: string): Promise<{ snapshots: Snapshot[]; error: string | null }> {
  try {
    // Create a safe sandbox for execution
    const sandbox: Record<string, unknown> = {
      console: {
        log: (...args: unknown[]) => {
          // Capture console.log output if needed
        },
        error: (...args: unknown[]) => {},
        warn: (...args: unknown[]) => {},
      },
      Math: Math,
      JSON: JSON,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Date: Date,
      parseInt: parseInt,
      parseFloat: parseFloat,
      isNaN: isNaN,
      isFinite: isFinite,
    };
    
    // Create the instrumented code
    const instrumentedCode = instrumentCode(code);
    
    // Execute in sandbox using Function constructor
    const fn = new Function(...Object.keys(sandbox), instrumentedCode);
    const snapshots = fn(...Object.values(sandbox)) as Snapshot[];
    
    // Deep clone all snapshots to prevent reference issues
    const clonedSnapshots = snapshots.map(snap => ({
      ...snap,
      variables: snap.variables.map(v => ({
        ...v,
        value: deepClone(v.value),
      })),
    }));
    
    // Add initial state if empty
    if (clonedSnapshots.length === 0) {
      clonedSnapshots.push({
        lineNumber: 1,
        variables: [],
        code: code,
        description: 'Program started',
      });
    }
    
    // Add descriptions to snapshots
    const describedSnapshots = clonedSnapshots.map((snap, i) => ({
      ...snap,
      description: snap.description || `Step ${i + 1}: Line ${snap.lineNumber}`,
    }));
    
    return { snapshots: describedSnapshots, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { snapshots: [], error: errorMsg };
  }
}

/**
 * A more robust instrumenter using simple parsing
 * This version captures state after every statement
 */
export function instrumentCodeAdvanced(code: string): { instrumentedCode: string; lineMap: Map<number, number> } {
  const lines = code.split('\n');
  const lineMap = new Map<number, number>();
  
  const header = `
let __stepNumber = 0;
const __snapshots = [];

function __capture(lineNum) {
  __stepNumber++;
  if (__stepNumber > ${MAX_STEPS}) {
    throw new Error('Maximum execution steps exceeded. Possible infinite loop.');
  }
  
  const vars = [];
  const scope = { ${Object.keys(getDeclaredVariables(code)).join(', ')} };
  
  for (const [name, value] of Object.entries(scope)) {
    if (name.startsWith('__')) continue;
    try {
      vars.push({
        name,
        value,
        type: Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'primitive'
      });
    } catch (e) {}
  }
  
  __snapshots.push({ lineNumber: lineNum, variables: vars, code: __originalCode });
}
`;
  
  const instrumentedLines: string[] = [header];
  
  for (let i = 0; i < lines.length; i++) {
    const originalLineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();
    
    instrumentedLines.push(line);
    
    // Capture after meaningful statements
    if (shouldCaptureAfter(trimmed)) {
      instrumentedLines.push(`__capture(${originalLineNum});`);
      lineMap.set(instrumentedLines.length, originalLineNum);
    }
  }
  
  instrumentedLines.push('return __snapshots;');
  
  return { instrumentedCode: instrumentedLines.join('\n'), lineMap };
}

/**
 * Get all declared variables in code (simple regex-based)
 */
function getDeclaredVariables(code: string): Record<string, undefined> {
  const vars: Record<string, undefined> = {};
  const patterns = [
    /(?:let|const|var)\s+(\w+)/g,
    /function\s+(\w+)/g,
    /(\w+)\s*=/g,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      vars[match[1]] = undefined;
    }
  }
  
  return vars;
}

/**
 * Determine if we should capture state after this line
 */
function shouldCaptureAfter(line: string): boolean {
  if (!line) return false;
  if (line.startsWith('//')) return false;
  if (line.startsWith('/*')) return false;
  
  // Capture after assignments
  if (/\w+\s*=\s*/.test(line) && !/\s*===|\s*!==/.test(line)) return true;
  
  // Capture after variable declarations
  if (/^(let|const|var)\s+\w+/.test(line)) return true;
  
  // Capture after array methods that mutate
  if (/\.(push|pop|shift|unshift|splice|sort|reverse|fill)\s*\(/.test(line)) return true;
  
  // Capture after increment/decrement
  if (/\+\+|--/.test(line)) return true;
  
  return false;
}
