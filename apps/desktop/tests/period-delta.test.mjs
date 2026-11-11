import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as metrics from '../src/services/github-analytics.ts';
test('period comparisons show gains/losses only for week/month and have no invented baseline',()=>{
 assert.equal(metrics.periodDelta(0,10,'today'),null);
 assert.equal(metrics.periodDelta(12,10,'week'),20);
 assert.equal(metrics.periodDelta(0,10,'month'),-100);
 assert.equal(metrics.periodDelta(3,0,'week'),null);
 assert.equal(metrics.periodDelta(null,10,'week'),null);
});
