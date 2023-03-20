# eslint-plugin-eslint-env

An ESLint plugin to lint files with [`eslint-env`](https://eslint.org/docs/latest/use/configure/language-options#using-configuration-comments) comments using the flat config.

## Installation

```console
npm i -D eslint-plugin-eslint-env
```

## Usage

In your `eslint.config.js` file, create a new `EslintEnvProcessor` and add it to your configuration.

```diff
+ import { EslintEnvProcessor } from 'eslint-plugin-eslint-env';

  export default
  [
      {
          files:      ['*.js'],
+         processor:  new EslintEnvProcessor(),
      },
  ];
```

To support pluing-defined environments in `eslint-env` comments (e.g. `/* eslint-env cypress/globals */`, `/* eslint-env react-native/react-native */`, etc.), add a `plugins` setting both to the configuration and to the `EslintEnvProcessor` constructor options.

```diff
  import { EslintEnvProcessor } from 'eslint-plugin-eslint-env';
+ import eslintPluginCypress from 'eslint-plugin-cypress';

+ const plugins = { 'cypress': eslintPluginCypress };

  export default
  [
      {
          files:      ['*.js'],
+         plugins,
+         processor:  new EslintEnvProcessor({ plugins }),
      },
  ];
```
