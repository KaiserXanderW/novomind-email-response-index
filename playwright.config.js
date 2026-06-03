const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: '.',
    timeout: 30000,
});
