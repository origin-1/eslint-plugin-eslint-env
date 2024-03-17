'use strict';

const { name, version }     = require('../package.json');
const EslintEnvProcessor    = require('./processor');

const defaultProcessor = new EslintEnvProcessor();
exports = module.exports =
{ meta: { name, version }, processors: { 'eslint-env': defaultProcessor } };
exports.EslintEnvProcessor = EslintEnvProcessor;
