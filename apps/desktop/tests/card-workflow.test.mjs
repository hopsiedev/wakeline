import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as flow from '../src/services/card-workflow.ts';
const card={fingerprint:'a',fingerprints:[],kind:'error',status:'new',occurrences:2,first_seen:'2026-11-09',last_seen:'2026-11-11',source_kind:'comment',project:'p',title:'Reconnect',location:'a.rs:2'};

test('review uses accepted backend status and follows aliases across restarts', () => {
  const accepted = {...card, status: 'accepted'};
  const state = flow.withReviewStage({}, accepted, true, 1000);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(flow.boardStage({...accepted, fingerprint:'group', fingerprints:['a']}, restored), 'review');
  assert.equal(flow.boardStage({...accepted, status:'done'}, restored), 'done');
  const next = flow.withReviewStage(restored, accepted, false, 2000);
  assert.equal(flow.boardStage(accepted, next), 'accepted');
  assert.equal(next.a.events.at(-1).event, 'stage');
});

test('expired snooze records resumption once across scans', () => {
  const state = {a:{status:'new',occurrences:2,events:[],snooze:{until:1500}}};
  const next = flow.observeWorkflow(state, [card], 2000);
  assert.equal(next.a.events.at(-1)?.event, 'resumed');
  assert.equal(flow.observeWorkflow(next, [card], 3000).a.events.length, 1);
});

test('legacy WebView workflow and preferences survive two module restarts', async () => {
  const saved = new Map([
    ['wakeline-card-workflow-v1', JSON.stringify({a:{status:'new',occurrences:2,events:[{at:1000,event:'detected',status:'new',occurrences:2}],snooze:{occurrences:2}}})],
    ['wakeline-lang', 'en'], ['wakeline-mode', 'light'],
    ['wakeline-daily-summary-enabled', 'true'],
    ['wakeline-daily-summary-shown', '2026-11-10'],
    ['wakeline-daily-summary-snapshot', '{"a":"new"}'],
  ]);
  globalThis.localStorage = {getItem:key=>saved.get(key)??null, setItem:(key,value)=>saved.set(key,value)};
  for (let restart = 0; restart < 2; restart++) {
    const module = await import(`../src/services/card-workflow.ts?restart=${restart}`);
    const regrouped = {...card,fingerprint:'group',fingerprints:['a']};
    assert.equal(module.isSnoozed(regrouped,module.getWorkflow()),true);
    module.observeCards([regrouped]);
    assert.equal(module.cardHistory(regrouped).length,1);
    assert.equal(saved.get('wakeline-lang'),'en');
    assert.equal(saved.get('wakeline-mode'),'light');
    assert.equal(saved.get('wakeline-daily-summary-shown'),'2026-11-10');
    assert.equal(saved.get('wakeline-daily-summary-snapshot'),'{"a":"new"}');
    assert.equal(saved.get('wakeline-daily-summary-enabled'),'true');
  }
});
test('observing the same scan never duplicates history',()=>{const a=flow.observeWorkflow({},[card],1000);const b=flow.observeWorkflow(a,[card],2000);assert.equal(b.a.events.length,1);assert.equal(b.a.events[0].event,'detected');});
test('history distinguishes automatic signal closure and human completion',()=>{let state=flow.observeWorkflow({},[card],1000);state=flow.observeWorkflow(state,[{...card,status:'done',occurrences:0}],2000);assert.equal(state.a.events.at(-1).event,'signal_closed');state=flow.observeWorkflow(state,[card],3000);assert.equal(state.a.events.at(-1).event,'signal_returned');state=flow.observeWorkflow(state,[{...card,status:'done'}],4000);assert.equal(state.a.events.at(-1).event,'status');});
test('snooze expires on time or a new occurrence and follows regrouped origins',()=>{const state={a:{snooze:{until:2000},events:[],occurrences:2,status:'new'}};assert.equal(flow.isSnoozed(card,state,1000),true);assert.equal(flow.isSnoozed(card,state,2000),false);state.a.snooze={occurrences:2};assert.equal(flow.isSnoozed(card,state,2000),true);assert.equal(flow.isSnoozed({...card,occurrences:3},state,2000),false);assert.equal(flow.isSnoozed({...card,fingerprint:'group',fingerprints:['a']},state,2000),true);});
test('priority excludes snoozed and closed cards and explains the three selected',()=>{const cards=[{...card,fingerprint:'idea',kind:'idea'},{...card,fingerprint:'old',kind:'task',first_seen:'2026-11-01'},{...card,fingerprint:'closed',status:'done'},{...card,fingerprint:'paused'},card,{...card,fingerprint:'cmd',source_kind:'command'}];const result=flow.priorityCards(cards,{paused:{snooze:{until:999999},events:[],status:'new',occurrences:2}},'2026-11-11',1000);assert.deepEqual(result.map(x=>[x.card.fingerprint,x.reason]),[['cmd','command'],['a','repeated'],['old','aging']]);});
