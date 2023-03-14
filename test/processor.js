'use strict';

const { strict: assert }    = require('assert');
const { Linter }            = require('eslint');
const EslintEnvProcessor    = require('../lib/processor');

function unindent(strings, ...values)
{
    const text = String.raw(strings, ...values);
    const lines =
    text.replace(/^\n/, '').replace(/\n *$/u, '').split('\n').map(line => line.trimEnd());
    const minLineIndent =
    lines.reduce
    (
        (minIndent, line) =>
        {
            if (line)
            {
                const indent = line.match(/ */u)[0].length;
                if (indent < minIndent)
                    return indent;
            }
            return minIndent;
        },
        Infinity,
    );
    return lines.map(line => line.slice(minLineIndent)).join('\n');
}

it
(
    'inserts a global comment',
    () =>
    {
        const linter = new Linter({ configType: 'flat' });
        const code = '/* eslint-env mocha */ it';
        const processor = new EslintEnvProcessor();
        const config = { files: ['*'], processor, rules: { 'no-undef': 'error' } };
        const result = linter.verify(code, config);
        assert.deepEqual(result, []);
    },
);

it
(
    'does not report problems in an inserted global comment',
    () =>
    {
        const linter = new Linter({ configType: 'flat' });
        const code = '/* eslint-env node */';
        const processor = new EslintEnvProcessor();
        const config = { files: ['*'], processor, rules: { 'no-unused-vars': 'error' } };
        const result = linter.verify(code, config);
        assert.deepEqual(result, []);
    },
);

it
(
    'handles plugins with or without custom environments',
    () =>
    {
        const linter = new Linter({ configType: 'flat' });
        const code = '/* eslint-env cypress/globals */ cy';
        const processor =
        new EslintEnvProcessor
        ({ plugins: { 'cypress': require('eslint-plugin-cypress'), 'foobar': { } } });
        const config = { files: ['*'], processor, rules: { 'no-undef': 'error' } };
        const result = linter.verify(code, config);
        assert.deepEqual(result, []);
    },
);

describe
(
    'adjusts message locations',
    () =>
    {
        it
        (
            'in the simple case',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code = '/* eslint-env\nmocha */ it\n foo';
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'no-undef': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].line, 3);
                assert.equal(result[0].column, 2);
                assert.equal(result[0].endLine, 3);
                assert.equal(result[0].endColumn, 5);
            },
        );

        it
        (
            'when an eslint-env comment starts in the middle of a line',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code = 'foo; /* eslint-env mocha */';
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'no-undef': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].line, 1);
                assert.equal(result[0].column, 1);
                assert.equal(result[0].endLine, 1);
                assert.equal(result[0].endColumn, 4);
            },
        );

        it
        (
            'when an eslint-env comment ends in the middle of a line',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code = '/* eslint-env mocha */ foo;';
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'no-undef': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].line, 1);
                assert.equal(result[0].column, 24);
                assert.equal(result[0].endLine, 1);
                assert.equal(result[0].endColumn, 27);
            },
        );

        it
        (
            'with multiple eslint-env comments',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code =
                unindent
                `
                /* eslint-env unknown */
                1;
                /*
                eslint-env node -- Node.js environment
                */
                foo; /* eslint-env mocha */ bar;
                `;
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'no-undef': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 2);
                assert.equal(result[0].line, 6);
                assert.equal(result[0].column, 1);
                assert.equal(result[0].endLine, 6);
                assert.equal(result[0].endColumn, 4);
                assert.equal(result[1].line, 6);
                assert.equal(result[1].column, 29);
                assert.equal(result[1].endLine, 6);
                assert.equal(result[1].endColumn, 32);
            },
        );
    },
);
