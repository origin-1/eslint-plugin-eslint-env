#!/usr/bin/env node

import { fileURLToPath }    from 'node:url';
import c8js                 from 'c8js';

const mochaPath = fileURLToPath(import.meta.resolve('mocha/bin/mocha'));
await c8js
(
    mochaPath,
    ['--check-leaks'],
    {
        cwd:            new URL('..', import.meta.url),
        reporter:       ['html', 'text-summary'],
        useC8Config:    false,
        watermarks:
        {
            branches:   [90, 100],
            functions:  [90, 100],
            lines:      [90, 100],
            statements: [90, 100],
        },
    },
);
