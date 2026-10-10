import assert from 'node:assert/strict';import {test} from 'node:test';
import { ReviewSession, completionConfirmed, recoverPosition } from '../src/lib/review-session.ts';
const memory=()=>{const values=new Map();return {getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)};};
test('progress reloads and remains scoped to identity/game/lesson',async()=>{
 const storage=memory(), a=new ReviewSession(storage,'server/alice',1,'lesson'); await a.load();
 a.state.step=2;a.state.marks[1]='found';a.state.positions[1]={hints:1,startedAt:5,hadAttempt:true};await a.save();
 const b=new ReviewSession(storage,'server/alice',1,'lesson');await b.load();assert.equal(b.state.step,2);assert.equal(b.state.positions[1].hints,1);
 for(const args of [['server/bob',1,'lesson'],['server/alice',2,'lesson'],['server/alice',1,'new']]){
 const c=new ReviewSession(storage,...args);await c.load();assert.equal(c.state.step,0);}
 await b.clear();const c=new ReviewSession(storage,'server/alice',1,'lesson');await c.load();assert.equal(c.state.step,0);
});
test('corrupt storage resets safely and failures preserve memory',async()=>{
 const storage={getItem:async()=>'{bad',setItem:async()=>{throw Error('full')},removeItem:async()=>{throw Error('full')}};
 const s=new ReviewSession(storage,'scope',1,'f');await s.load();s.state.pendingFinish={marks:[],baselineReviewedAt:null};
 await assert.rejects(s.save());assert.deepEqual(s.state.pendingFinish.marks,[]);
});
test('writes serialize so older saves cannot overwrite latest',async()=>{
 const storage=memory();const s=new ReviewSession(storage,'order',1,'f');s.state.step=1;const a=s.save();s.state.step=2;const b=s.save();await Promise.all([a,b]);
 const restored=new ReviewSession(storage,'order',1,'f');await restored.load();assert.equal(restored.state.step,2);
});
test('only new timestamp and exact marks confirm finish',()=>{
 const pending={marks:[{ply:1,mark:'found'}],baselineReviewedAt:'old'};
 assert.equal(completionConfirmed({review_marks:pending.marks,reviewed_at:'old'},pending),false);
 assert.equal(completionConfirmed({review_marks:pending.marks,reviewed_at:'new'},pending),true);
 assert.equal(completionConfirmed({review_marks:[],reviewed_at:'new'},pending),false);
});
test('lost response stays conservative and date change requires restart',()=>{
 const p={hints:1,startedAt:1,hadAttempt:true,pending:{uci:'e2e4',day:'2026-10-10'},day:'2026-10-10'};
 const r=recoverPosition(p,'2026-10-10');assert.equal(r.hadAttempt,true);assert.equal(r.pending,undefined);assert.equal(r.needsRestart,false);assert.equal(r.first,undefined);
 assert.equal(recoverPosition(p,'2026-10-11').needsRestart,true);
});
