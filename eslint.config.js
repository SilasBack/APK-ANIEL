const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([expoConfig,// Async initialization intentionally updates loading state before awaiting native I/O.
{rules:{'react-hooks/set-state-in-effect':'warn'}}, {ignores:['node_modules/**','.expo/**','dist/**']}]);
