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

const eslintEnvPattern = /\/\*\s*eslint-env\s(.+?)\*\//gsu;

function extractDirectiveComment(value)
{
    const match = /\s-{2,}\s/u.exec(value);
    const directive = (match ? value.slice(0, match.index) : value).trim();
    return directive;
}

function findEslintEnvInfos(text)
{
    const eslintEnvInfos = [];
    let match;
    eslintEnvPattern.lastIndex = 0;
    while (match = eslintEnvPattern.exec(text))
    {
        const directive = extractDirectiveComment(match[1]);
        const env = commentParser.parseListConfig(directive);
        const start = match.index;
        const end = eslintEnvPattern.lastIndex;
        const eslintEnvInfo = { env, range: [start, end] };
        eslintEnvInfos.push(eslintEnvInfo);
    }
    return eslintEnvInfos;
}

function resolveGlobalsFromEnv(env, pluginEnvironments)
{
    const enabledEnvs =
    Object.keys(env)
    .filter(envName => env[envName])
    .map(envName => pluginEnvironments.get(envName) || BuiltInEnvironments.get(envName))
    .filter(env => env);
    const globals = Object.assign({ }, ...enabledEnvs.map(({ globals }) => globals));
    return globals;
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

function convertToOriginalIndex(processedIndex, eslintEnvInfos)
{
    for (let eslintEnvIndex = eslintEnvInfos.length; eslintEnvIndex--;)
    {
        const { range, processedRange: [processedStart, processedEnd] } =
        eslintEnvInfos[eslintEnvIndex];
        if (processedIndex >= processedEnd)
        {
            const shift = processedEnd - range[1];
            const originalIndex = processedIndex - shift;
            return originalIndex;
        }
        if (processedIndex > processedStart)
            return;
    }
    return processedIndex;
}

function createConvertToOriginalLoc({ originalText, processedText, eslintEnvInfos })
{
    const originalSourceCode = createSourceCode(originalText);
    const processedSourceCode = createSourceCode(processedText);
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

class EslintEnvProcessor
{
    constructor({ plugins = { } } = { })
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
                    const parts = Object.entries(globals).map(([key, value]) => `${key}:${value}`);
                    const replacement = parts.length ? `/* global ${parts.join(', ')} */` : '';
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
                const convertToOriginalLoc = createConvertToOriginalLoc(textData);
                for (const message of messages)
                {
                    if
                    (
                        adjustLocation(message, convertToOriginalLoc, 'line', 'column') &&
                        adjustLocation(message, convertToOriginalLoc, 'endLine', 'endColumn')
                    )
                        postprocessedMessages.push(message);
                }
            }
            return postprocessedMessages;
        }

        this.preprocess = preprocess;
        this.postprocess = postprocess;
    }
}

module.exports = EslintEnvProcessor;
