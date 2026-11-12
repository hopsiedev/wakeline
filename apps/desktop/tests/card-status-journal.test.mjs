import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CardStatusJournal } from '../src/services/card-status-journal.ts';
const card = {fingerprint:'a',fingerprints:['a','alias'],status:'new'};
test('an older scan cannot undo an optimistic move or a saved move',()=>{
  const journal=new CardStatusJournal(); journal.apply([card],journal.revision);
  const oldScan=journal.revision;
  const tx=journal.begin([{fingerprint:'a',fingerprints:['alias'],status:'accepted'}]);
  assert.equal(journal.apply([card],oldScan)[0].status,'accepted');
  journal.commit(tx);
  assert.equal(journal.apply([card],oldScan)[0].status,'accepted');
  assert.equal(journal.apply([{...card,status:'accepted'}],journal.revision)[0].status,'accepted');
  assert.equal(journal.apply([{...card,status:'done'}],journal.revision)[0].status,'done');
});
test('failed saves restore the original state and never roll back a newer move',()=>{
  const journal=new CardStatusJournal(); journal.apply([card],0);
  const first=journal.begin([{fingerprint:'a',fingerprints:['alias'],status:'accepted'}]);
  const second=journal.begin([{fingerprint:'a',fingerprints:['alias'],status:'done'}]);
  assert.deepEqual(journal.rollback(first),[]);
  assert.equal(journal.apply([card],0)[0].status,'done');
  assert.equal(journal.rollback(second)[0].status,'accepted');
  const other=new CardStatusJournal();other.apply([card],0);
  const failed=other.begin([{fingerprint:'a',fingerprints:[],status:'done'}]);
  assert.equal(other.rollback(failed)[0].status,'new');
});
test('a later authoritative MCP change is accepted without waiting for a matching scan',()=>{
  const journal=new CardStatusJournal();journal.apply([card],0);
  const tx=journal.begin([{fingerprint:'a',fingerprints:['alias'],status:'accepted'}]);
  journal.commit(tx);
  assert.equal(journal.apply([{...card,status:'done'}],journal.revision)[0].status,'done');
  assert.equal(journal.apply([card],0)[0].status,'done');
});
