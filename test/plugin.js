'use strict';

const { strict: assert } = require('assert');

it
(
    'EslintEnvProcessor is an ES module export',
    async () =>
    {
        const { EslintEnvProcessor } = await import('eslint-plugin-eslint-env');
        assert(EslintEnvProcessor);
    },
);

it
(
    'Plugin metadata are exported',
    () =>
    {
        const { meta } = require('eslint-plugin-eslint-env');
        assert.equal(typeof meta.name, 'string');
        assert.equal(typeof meta.version, 'string');
    },
);

it
(
    'Processors are exported',
    () =>
    {
        const { EslintEnvProcessor, processors } = require('eslint-plugin-eslint-env');
        assert(processors['eslint-env'] instanceof EslintEnvProcessor);
    },
);
