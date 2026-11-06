'use strict';
const assert=require('node:assert/strict');
assert.equal(require('../package.json').version,'1.0.0','For later releases use verify_release_candidate.js');
require('./verify_release_candidate');
