#!/usr/bin/env node
/**
 * Open Agent System CLI Entry Point
 */

import { createCli } from './index.js';

const cli = createCli();
cli.parse(process.argv);
