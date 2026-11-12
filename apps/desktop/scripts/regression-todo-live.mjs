import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response, dashboard } from '../tests/fixtures/documentation.mjs';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
const browser=await chromium.launch();
try {
  const context=await browser.newContext({viewport:{width:1500,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(version=>{localStorage.setItem('wakeline-release-shown',version);localStorage.setItem('wakeline-daily-summary-enabled','false');},version);
  const page=await context.newPage();
  let cards=structuredClone(dashboard.cards), holdScan=false,scanStarted=false,finishScan,finishSave,fail=false,reads=0;
  const blockedScan=new Promise(resolve=>{finishScan=resolve;});
  const blockedSave=new Promise(resolve=>{finishSave=resolve;});
  await page.route('**/__wakeline/read',async route=>{
    const {command,args}=route.request().postDataJSON();
    if(command==='get_dashboard_data'){
      reads++;const snapshot=structuredClone(cards);
      if(holdScan){scanStarted=true;await blockedScan;}
      await route.fulfill({json:{...dashboard,cards:snapshot}});return;
    }
    if(command==='set_cards_status'){
      if(fail){await route.fulfill({status:500,json:{error:'SYNTHETIC_SAVE_FAILED'}});return;}
      await blockedSave;
      for(const input of args.inputs)cards=cards.map(c=>c.fingerprint===input.fingerprint?{...c,status:input.status}:c);
      await route.fulfill({json:null});return;
    }
    await route.fulfill({json:response(command)});
  });
  await page.goto('http://127.0.0.1:3039/cards');
  const title='Handle repeated payment webhooks';
  const column=index=>page.locator('.wk-kanban-column').nth(index);
  const item=index=>column(index).locator('.wk-kanban-card').filter({hasText:title});
  await expect(item(0)).toBeVisible();
  holdScan=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('wakeline:rescan')));
  await expect.poll(()=>scanStarted).toBe(true);
  const readsBeforeMove=reads;
  await item(0).dragTo(column(1),{targetPosition:{x:30,y:65}});
  await expect(item(1)).toBeVisible();
  finishScan();
  await expect(item(1)).toBeVisible();
  finishSave();
  await expect.poll(()=>cards.find(c=>c.title===title).status).toBe('accepted');
  assert.equal(reads,readsBeforeMove,'Moving a card must not launch another full scan');
  fail=true;
  await item(1).dragTo(column(3),{targetPosition:{x:30,y:65}});
  await expect(page.getByRole('alert').filter({hasText:'SYNTHETIC_SAVE_FAILED'})).toBeVisible();
  await expect(item(1)).toBeVisible();
  console.log('PASS: move is immediate during scan/save; stale scan cannot undo it; no full rescan; failed save rolls back');
} finally {await browser.close();}
