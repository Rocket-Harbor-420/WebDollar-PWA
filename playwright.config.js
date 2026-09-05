import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'browser.spec.mjs',workers:1,timeout:45000,
  reporter:[['list']],use:{headless:true,viewport:{width:1440,height:1000}},
  webServer:{command:'node scripts/serve.js',url:'http://127.0.0.1:4173',reuseExistingServer:true}
});
