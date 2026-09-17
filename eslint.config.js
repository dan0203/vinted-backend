const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    {
        ignores: ['.agents/**', '.claude/**'],
    },
    js.configs.recommended,
    prettierConfig,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node,
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['tests/**/*.test.js'],
        languageOptions: {
            globals: globals.jest,
        },
    },
];
