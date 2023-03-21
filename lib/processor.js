'use strict';

const { SourceCode } = require('eslint');

const { BuiltInEnvironments, commentParser } =
(() =>
{
    const { createRequire } = require('module');

    const requireAsESLint = createRequire(require.resolve('eslint'));
    const { Legacy: { environments: BuiltInEnvironments } } = require('@eslint/eslintrc/universal');
    const ConfigCommentParser = requireAsESLint('./linter/config-comment-parser');
    const commentParser = new ConfigCommentParser();
    return { BuiltInEnvironments, commentParser };
}
)();

function getPluginEnvironments(plugins)
{
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
    const match = /\s-{2,}\s/u.exec(text);
    const directive = (match ? text.slice(0, match.index) : text).trim();
    return directive;
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
        const directive = extractDirectiveComment(match[2]);
        const env = commentParser.parseListConfig(directive);
        const lineBreak = extractLineBreak(match[0]);
        const start = match.index;
        const end = eslintEnvPattern.lastIndex;
        const eslintEnvInfo =
        {
            env,
            hasSpaceAfter:  Boolean(match[3]),
            hasSpaceBefore: Boolean(match[1]),
            lineBreak,
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

function createReplacement(globals, lineBreak, hasSpaceBefore, hasSpaceAfter)
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
    let replacement;
    if (lineBreak)
    {
        replacement =
        `/*${lineBreak}global${parts.map(part => `${lineBreak}${part}`).join('')}${lineBreak}*/`;
    }
    else
    {
        const spaceBefore = hasSpaceBefore ? ' ' : '';
        const spaceAfter = hasSpaceAfter ? ' ' : '';
        replacement =
        `/*${spaceBefore}global${parts.map(part => ` ${part}`).join('')}${spaceAfter}*/`;
    }
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

function getProcessedEslintEnvLines(processedSourceCode, eslintEnvInfos)
{
    const processedEslintEnvLines = [];
    for (const { processedRange: [start, end] } of eslintEnvInfos)
    {
        {
            const { line } = processedSourceCode.getLocFromIndex(start);
            processedEslintEnvLines[line] = null;
        }
        {
            const { line } = processedSourceCode.getLocFromIndex(end);
            processedEslintEnvLines[line] = null;
        }
    }
    return processedEslintEnvLines;
}

function convertToOriginalIndex(processedIndex, eslintEnvInfos)
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

// Only converts a range if it doesn't overlap with an eslint-env comment.
function convertToOriginalRange(processedRange, eslintEnvInfos)
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

function createConvertToOriginalLoc(originalSourceCode, processedSourceCode, eslintEnvInfos)
{
    const convertToOriginalLoc =
    processedLoc =>
    {
        const processedIndex = processedSourceCode.getIndexFromLoc(processedLoc);
        const originalIndex = convertToOriginalIndex(processedIndex, eslintEnvInfos);
        if (originalIndex != null)
        {
            const processedLoc = originalSourceCode.getLocFromIndex(originalIndex);
            return processedLoc;
        }
    };
    return convertToOriginalLoc;
}

function adjustLocation(message, convertToOriginalLoc, lineKey, colKey)
{
    const processedLine = message[lineKey];
    if (processedLine)
    {
        const processedColumn = message[colKey] - 1 || 0;
        const processedLoc = { line: processedLine, column: processedColumn };
        const originalLoc = convertToOriginalLoc(processedLoc);
        if (!originalLoc)
            return false;
        const { line: originalLine, column: originalColumn } = originalLoc;
        message[lineKey] = originalLine;
        message[colKey] = originalColumn + 1;
    }
    return true;
}

class EslintEnvProcessor
{
    constructor({ disabledRules = ['max-len'], plugins = { } } = { })
    {
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
                    const replacement =
                    createReplacement
                    (
                        globals,
                        eslintEnvInfo.lineBreak,
                        eslintEnvInfo.hasSpaceBefore,
                        eslintEnvInfo.hasSpaceAfter,
                    );
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
            const postprocessedMessages = [];
            if (messages.length)
            {
                const { originalText, processedText, eslintEnvInfos } = textData;
                const originalSourceCode = createSourceCode(originalText);
                const processedSourceCode = createSourceCode(processedText);
                const processedEslintEnvLines =
                getProcessedEslintEnvLines(processedSourceCode, eslintEnvInfos);
                const convertToOriginalLoc =
                createConvertToOriginalLoc(originalSourceCode, processedSourceCode, eslintEnvInfos);
                for (const message of messages)
                {
                    if
                    (
                        disabledRules.includes(message.ruleId) &&
                        (
                            processedEslintEnvLines.hasOwnProperty(message.line) ||
                            processedEslintEnvLines.hasOwnProperty(message.endLine)
                        )
                    )
                        continue;
                    if
                    (
                        adjustLocation(message, convertToOriginalLoc, 'line', 'column') &&
                        adjustLocation(message, convertToOriginalLoc, 'endLine', 'endColumn')
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
            }
            return postprocessedMessages;
        }

        this.preprocess = preprocess;
        this.postprocess = postprocess;
    }
}

EslintEnvProcessor.prototype.supportsAutofix = true;

module.exports = EslintEnvProcessor;
