'use strict';

const { inspect } = require('util');
const { SourceCode } = require('eslint');

const { BuiltInEnvironments, commentParser, validatePlugins } =
(() =>
{
    const { createRequire } = require('module');

    const requireAsESLint = createRequire(require.resolve('eslint'));
    const { Legacy: { environments: BuiltInEnvironments } } = require('@eslint/eslintrc/universal');
    const ConfigCommentParser = requireAsESLint('./linter/config-comment-parser');
    const { flatConfigSchema: { plugins: { validate: validatePlugins } } } =
    requireAsESLint('./config/flat-config-schema');
    const commentParser = new ConfigCommentParser();
    return { BuiltInEnvironments, commentParser, validatePlugins };
}
)();

const DEFAULT_DISABLED_RULES =
{
    'max-len':                  'overlap',
    'max-lines':                'anywhere-multiline',
    'max-lines-per-function':   'overlap',
};

const DISABLED_RULE_STATES = ['intersection', 'overlap', 'anywhere', 'anywhere-multiline'];

function normalizeDisabledRules(rawDisabledRules = { })
{
    if (!rawDisabledRules || typeof rawDisabledRules !== 'object')
    {
        const message =
        `disabledRules must be an object or undefined, but ${inspect(rawDisabledRules)
        } was specified`;
        throw TypeError(message);
    }
    const disabledRules = { __proto__: null, ...DEFAULT_DISABLED_RULES };
    for (const [ruleId, value] of Object.entries(rawDisabledRules))
    {
        if (value === undefined)
            continue;
        if (DISABLED_RULE_STATES.includes(value))
            disabledRules[ruleId] = value;
        else
        {
            const message =
            `Valid settings for disabledRules values are ${
            DISABLED_RULE_STATES.map(disabledRuleState => `'${disabledRuleState}'`).join(', ')
            } or undefined, but ${inspect(value)} was specified for rule '${ruleId}'`;
            throw TypeError(message);
        }
    }
    return disabledRules;
}

function getPluginEnvironments(plugins)
{
    try
    {
        validatePlugins(plugins);
    }
    catch (error)
    {
        error.message = `Key "plugins": ${error.message}`;
        throw error;
    }
    const pluginEnvironments = new Map();
    for (const [pluginName, { environments }] of Object.entries(plugins))
    {
        if (!environments)
            continue;
        for (const [envBaseName, env] of Object.entries(environments))
        {
            const envName = `${pluginName}/${envBaseName}`;
            pluginEnvironments.set(envName, env);
        }
    }
    return pluginEnvironments;
}

const eslintEnvPattern = /\/\*(\s*)eslint-env(\s.+?)??(\s*)\*\//gsu;

function extractDirectiveComment(text = '')
{
    let directive;
    let justification;
    const match = /\s-{2,}\s/u.exec(text);
    if (!match)
        directive = text.trim();
    else
    {
        const { index } = match;
        directive       = text.slice(0, index).trim();
        justification   = text.slice(index).trim();
    }
    const returnValue = { directive, justification };
    return returnValue;
}

const lineBreakPattern = /\r\n|[\r\n\u2028\u2029]/u;

function extractLineBreak(text)
{
    const match = lineBreakPattern.exec(text);
    if (match)
    {
        const [lineBreak] = match;
        return lineBreak;
    }
}

function findEslintEnvInfos(text)
{
    const eslintEnvInfos = [];
    eslintEnvPattern.lastIndex = 0;
    for (let match; match = eslintEnvPattern.exec(text);)
    {
        const { directive, justification } = extractDirectiveComment(match[2]);
        const env = commentParser.parseListConfig(directive);
        const lineBreak = extractLineBreak(match[0]);
        const start = match.index;
        const end = eslintEnvPattern.lastIndex;
        const eslintEnvInfo =
        {
            env,
            format:
            {
                hasSpaceAfter:  Boolean(match[3]),
                hasSpaceBefore: Boolean(match[1]),
                justification,
                lineBreak,
            },
            preferredRange: null,
            range:          [start, end],
            replacement:    undefined,
        };
        eslintEnvInfos.push(eslintEnvInfo);
    }
    return eslintEnvInfos;
}

