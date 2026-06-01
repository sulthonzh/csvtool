#!/usr/bin/env node
'use strict';
const { run } = require('../src/cli');
run().catch(err => {
  console.error(err.message);
  process.exit(1);
});
