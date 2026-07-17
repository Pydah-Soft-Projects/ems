'use strict';

require('dotenv').config();
const loadConfig = require('./configuration');

const config = loadConfig();

module.exports = { config };
