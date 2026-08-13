#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { scanCommand } from './cli/commands/scan.js';
import { lsCommand } from './cli/commands/ls.js';
import { PACKAGE_VERSION } from './version.js';

export const main = defineCommand({
  meta: {
    name: 'skillctl',
    version: PACKAGE_VERSION,
    description: 'Skill drift analysis and local inventory tool'
  },
  subCommands: {
    scan: scanCommand,
    ls: lsCommand
  }
});

runMain(main);
