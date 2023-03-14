'use strict';

const { createConfig } = require('@origin-1/eslint-config');

module.exports =
createConfig
(
    {
        files:      ['*.js'],
        jsVersion:  2020,
    },
    {
        files:          ['*.mjs'],
        jsVersion:      2022,
        parserOptions:  { sourceType: 'module' },
    },
    {
        files:  ['*'],
        env:    { 'node': true },
    },
    {
        files:  ['test/**'],
        env:    { 'mocha': true },
    },
);
