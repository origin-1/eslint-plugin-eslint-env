import type { ESLint, Linter } from 'eslint';

/**
 * Specifies under which conditions the problems reported by a rule should be suppressed.
 *
 * * `"intersection"` is the default setting for all rules.
 * This value only suppresses problems that start or end in the middle (not on the boundaries) of a
 * replaced `eslint-env` comment.
 * Locations in the middle of a replaced `eslint-env` comment cannot be mapped back to original
 * locations, so problems that start or end in the middle of a replaced `eslint-env` comment are
 * always suppressed.
 * * `"overlap"` suppresses problems that overlap with replaced `eslint-env` comments in any way,
 * not only by intersection.
 * This value also suppresses problems that span over a whole `eslint-env` comment.
 * * `"anywhere"` suppresses all problems in a file that contains one or more `eslint-env` comments.
 */
export type DisabledRuleState = 'intersection' | 'overlap' | 'anywhere' | undefined;

/**
 * An [ESLint processor](
 * https://eslint.org/docs/latest/use/configure/configuration-files-new#using-processors) that
 * replaces [`eslint-env` configuration comments](
 * https://eslint.org/docs/latest/use/configure/language-options#using-configuration-comments) with
 * equivalent [`global` configuration comment](
 * https://eslint.org/docs/latest/use/configure/language-options#using-configuration-comments-1).
 */
export declare class EslintEnvProcessor implements Linter.Processor<Linter.ProcessorFile>
{
    public supportsAutofix: boolean;

    /** @param options Processor options. */
    public constructor
    (
        options?:
        {
            disabledRules?: Record<string, DisabledRuleState> | undefined;
            plugins?:       Record<string, ESLint.Plugin> | undefined;
        },
    );

    public preprocess(text: string, filename: string): Linter.ProcessorFile[];
    public postprocess(messages: Linter.LintMessage[][], filename: string): Linter.LintMessage[];
}

declare const plugin:
{
    EslintEnvProcessor: typeof EslintEnvProcessor;
    meta: { name: string; version: string; };
    processors: { 'eslint-env': EslintEnvProcessor; };
};

export default plugin;
