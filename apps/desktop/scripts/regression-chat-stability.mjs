import {test, expect, chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {response} from '../tests/fixtures/documentation.mjs';
const browser=await chromium.launch();
const viewport=process.env.CHAT_SMALL ? {width:960,height:600} : {width:1280,height:820};
let failures=0;
try {
 for(const scenario of ['images','drop','resize','stop','folder','summary','gallery']) {
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});
  let finish;
  const imageCounts=[];
  await page.route('**/__wakeline/read',async route=>{
   const {command,args}=route.request().postDataJSON();
   if(command==='remove_watch_folder'){await new Promise(resolve=>finish=resolve);return route.fulfill({json:null}).catch(()=>{});}
   if(command==='get_github_workspace' && scenario==='summary'){const data=structuredClone(response(command));data.commits=Array.from({length:500},(_,i)=>({...data.commits[i%data.commits.length],sha:'stress-'+i,repository:'organization/repository-with-a-long-name-'+i,author:'person-'+i%5}));return route.fulfill({json:data});}
   if(command==='ask_review_agent') {imageCounts.push(args.options.images.length);await new Promise(resolve=>finish=resolve); return route.fulfill({json:'Late answer'}).catch(()=>{});}
   return route.fulfill({json:response(command)});
  });
  try {
   await page.goto('http://127.0.0.1:3041/pull-requests');
   await expect(page.locator('.wk-chat-dock')).toBeVisible();
   const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
   if(scenario==='images'){
    await page.locator('input[type=file]').setInputFiles(Array.from({length:10},(_,i)=>({name:`${i}.png`,mimeType:'image/png',buffer:png})));
    await expect(page.locator('.composer .wk-image-thumbnail')).toHaveCount(10);
    const input=await page.locator('textarea').boundingBox();
    assert(input.y>=0 && input.y+input.height<viewport.height,'Text input must remain inside window');
    const thumbs=page.locator('.composer .wk-chat-images');
    assert(await thumbs.evaluate(el=>el.scrollHeight>el.clientHeight),'Attachments must have their own scroll');
   }
   if(scenario==='gallery'){
    const files=['first.png','second.png','third.png'].map(name=>({name,mimeType:'image/png',buffer:png}));
    await page.locator('input[type=file]').setInputFiles(files);
    await page.locator('.composer .wk-image-thumbnail').nth(1).click();
    await expect(page.locator('.wk-image-viewer > img')).toHaveAttribute('alt','second.png');
    await page.getByRole('button',{name:'Imagen siguiente'}).click();
    await expect(page.locator('.wk-image-viewer > img')).toHaveAttribute('alt','third.png');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.wk-image-viewer > img')).toHaveAttribute('alt','second.png');
    await page.keyboard.press('Escape');
    await page.locator('input[type=file]').setInputFiles(Array.from({length:8},(_,i)=>({name:`extra-${i}.png`,mimeType:'image/png',buffer:png})));
    await expect(page.locator('.composer .wk-image-thumbnail')).toHaveCount(3);
    await expect(page.getByRole('alert')).toContainText('10');
    await expect(page.getByRole('alert')).not.toContainText(/MB|peso/);
    await page.locator('textarea').fill('Review images');
    await page.locator('.composer .send').click();
    await expect(page.locator('.wk-thinking')).toBeVisible();
    finish?.();
    await expect(page.locator('.wk-thinking')).toHaveCount(0);
    await page.locator('.msg-user .wk-image-thumbnail').first().click();
    await page.getByRole('button',{name:'Imagen anterior'}).click();
    await expect(page.locator('.wk-image-viewer > img')).toHaveAttribute('alt','third.png');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.wk-image-viewer > img')).toHaveAttribute('alt','first.png');
    await page.keyboard.press('Escape');
    await page.locator('input[type=file]').setInputFiles(Array.from({length:10},(_,i)=>({name:`batch-${i}.png`,mimeType:'image/png',buffer:png})));
    await page.locator('.composer .send').click();
    await expect(page.locator('.wk-thinking')).toBeVisible();
    finish?.();
    await expect(page.locator('.wk-thinking')).toHaveCount(0);
    assert.deepEqual(imageCounts,[3,10],'Reused context must respect the ten-image maximum');
    await page.locator('.msg-user .wk-image-thumbnail').first().click();
    await page.getByRole('button',{name:'Imagen anterior'}).click();
    await expect(page.locator('.wk-image-viewer > img')).toHaveAttribute('alt','batch-9.png');
    await page.keyboard.press('Escape');
   }
   if(scenario==='drop'){
    const dataTransfer=await page.evaluateHandle(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([137,80,78,71])],'dropped.png',{type:'image/png'}));return dt;});
    await page.locator('.wk-pr-chat').dispatchEvent('drop',{dataTransfer});
    await expect(page.locator('.composer .wk-image-thumbnail')).toHaveCount(1);
   }
   if(scenario==='resize'){
    const grip=page.getByRole('separator');
    for(let i=0;i<20;i++)await grip.press('ArrowLeft');
    const main=page.locator('.review-main').first();
    assert((await main.boundingBox()).width>150,'Review text must retain readable width');
    const tabs=page.locator('.seg-wide .seg-btn');
    for(let i=0;i<await tabs.count()-1;i++){
     const a=await tabs.nth(i).boundingBox(), b=await tabs.nth(i+1).boundingBox();
     assert(a.x+a.width<=b.x+1 || a.y+a.height<=b.y+1,'Filters must not overlap');
    }
   }
   if(scenario==='folder'){
    await page.goto('http://127.0.0.1:3041/cards');
    const remove=page.getByRole('button',{name:/Dejar de vigilar|Stop watching/i}).first();
    await remove.click();
    await expect(page.getByRole('status').filter({hasText:/Dejando de vigilar/})).toBeVisible();
    await expect(remove).toBeDisabled();
    finish?.();
    await expect(page.getByRole('status').filter({hasText:/Dejando de vigilar/})).toHaveCount(0);
   }
   if(scenario==='summary'){
    await page.goto('http://127.0.0.1:3041/');
    await expect(page.locator('.leader').first()).toBeVisible();
    for(const card of await page.locator('.overview-grid > .card').all()) {
     assert((await card.boundingBox()).height<=380,'Summary cards must remain compact with hundreds of repositories');
    }
    const repositories=page.locator('.leader-repository-list').first();
    await repositories.locator('summary').click();
    await expect(repositories.locator('li').first()).toBeVisible();
    assert(await repositories.locator('li').count()>20,'All repository names must remain accessible');
   }
   if(scenario==='stop'){
    await page.locator('textarea').fill('Review');await page.locator('.composer .send').click();
    await expect(page.locator('.wk-thinking')).toBeVisible();
    await page.getByRole('button',{name:'Detener respuesta'}).click();
    await expect(page.locator('.wk-thinking')).toHaveCount(0);
    finish?.();
    await expect(page.locator('.thread')).not.toContainText('Late answer');
   }
   if(scenario==='resize' || scenario==='summary') await page.screenshot({path:new URL('../../../target/'+scenario+'-'+viewport.width+'.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
   console.log('PASS',scenario);
  } catch(error){failures++;console.error('FAIL',scenario,error.message);} finally {finish?.();await page.close();}
 }
} finally {await browser.close();}
if(failures)process.exitCode=1;
