'use strict';

const { strict: assert } = require('assert');

it
(
    'EslintEnvProcessor is exported',
    async () =>
    {
        const { EslintEnvProcessor } = await import('eslint-plugin-eslint-env');
        assert(EslintEnvProcessor);
    },
);

it
(
    'Plugin metadata are exported',
    async () =>
    {
        const { default: { meta } } = await import('eslint-plugin-eslint-env');
        assert.equal(typeof meta.name, 'string');
        assert.equal(typeof meta.version, 'string');
    },
);
