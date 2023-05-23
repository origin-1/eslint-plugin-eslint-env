'use strict';

async function makeConfig()
{
    const [{ createFlatConfig }, { default: globals }] =
    await Promise.all([import('@origin-1/eslint-config'), import('globals')]);
    const config =
    await createFlatConfig
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
            files:              ['**/*.ts'],
            languageOptions:    { parserOptions: { project: 'tsconfig.json' } },
            tsVersion:          'latest',
        },
        {
            files:              ['**/*'],
            languageOptions:    { globals: { ...globals.node } },
        },
        {
            files:              ['test/**'],
            languageOptions:    { globals: { ...globals.mocha } },
        },
    );
    return config;
}

module.exports = makeConfig();
