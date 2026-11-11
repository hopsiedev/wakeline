import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import {response} from '../tests/fixtures/documentation.mjs';

const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const assertUI=expect.configure({timeout:3000});
const browser=await chromium.launch();const failures=[];
try {
 for(const language of ['en','es']) {
  const context=await browser.newContext({viewport:{width:1600,height:1000},locale:language,reducedMotion:'reduce'});
  await context.addInitScript(({language,appVersion})=>{localStorage.setItem('wakeline-lang',language);localStorage.setItem('wakeline-release-shown',appVersion);localStorage.setItem('wakeline-daily-summary-enabled','false');},{language,appVersion});
  let empty=false,available=false;
  const page=await context.newPage();
  await page.route('**/__wakeline/read',async route=>{const{command}=route.request().postDataJSON();let data=response(command);
   if(empty&&command==='get_dashboard_data') data={...data,cards:[],pull_requests:[]};
   if(empty&&command==='get_github_workspace') data={...data,commits:[],pull_requests:[]};
   if(!empty&&command==='get_github_workspace') data={...data,commits:[...data.commits,...[8,35].map(days=>({repository:'orbit/checkout',sha:'prior-'+days,at:new Date(Date.now()-days*86400000).toISOString(),author:'mira-dev',avatar_url:null}))]};
   if(command==='check_update')data={current_version:'0.1.6',version:available?'0.1.7':null,notes:null,state:available?'available':'up_to_date'};
   await route.fulfill({json:data});});
  const check=async(name,fn)=>{try{await fn();console.log(language+': '+name+' passed');}catch(e){failures.push(language+': '+name+': '+e.message.slice(0,220));}};
  await page.goto('http://127.0.0.1:3039/pull-requests');
  await assertUI(page.locator('.wk-chat-picker')).toHaveCount(3);
  await check('chat menus dismiss with outside click and Escape',async()=>{
   for(const picker of await page.locator('.wk-chat-picker').all()){
    await picker.locator('summary').click();await assertUI(picker).toHaveAttribute('open','');
    await page.locator('.page-title').click();await assertUI(picker).not.toHaveAttribute('open','');
    await picker.locator('summary').click();await page.keyboard.press('Escape');await assertUI(picker).not.toHaveAttribute('open','');
   }
  });
  await check('shortcuts dismiss with Escape and backdrop',async()=>{
   const open=async()=>{await page.locator('.rail-account').click();await page.getByRole('menuitem',{name:language==='es'?'Atajos de teclado':'Keyboard shortcuts'}).click();};
   await open();await assertUI(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await assertUI(page.getByRole('dialog')).toHaveCount(0);
   await open();await page.mouse.click(1550,950);await assertUI(page.getByRole('dialog')).toHaveCount(0);
  });
  await page.goto('http://127.0.0.1:3039/');
  await check('week/month comparison badges, none today',async()=>{
   await assertUI(page.locator('.delta').first()).toBeVisible();
   await page.getByRole('radio',{name:language==='es'?'Hoy':'Today',exact:true}).click();await assertUI(page.locator('.delta')).toHaveCount(0);
   await page.getByRole('radio',{name:language==='es'?'Mes':'Month',exact:true}).click();await assertUI(page.locator('.delta').first()).toBeVisible();
  });
  await check('daily summary grouped PR link and category icons',async()=>{
   await page.evaluate(()=>window.dispatchEvent(new Event('wakeline:open-summary')));
   await assertUI(page.locator('.wk-daily')).toBeVisible();await assertUI(page.locator('.wk-daily-stats strong span').first()).toHaveCSS('font-size','30px');await assertUI(page.locator('.wk-daily-kind svg').first()).toBeVisible();await assertUI(page.locator('.wk-daily-reviews')).toHaveCount(1);
   await page.locator('.wk-daily-reviews').click();await assertUI(page).toHaveURL(/pull-requests/);
  });
  empty=true;
  const loaded=Promise.all(['get_dashboard_data','get_github_workspace'].map(command=>page.waitForResponse(r=>r.url().includes('/__wakeline/read')&&r.request().postDataJSON()?.command===command)));
  await page.reload();await loaded;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await check('empty summary says up to date without zero counters',async()=>{
   await page.evaluate(()=>window.dispatchEvent(new Event('wakeline:open-summary')));await assertUI(page.locator('.wk-daily')).toBeVisible();await assertUI(page.locator('.wk-daily-stats')).toHaveCount(0);await assertUI(page.locator('.wk-daily h1')).toHaveText(language==='es'?'Estás al día':'You’re up to date');await page.screenshot({path:fileURLToPath(new URL('../../../assets/screenshots/daily-summary-empty-'+language+'.png',import.meta.url)),animations:'disabled'});await page.keyboard.press('Escape');
  });
  available=true;await page.reload();
  await check('sidebar update indicator opens Update now action',async()=>{
   await assertUI(page.locator('.wk-sidebar-update')).toBeVisible();await page.locator('.wk-sidebar-update').click();await assertUI(page.getByRole('menuitem',{name:language==='es'?'Actualizar ahora':'Update now',exact:true})).toBeVisible();await page.screenshot({path:fileURLToPath(new URL('../../../assets/screenshots/update-available-'+language+'.png',import.meta.url)),animations:'disabled'});
  });
  await context.close();
 }
}finally{await browser.close();}
assert.equal(failures.length,0,failures.join('\n'));
