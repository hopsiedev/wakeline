import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
const browser=await chromium.launch();
try {
 for(const reducedMotion of ['reduce','no-preference']) {
  const context=await browser.newContext({viewport:{width:960,height:740},reducedMotion});
  await context.addInitScript(version=>{localStorage.setItem('wakeline-release-shown',version);localStorage.setItem('wakeline-daily-summary-enabled','false');},version);
  const page=await context.newPage();
  await page.route('**/__wakeline/read',route=>route.fulfill({json:response(route.request().postDataJSON().command)}));
  await page.goto('http://127.0.0.1:3039/');
  await expect(page.locator('.rail-account')).toBeVisible();
  for(let opening=0;opening<2;opening++){
   if(opening===0)await page.evaluate(()=>{document.documentElement.style.display='none';});
   await page.evaluate(()=>window.dispatchEvent(new Event('wakeline:open-summary')));
   if(opening===0){
    await page.waitForFunction(()=>document.querySelector('.wk-daily')?.open);
    await page.evaluate(()=>{document.documentElement.style.display='';});
   }
   await expect(page.locator('.wk-daily')).toBeVisible();
   await expect.poll(()=>page.locator('.wk-daily-stats strong [aria-hidden=true] > span').evaluateAll(slots=>slots.map(slot=>({width:slot.getBoundingClientRect().width,expected:slot.firstElementChild.getBoundingClientRect().width})).every(({width,expected})=>width>=expected-.5&&width>8))).toBe(true);
   const sizes=await page.locator('.wk-daily-stats strong [aria-hidden=true] > span').evaluateAll(slots=>slots.map(slot=>slot.getBoundingClientRect().width));
   assert(sizes.length>=3);
   await page.keyboard.press('Escape');
  }
  console.log(`${reducedMotion}: summary numbers have full visible widths on first open and reopening`);
  await context.close();
 }
}finally{await browser.close();}
