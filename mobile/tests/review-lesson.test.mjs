import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess } from 'chess.js';
import { buildReviewLesson, assembleReviewMarks } from '../src/lib/review-lesson.ts';
import { makeGame,reviewGame } from './fixtures/review-game.mjs';
test('find/praise/look keep game order and correct before/after positions',()=>{
 const r=buildReviewLesson(reviewGame); assert.equal(r.status,'ready');
 assert.deepEqual(r.steps.map(s=>s.type),['find','praise','look']);
 assert.equal(new Chess(r.steps[0].fenBefore).turn(),'w');
 assert.equal(new Chess(r.steps[0].fenAfter).get('e4').type,'p');
 assert.throws(()=>assembleReviewMarks(r.steps,{}));
 assert.deepEqual(assembleReviewMarks(r.steps,{1:'found',3:'praise',5:'seen'}).map(m=>m.mark),['found','praise','seen']);
});
test('opponent blunder includes own response once, even if it was great',()=>{
 const g=makeGame();g.plies[1].win_pct_before=50;g.plies[1].win_pct_after=30;g.plies[2].classification='great';
 assert.deepEqual(buildReviewLesson(g).steps.map(s=>s.ply),[3]);
 g.plies[1].win_pct_after=31;g.plies[2].classification='good'; assert.equal(buildReviewLesson(g).steps.length,0);
 g.plies[1].win_pct_after=20;g.plies[2].classification='inaccuracy'; assert.equal(buildReviewLesson(g).steps[0].kind,'miss');
});
test('custom Black start uses fullmove numbering and player side',()=>{
 const g=makeGame(['Kh7','Ka2'],'7k/8/8/8/8/8/8/K7 b - - 0 29','black');g.plies[0].classification='great';
 assert.equal(buildReviewLesson(g).steps[0].label,'29… Kh7');
});
test('quiet analysed game is ready; unsafe inputs remain replay-only',()=>{
 assert.deepEqual(buildReviewLesson(makeGame()).steps,[]);
 for (const change of [{analysed:false},{color:null},{san:['garbage']},{start_fen:'bad'},{plies:[]},
   {plies:reviewGame.plies.map((m,i)=>i===0?{...m,uci:'d2d4'}:m)},
   {plies:reviewGame.plies.map((m,i)=>i===0?{...m,color:'black'}:m)},
   {plies:reviewGame.plies.map((m,i)=>i===0?{...m,san:'d4'}:m)}])
   assert.equal(buildReviewLesson({...reviewGame,...change}).status,'replay-only');
});
test('fingerprint changes with teaching inputs but not saved marks',()=>{
 const a=buildReviewLesson(reviewGame).fingerprint;
 assert.notEqual(buildReviewLesson({...reviewGame,deck_plies:[1,5]}).fingerprint,a);
 assert.equal(buildReviewLesson({...reviewGame,review_marks:[{ply:1,mark:'found'}]}).fingerprint,a);
});
test('oversized lesson is not silently truncated',()=>{
 const san=[];for(let i=0;i<201;i++)san.push('Nf3','Nf6','Ng1','Ng8');
 const g=makeGame(san);g.plies.forEach(m=>{if(m.color==='white')m.classification='great';});
 assert.equal(buildReviewLesson(g).status,'replay-only');
});
