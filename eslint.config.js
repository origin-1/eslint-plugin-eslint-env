'use strict';

async function makeConfig()
{
    const [{ createConfig }, { default: globals }] =
    await Promise.all([import('@origin-1/eslint-config'), import('globals')]);
    const config =
    await createConfig
    (
        {
            ignores: ['coverage'],
        },
        {
            files:              ['**/*.js'],
            jsVersion:          2020,
            languageOptions:    { sourceType: 'commonjs' },
        },
        {
            files:      ['**/*.mjs'],
            jsVersion:  2022,
        },
        {
            files:      ['**/*.ts'],
            tsVersion:  'latest',
        },
        {
            files:              ['**/*'],
            languageOptions:    { globals: { ...globals.node } },
        },
        {
            files:              ['test/**'],
            languageOptions:    { globals: { ...globals.mocha } },
        },
        {
            files:              ['package.json'],
            jsonVersion:        'standard',
            language:           'json/json',
        },
        {
            files:              ['tsconfig.json'],
            jsonVersion:        'standard',
            language:           'json/jsonc',
            languageOptions:    { allowTrailingCommas: true },
        },
    );
    return config;
}

module.exports = makeConfig();
