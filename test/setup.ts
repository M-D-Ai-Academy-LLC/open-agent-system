/**
 * Global test setup for Vitest
 *
 * This file runs before all tests across all packages.
 * Add global mocks, fixtures, and utilities here.
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Global test timeout
beforeAll(() => {
  // Any global setup
});

afterAll(() => {
  // Any global cleanup
});

afterEach(() => {
  // Reset mocks after each test
});

// Extend Vitest matchers if needed
// declare module 'vitest' {
//   interface Assertion<T = unknown> {
//     toBeValidAgent(): T;
//   }
// }