function resolveGlobalsFromEnv(env, pluginEnvironments)
{
    const enabledEnvs =
    Object.keys(env)
    .map(envName => pluginEnvironments.get(envName) || BuiltInEnvironments.get(envName))
    .filter(env => env);
    const globals = Object.assign({ }, ...enabledEnvs.map(({ globals }) => globals));
    return globals;
}

function createReplacement(globals, { hasSpaceAfter, hasSpaceBefore, justification, lineBreak })
{
    const parts =
    Object
    .keys(globals)
    .sort()
    .map
    (
        key =>
        {
            const value = globals[key];
            const part = `${key}${value != null ? `:${value}` : ''}`;
            return part;
        },
    );
    let spaceBefore;
    let spaceAfter;
    let spaceBetween;
    if (lineBreak)
        spaceBefore = spaceAfter = spaceBetween = lineBreak;
    else
    {
        spaceBefore = hasSpaceBefore ? ' ' : '';
        spaceAfter = hasSpaceAfter ? ' ' : '';
        spaceBetween = ' ';
    }
    const directivePart = parts.map(part => `${spaceBetween}${part}`).join('');
    const justificationPart = justification ? `${spaceBetween}${justification}` : '';
    const replacement = `/*${spaceBefore}global${directivePart}${justificationPart}${spaceAfter}*/`;
    return replacement;
}

function replaceEslintEnvComments(text, eslintEnvInfos)
{
    const raw = [];
    const substitutions = [];
    let lastIndex = 0;
    for (const { range, replacement } of eslintEnvInfos)
    {
        raw.push(text.substring(lastIndex, range[0]));
        substitutions.push(replacement);
        [, lastIndex] = range;
    }
    raw.push(text.substring(lastIndex));
    return String.raw({ raw }, ...substitutions);
}

function createSourceCode(text)
{
    const sourceCode =
    new SourceCode
    (text, { tokens: [], comments: [], loc: { start: { }, end: { } }, range: [0, text.length] });
    return sourceCode;
}

function getIndexFromMessageLoc(line, column, sourceCode)
{
    const loc = { line, column: column - 1 };
    const index = sourceCode.getIndexFromLoc(loc);
    return index;
}

