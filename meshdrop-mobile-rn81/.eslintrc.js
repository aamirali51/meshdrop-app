module.exports = {
  root: true,
  extends: '@react-native',
  parserOptions: {
    requireConfigFile: false,
  },
  globals: {
    Bare: 'readonly',
    BareKit: 'readonly',
    Buffer: 'readonly',
    globalThis: 'readonly',
  },
  ignorePatterns: [
    'src/engine/*.bundle.js',
    'nodejs-assets/',
    'android/',
    'ios/',
    'node_modules/',
  ],
  rules: {
    'no-new-func': 'off',
  },
};
