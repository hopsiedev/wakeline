import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analytics} from '../src/services/github-analytics.ts';
test('contributors identify repositories within the selected period',()=>{
 const data={commits:[{at:'2026-11-11T12:00:00Z',author:'a',repository:'team/one'}, {at:'2026-11-11T13:00:00Z',author:'a',repository:'team/two'}, {at:'2026-11-01T12:00:00Z',author:'a',repository:'team/old'}],pull_requests:[],repositories:[]};
 assert.deepEqual(analytics(data,1,new Date('2026-11-11T20:00:00Z')).authors[0].repositories,['team/one','team/two']);
});
test('GitHub metrics count current and previous periods, merges and first-review time',()=>{
 const data={commits:[{at:'2026-11-11T12:00:00Z',author:'a'},{at:'2026-11-10T12:00:00Z',author:'b'}],pull_requests:[{created_at:'2026-11-11T08:00:00Z',first_review_at:'2026-11-11T10:00:00Z',merged_at:'2026-11-11T12:00:00Z'},{created_at:'2026-11-11T09:00:00Z',first_review_at:null,merged_at:null}],repositories:[]};
 const report=analytics(data,1,new Date('2026-11-11T20:00:00Z'));
 assert.equal(report.current.commits,1);assert.equal(report.previous.commits,1);assert.equal(report.current.pulls,2);assert.equal(report.current.merged,1);assert.equal(report.current.review_hours,2);
 assert.equal(report.authors[0].series[0],1);
 assert.equal(analytics({...data,pull_requests:[]},1,new Date('2026-11-11T20:00:00Z')).current.review_hours,null);
});