function postprocessMessages
(messages, disabledRules, originalSourceCode, processedSourceCode, eslintEnvInfos)
{
    // Only converts a range if it doesn't overlap with an eslint-env comment.
    function convertToOriginalRange(processedRange)
    {
        const [processedStart, processedEnd] = processedRange;
        for (let eslintEnvIndex = eslintEnvInfos.length; eslintEnvIndex--;)
        {
            const { range, processedRange: [processedCommentStart, processedCommentEnd] } =
            eslintEnvInfos[eslintEnvIndex];
            if (processedEnd >= processedCommentEnd)
            {
                if (processedStart >= processedCommentEnd)
                {
                    const shift = processedCommentEnd - range[1];
                    const originalStart = processedStart - shift;
                    const originalEnd = processedEnd - shift;
                    const originalRange = [originalStart, originalEnd];
                    return originalRange;
                }
                return;
            }
            if (processedEnd > processedCommentStart)
                return;
        }
        return processedRange;
    }

    function messageOverlapsWithEslintEnvComment({ line, column, endLine, endColumn })
    {
        const startIndex = getIndexFromMessageLoc(line, column, processedSourceCode);
        const endIndex = getIndexFromMessageLoc(endLine, endColumn, processedSourceCode);
        if (convertToOriginalRange([startIndex, endIndex], eslintEnvInfos))
            return false;
        return true;
    }

    function convertToOriginalIndex(processedIndex)
    {
        for (let eslintEnvIndex = eslintEnvInfos.length; eslintEnvIndex--;)
        {
            const { range, processedRange: [processedCommentStart, processedCommentEnd] } =
            eslintEnvInfos[eslintEnvIndex];
            if (processedIndex >= processedCommentEnd)
            {
                const shift = processedCommentEnd - range[1];
                const originalIndex = processedIndex - shift;
                return originalIndex;
            }
            if (processedIndex > processedCommentStart)
                return;
        }
        return processedIndex;
    }

    function adjustLocation(message, lineKey, colKey)
    {
        const line = message[lineKey];
        const column = message[colKey];
        const processedIndex = getIndexFromMessageLoc(line, column, processedSourceCode);
        const originalIndex = convertToOriginalIndex(processedIndex, eslintEnvInfos);
        if (originalIndex == null)
            return false;
        const originalLoc = originalSourceCode.getLocFromIndex(originalIndex);
        const { line: originalLine, column: originalColumn } = originalLoc;
        message[lineKey] = originalLine;
        message[colKey] = originalColumn + 1;
        return true;
    }

    const postprocessedMessages = [];
    for (const message of messages)
    {
        const disabledRuleState = disabledRules[message.ruleId];
        switch (disabledRuleState)
        {
        case 'overlap':
            if (messageOverlapsWithEslintEnvComment(message))
                continue;
            break;
        case 'anywhere':
            continue;
        case 'anywhere-multiline':
            if (eslintEnvInfos.some(({ format: { lineBreak } }) => lineBreak))
                continue;
            break;
        }
        if
        (
            adjustLocation(message, 'line', 'column') &&
            adjustLocation(message, 'endLine', 'endColumn')
        )
        {
            const { fix } = message;
            if (fix)
            {
                const range = convertToOriginalRange(fix.range, eslintEnvInfos);
                if (range)
                    fix.range = range;
                else
                    delete message.fix;
            }
            postprocessedMessages.push(message);
        }
    }
    return postprocessedMessages;
}

class EslintEnvProcessor
{
    constructor({ disabledRules: rawDisabledRules, plugins = { } } = { })
    {
        const disabledRules = normalizeDisabledRules(rawDisabledRules);
        const pluginEnvironments = getPluginEnvironments(plugins);
        const filenameToTextMap = new Map();

        function preprocess(text, filename)
        {
            const originalText = text;
            const eslintEnvInfos = findEslintEnvInfos(text);
            if (eslintEnvInfos.length)
            {
                let shift = 0;
                for (const eslintEnvInfo of eslintEnvInfos)
                {
                    const globals = resolveGlobalsFromEnv(eslintEnvInfo.env, pluginEnvironments);
                    const replacement = createReplacement(globals, eslintEnvInfo.format);
                    const [originalStart, originalEnd] = eslintEnvInfo.range;
                    eslintEnvInfo.replacement = replacement;
                    const processedStart = originalStart + shift;
                    eslintEnvInfo.processedRange =
                    [processedStart, processedStart + replacement.length];
                    shift += replacement.length - (originalEnd - originalStart);
                }
                text = replaceEslintEnvComments(originalText, eslintEnvInfos);
                const textData = { originalText, processedText: text, eslintEnvInfos };
                filenameToTextMap.set(filename, textData);
            }
            return [{ text, filename: '/..' }];
        }

        function postprocess(messageLists, filename)
        {
            const textData = filenameToTextMap.get(filename);
            const messages = messageLists.flat();
            if (!textData)
                return messages;
            filenameToTextMap.delete(filename);
            if (!messages.length)
                return messages;
            const { originalText, processedText, eslintEnvInfos } = textData;
            const originalSourceCode = createSourceCode(originalText);
            const processedSourceCode = createSourceCode(processedText);
            const postprocessedMessages =
            postprocessMessages
            (messages, disabledRules, originalSourceCode, processedSourceCode, eslintEnvInfos);
            return postprocessedMessages;
        }

        this.preprocess = preprocess;
        this.postprocess = postprocess;
    }
}

EslintEnvProcessor.prototype.supportsAutofix = true;

module.exports = EslintEnvProcessor;
