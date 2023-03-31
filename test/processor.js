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

function verifyAndFixWithProcessor(code, config, processorOptions)
{
    const linter = new Linter({ configType: 'flat' });
    const processor = new EslintEnvProcessor(processorOptions);
    const report = linter.verifyAndFix(code, { files: ['*'], processor, ...config });
    return report;
}

function verifyWithProcessor(code, config, processorOptions)
{
    const linter = new Linter({ configType: 'flat' });
    const processor = new EslintEnvProcessor(processorOptions);
    const lintMessages = linter.verify(code, { files: ['*'], processor, ...config });
    return lintMessages;
}

describe
(
    'eslint-env processor',
    () =>
    {
        // #region Comment Formatting

        it
        (
            'replaces an eslint-env comment as expected',
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
            'replaces an empty eslint-env comment without surrounding spaces',
            () =>
            {
                const code = '/*eslint-env*/';
                const processor = new EslintEnvProcessor();
                const [{ text }] = processor.preprocess(code);
                assert.equal(text, '/*global*/');
            },
        );

        it
        (
            'replaces an empty eslint-env comment with multiple terminating spaces',
            () =>
            {
                const code = '/*eslint-env\t\t*/';
                const processor = new EslintEnvProcessor();
                const [{ text }] = processor.preprocess(code);
                assert.equal(text, '/*global */');
            },
        );

        // #endregion

        // #region Single-line and Multiline Preservation

        it
        (
            'keeps comments single-lined',
            () =>
            {
                const code =
                unindent
                `
                function foo()
                {
                    bar(); /* eslint-env */ baz();
                }
                `;
                const config = { rules: { 'max-statements-per-line': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'max-statements-per-line');
            },
        );

        it
        (
            'keeps comments multi-lined',
            () =>
            {
                const code =
                unindent
                `
                function foo()
                {
                    return /* eslint-env
                    browser */ document;
                }
                `;
                const config = { rules: { 'no-unreachable': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'no-unreachable');
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

        // #region Justification Preservation

        it
        (
            'preserves justifications in single-line eslint-env comments',
            () =>
            {
                const code = '/* eslint-env node -- TODO: replace eslint-env with global */';
                const config =
                { rules: { 'no-warning-comments': ['error', { location: 'anywhere' }] } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'no-warning-comments');
            },
        );

        it
        (
            'preserves justifications in multiline eslint-env comments',
            () =>
            {
                const code = '/* eslint-env node\n-- TODO: replace eslint-env with global */';
                const config =
                { rules: { 'no-warning-comments': ['error', { location: 'anywhere' }] } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'no-warning-comments');
            },
        );

        // #endregion

        // #region `disabledRules`

        it
        (
            'fails if `disabledRules` is null',
            () =>
            {
                assert.throws
                (
                    () => new EslintEnvProcessor({ disabledRules: null }),
                    {
                        constructor: TypeError,
                        message:
                        'disabledRules must be an object or undefined, but null was specified',
                    },
                );
            },
        );

        it
        (
            'fails if `disabledRules` is a function',
            () =>
            {
                const noop = () => { };
                assert.throws
                (
                    () => new EslintEnvProcessor({ disabledRules: noop }),
                    {
                        constructor: TypeError,
                        message:
                        'disabledRules must be an object or undefined, but [Function: noop] was ' +
                        'specified',
                    },
                );
            },
        );

        it
        (
            'fails if `disabledRules` is a primitive',
            () =>
            {
                assert.throws
                (
                    () => new EslintEnvProcessor({ disabledRules: Symbol() }),
                    {
                        constructor: TypeError,
                        message:
                        'disabledRules must be an object or undefined, but Symbol() was specified',
                    },
                );
            },
        );

        it
        (
            'fails if a `disabledRules` value is invalid',
            () =>
            {
                assert.throws
                (
                    () => new EslintEnvProcessor({ disabledRules: { foo: 'bar' } }),
                    {
                        constructor: TypeError,
                        message:
                        'Valid settings for disabledRules values are \'intersection\', ' +
                        '\'overlap\', \'always\' or undefined, but \'bar\' was specified for ' +
                        'rule \'foo\'',
                    },
                );
            },
        );

        it
        (
            '`disabledRules` settings can be overridden',
            () =>
            {
                const code = '/* eslint-env node */\n;';
                const config = { rules: { 'max-len': 'error', 'no-extra-semi': 'error' } };
                const processorOptions =
                { disabledRules: { 'max-len': 'intersection', 'no-extra-semi': 'anywhere' } };
                const lintMessages = verifyWithProcessor(code, config, processorOptions);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'max-len');
                assert.equal(lintMessages[0].line, 1);
                assert.equal(lintMessages[0].column, 1);
                assert.equal(lintMessages[0].endLine, 1);
                assert.equal(lintMessages[0].endColumn, 22);
            },
        );

        it
        (
            '`disabledRules` settings are not overridden by undefined values',
            () =>
            {
                const code = '/* eslint-env node */';
                const config = { rules: { 'max-len': 'error' } };
                const processorOptions = { disabledRules: { 'max-len': undefined } };
                const lintMessages = verifyWithProcessor(code, config, processorOptions);
                assert.deepEqual(lintMessages, []);
            },
        );

        // #endregion

        // #region `plugins`

        it
        (
            'handles plugins with or without custom environments',
            () =>
            {
                const code = '/* eslint-env cypress/globals */ cy';
                const config = { rules: { 'no-undef': 'error' } };
                const processorOptions =
                { plugins: { 'cypress': require('eslint-plugin-cypress'), 'foobar': { } } };
                const lintMessages = verifyWithProcessor(code, config, processorOptions);
                assert.deepEqual(lintMessages, []);
            },
        );

        // #endregion

        // #region Problem Filtering

        it
        (
            'does not report problems in intersection with a replaced comment',
            () =>
            {
                const code = '/* eslint-env node */';
                const config = { rules: { 'no-unused-vars': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.deepEqual(lintMessages, []);
            },
        );

        it
        (
            'does not report problems from rules disabled on overlap that contain replaced ' +
            'comments',
            () =>
            {
                const code =
                unindent
                `
                function test()
                {
                    /*
                    eslint-env
                    node
                    */
                }
                foo /* eslint-env node */ ()
                `;
                const config =
                { rules: { 'max-len': 'error', 'max-lines-per-function': ['error', { max: 10 }] } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.deepEqual(lintMessages, []);
            },
        );

        it
        (
            'reports problems from rules disabled on overlap that do not contain replaced comments',
            () =>
            {
                const code =
                unindent
                `
                foo /* eslint-env node */ ()
                ${'/'.repeat(100)}
                `;
                const config = { rules: { 'max-len': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'max-len');
                assert.equal(lintMessages[0].line, 2);
                assert.equal(lintMessages[0].endLine, 2);
            },
        );

        it
        (
            'does not report problems from rules disabled anywhere when there is a replaced ' +
            'comment',
            () =>
            {
                const code =
                unindent
                `
                /* eslint-env
                jquery */
                foo;
                `;
                const config = { rules: { 'max-lines': ['error', { max: 5 }] } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.deepEqual(lintMessages, []);
            },
        );

        it
        (
            'reports problems from rules disabled anywhere when there is no replaced comment',
            () =>
            {
                const code = 'foo;\nbar;\nbaz\n;';
                const config = { rules: { 'max-lines': ['error', { max: 1 }] } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'max-lines');
                assert.equal(lintMessages[0].line, 2);
                assert.equal(lintMessages[0].endLine, 4);
            },
        );

        // #endregion

        // #region Message Locations

        it
        (
            'adjusts message locations when there is no eslint-env comment in the line',
            () =>
            {
                const code = '/* eslint-env\nmocha */ it\n foo';
                const config = { rules: { 'no-undef': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].line, 3);
                assert.equal(lintMessages[0].column, 2);
                assert.equal(lintMessages[0].endLine, 3);
                assert.equal(lintMessages[0].endColumn, 5);
            },
        );

        it
        (
            'adjusts message locations when an eslint-env comment starts in the middle of a line',
            () =>
            {
                const code = 'foo; /* eslint-env mocha */';
                const config = { rules: { 'no-undef': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].line, 1);
                assert.equal(lintMessages[0].column, 1);
                assert.equal(lintMessages[0].endLine, 1);
                assert.equal(lintMessages[0].endColumn, 4);
            },
        );

        it
        (
            'adjusts message locations when an eslint-env comment ends in the middle of a line',
            () =>
            {
                const code = '/* eslint-env mocha */ foo;';
                const config = { rules: { 'no-undef': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].line, 1);
                assert.equal(lintMessages[0].column, 24);
                assert.equal(lintMessages[0].endLine, 1);
                assert.equal(lintMessages[0].endColumn, 27);
            },
        );

        it
        (
            'adjusts message locations with multiple eslint-env comments',
            () =>
            {
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
                const config = { rules: { 'no-undef': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 2);
                assert.equal(lintMessages[0].line, 6);
                assert.equal(lintMessages[0].column, 1);
                assert.equal(lintMessages[0].endLine, 6);
                assert.equal(lintMessages[0].endColumn, 4);
                assert.equal(lintMessages[1].line, 6);
                assert.equal(lintMessages[1].column, 29);
                assert.equal(lintMessages[1].endLine, 6);
                assert.equal(lintMessages[1].endColumn, 32);
            },
        );

        // #endregion

        // #region Autofix

        it
        (
            'adjusts autofix locations',
            () =>
            {
                const code = '/* eslint-env jquery */ _ => _';
                const config = { rules: { 'arrow-parens': 'error' } };
                const report = verifyAndFixWithProcessor(code, config);
                assert.equal(report.fixed, true);
                assert.equal(report.output, '/* eslint-env jquery */ (_) => _');
            },
        );

        it
        (
            'suppresses autofixes that overlap with whole eslint-env comments',
            () =>
            {
                const code = 'let foo = () => {return void /* eslint-env jquery */ 0};';
                const config = { rules: { 'arrow-body-style': 'error' } };
                const report = verifyAndFixWithProcessor(code, config);
                assert.equal(report.fixed, false);
                assert.equal(report.messages.length, 1);
                assert.equal(report.messages[0].ruleId, 'arrow-body-style');
            },
        );

        it
        (
            'suppresses autofixes that overlap with part of an eslint-env comment',
            () =>
            {
                const code = '/*eslint-env amd*/';
                const config =
                { rules: { 'spaced-comment': ['error', 'never', { markers: ['global'] }] } };
                const report = verifyAndFixWithProcessor(code, config);
                assert.equal(report.fixed, false);
                assert.equal(report.messages.length, 1);
                assert.equal(report.messages[0].ruleId, 'spaced-comment');
            },
        );

        it
        (
            'does not suppress autofixes that don\'t overlap with eslint-env comments',
            () =>
            {
                const code = 'let foo = () => {return void 0}; /* eslint-env jquery */';
                const config = { rules: { 'arrow-body-style': 'error' } };
                const lintMessages = verifyWithProcessor(code, config);
                assert.equal(lintMessages.length, 1);
                assert.equal(lintMessages[0].ruleId, 'arrow-body-style');
                assert(lintMessages[0].fix);
            },
        );

        // #endregion
    },
);
