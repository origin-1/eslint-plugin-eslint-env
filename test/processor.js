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

describe
(
    'eslint-env processor',
    () =>
    {
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
            'formats a global comment as expected',
            () =>
            {
                const code = '/* eslint-env test/test */';
                const plugins =
                {
                    'test':
                    {
                        environments:
                        {
                            'test':
                            {
                                globals:
                                { TRUE: true, FALSE: false, WRITABLE: 'writable', NULL: null },
                            },
                        },
                    },
                };
                const processor = new EslintEnvProcessor({ plugins });
                const [{ text }] = processor.preprocess(code);
                assert.equal(text, '/* global FALSE:false NULL TRUE:true WRITABLE:writable */');
            },
        );

        it
        (
            'formats an empty global comment',
            () =>
            {
                const code = '/*eslint-env*/';
                const processor = new EslintEnvProcessor();
                const [{ text }] = processor.preprocess(code);
                assert.equal(text, '/* global */');
            },
        );

        // #region Problem Filtering

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
            'does not report problems from disabled rules in processed lines',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code = 'foo /* eslint-env node */ ()';
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'max-len': 'error' } };
                const result = linter.verify(code, config);
                assert.deepEqual(result, []);
            },
        );

        it
        (
            'reports problems from disabled rules in unprocessed lines',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code =
                unindent
                `
                foo /* eslint-env node */ ()
                ${'/'.repeat(100)}
                `;
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'max-len': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].line, 2);
                assert.equal(result[0].endLine, 2);
            },
        );

        // #endregion

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

        // #region Single-line and Multiline Preservation

        it
        (
            'keeps comments single-lined',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code =
                unindent
                `
                function foo()
                {
                    bar(); /* eslint-env */ baz();
                }
                `;
                const processor = new EslintEnvProcessor();
                const config =
                { files: ['*'], processor, rules: { 'max-statements-per-line': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].ruleId, 'max-statements-per-line');
            },
        );

        it
        (
            'keeps comments multi-lined',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code =
                unindent
                `
                function foo()
                {
                    return /* eslint-env
                    browser */ document;
                }
                `;
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'no-unreachable': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].ruleId, 'no-unreachable');
            },
        );

        it
        (
            'preserves line break style',
            () =>
            {
                const code = '/*eslint-env\r\n*/';
                const processor = new EslintEnvProcessor();
                const [{ text }] = processor.preprocess(code);
                assert.equal(text, '/*\r\nglobal\r\n*/');
            },
        );

        // #endregion

        // #region Message Locations

        it
        (
            'adjusts message locations when there is no eslint-env comment in the line',
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
            'adjusts message locations when an eslint-env comment starts in the middle of a line',
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
            'adjusts message locations when an eslint-env comment ends in the middle of a line',
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
            'adjusts message locations with multiple eslint-env comments',
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

        // #endregion

        // #region Autofix

        it
        (
            'adjusts autofix locations',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code = '/* eslint-env jquery */ _ => _';
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'arrow-parens': 'error' } };
                const report = linter.verifyAndFix(code, config);
                assert.equal(report.fixed, true);
                assert.equal(report.output, '/* eslint-env jquery */ (_) => _');
            },
        );

        it
        (
            'suppresses autofixes that overlap with whole eslint-env comments',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code = 'let foo = () => {return void /* eslint-env jquery */ 0};';
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'arrow-body-style': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].ruleId, 'arrow-body-style');
                assert(!result[0].fix);
            },
        );

        it
        (
            'suppresses autofixes that overlap with the start of eslint-env comments',
            () =>
            {
                const code = 'foo; /* eslint-env jquery */ bar;';
                const filename = 'test.js';
                const processor = new EslintEnvProcessor();
                processor.preprocess(code, filename);
                const message = { ruleId: 'foobar', fix: { range: [0, 8], text: 'foo; /*' } };
                const result = processor.postprocess([[message]], filename);
                assert.equal(result.length, 1);
                assert.equal(result[0].ruleId, 'foobar');
                assert(!result[0].fix);
            },
        );

        it
        (
            'does not suppress autofixes that don\'t overlap with eslint-env comments',
            () =>
            {
                const linter = new Linter({ configType: 'flat' });
                const code = 'let foo = () => {return void 0}; /* eslint-env jquery */';
                const processor = new EslintEnvProcessor();
                const config = { files: ['*'], processor, rules: { 'arrow-body-style': 'error' } };
                const result = linter.verify(code, config);
                assert.equal(result.length, 1);
                assert.equal(result[0].ruleId, 'arrow-body-style');
                assert(result[0].fix);
            },
        );

        // #endregion
    },
);
