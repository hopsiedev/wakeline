import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response, dashboard } from '../tests/fixtures/documentation.mjs';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
const browser=await chromium.launch();
try {
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.addInitScript(version=>{localStorage.setItem('wakeline-release-shown',version);localStorage.setItem('wakeline-daily-summary-enabled','false');},version);
 const page=await context.newPage();
 await page.route('**/__wakeline/read',route=>{
   const {command}=route.request().postDataJSON();let data=response(command);
   if(command==='get_dashboard_data')data={...dashboard,cards:dashboard.cards.map(c=>({...c,title:'FAIL |core| src/core/features/computer/darwin/service/live.test.ts /'+ 'long-path-without-breaks'.repeat(20),kind:'error',occurrences:20}))};
   return route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:3039/cards');
 await expect(page.locator('.real-priority').first()).toBeVisible();
 for(const width of [1600,960,700,390]){
   await page.setViewportSize({width,height:900});
   const issues=await page.locator('.real-priority').evaluateAll(items=>items.flatMap((card,i)=>{
     const box=card.getBoundingClientRect();const text=card.querySelector('strong').getBoundingClientRect();
     return card.scrollWidth>card.clientWidth+1||text.right>box.right+1?[i]:[];
   }));
   assert.deepEqual(issues,[],`Priority titles must fit at width ${width}`);
 }
 console.log('PASS: long priority paths wrap inside their cards at 1600, 960, 700 and 390px');
}finally{await browser.close();}
