import { Chess } from 'chess.js';
import type { Api,DeckAnswer,DeckToday,DeckCard } from './api';
import type { PracticeSession } from './practice-flow';
import { recoverPosition, type ReviewSession } from './review-session.ts';
export function reviewOutcome({uci,answer,hadHelp,hadFirstAttempt}:{uci:string;answer:DeckAnswer;hadHelp:boolean;hadFirstAttempt:boolean}) {
  if(uci==='0000')return 'missed' as const;
  if(!answer.correct)return null;
  if(hadHelp||hadFirstAttempt||answer.rating===null)return 'helped' as const;
  return answer.quality==='good'?'good' as const:'found' as const;
}
type Options={api:Api;session:ReviewSession;ply:number;gameId:number;fen:string;practice?:PracticeSession;card?:DeckCard};
/** One review position. Pending writes and conservative recovery precede every grading call. */
export class ReviewAttempt {
  private options:Options;private abort=new AbortController();private listeners=new Set<()=>void>();
  busy=false;ready=false;error?:string;warning?:string;private active=true;
  constructor(options:Options){this.options=options;options.session.state.positions[options.ply]??={hints:0,startedAt:Date.now(),hadAttempt:false};}
  get progress(){return this.options.session.state.positions[this.options.ply];}
  subscribe(listener:()=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private notify(){if(this.active)this.listeners.forEach(fn=>fn());}
  dispose(){this.active=false;this.abort.abort();this.listeners.clear();}
  private async save(){try{await this.options.session.save();}catch{this.warning='Progress could not be stored on this device. Keep this review open to continue.';}this.notify();}
  private async deck(){
    const d=await this.options.api<DeckToday>('/api/deck',undefined,this.abort.signal);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.server_day??''))throw Error('This server needs the guided review update before you can answer.');
    return d;
  }
  async refresh(){
    if(this.busy||!this.active)return;
    this.busy=true;this.error=undefined;this.notify();
    try {
      const d=await this.deck();if(!this.active)return;
      const {practice,card}=this.options;
      if(practice&&card){await practice.load();const h=practice.hint(card);if(h&&h.count>this.progress.hints){this.progress.hints=h.count;this.progress.hintMove=h.bestMove;}}
      const p=recoverPosition(this.progress,d.server_day);
      if(d.results.some(r=>r.game_id===this.options.gameId&&r.ply===this.options.ply))p.hadAttempt=true;
      this.options.session.state.positions[this.options.ply]=p;
      this.ready=true;await this.save();
    }catch(e){if(this.active)this.error=e instanceof Error?e.message:'Could not prepare this position.';}
    finally{this.busy=false;this.notify();}
  }
  async restart(){
    if(this.busy||!this.active)return;
    try{const d=await this.deck();if(!this.active)return;this.progress.day=d.server_day;this.progress.needsRestart=false;this.progress.pending=undefined;this.progress.first=undefined;this.progress.startedAt=Date.now();await this.save();}
    catch(e){this.error=e instanceof Error?e.message:'Could not restart.';}this.notify();
  }
  async hint(rung:string){
    if(this.busy||!this.ready||this.progress.outcome||this.progress.needsRestart||!this.active)return;
    this.busy=true;this.error=undefined;this.notify();
    try {
      // Persist help before revealing it, including tactic-only hints.
      this.progress.hints=Math.min(3,this.progress.hints+1);await this.save();
      const {practice,card}=this.options;
      if(practice&&card)await practice.rememberHint(card,this.progress.hints,this.progress.hintMove,this.progress.startedAt).catch(()=>{this.warning='Hint progress is only stored in this open review.';});
      if(rung!=='tactic'&&!this.progress.hintMove){
        const r=await this.options.api<{best_uci:string}>('/api/deck/hint',{game_id:this.options.gameId,ply:this.options.ply},this.abort.signal);
        if(!this.active)return;
        const chess=new Chess(this.options.fen);chess.move({from:r.best_uci.slice(0,2),to:r.best_uci.slice(2,4),promotion:r.best_uci[4]});
        this.progress.hintMove=r.best_uci;await this.save();
        if(practice&&card)await practice.rememberHint(card,this.progress.hints,r.best_uci,this.progress.startedAt).catch(()=>{});
      }
    }catch(e){if(this.active)this.error=e instanceof Error?e.message:'Could not load hint.';}
    finally{this.busy=false;this.notify();}
  }
  async submit(uci:string){
    if(this.busy||!this.ready||this.progress.outcome||this.progress.needsRestart||!this.active)return;
    if(uci!=='0000')try{new Chess(this.options.fen).move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});}catch{return;}
    this.busy=true;this.error=undefined;this.notify();
    const seconds=Math.max(0,Math.min(86400,(Date.now()-this.progress.startedAt)/1000));
    try {
      const d=await this.deck();if(!this.active)return;
      const p=this.progress;
      if(p.day&&p.day!==d.server_day){p.needsRestart=true;await this.save();throw Error('A new review day has started. Restart this position to continue.');}
      p.day=d.server_day;
      const hadFirstAttempt=p.hadAttempt||!!p.pending||!!p.first||d.results.some(r=>r.game_id===this.options.gameId&&r.ply===this.options.ply);
      const hinted=p.hints>0;
      p.pending={uci,day:d.server_day};await this.save();
      const {practice,card}=this.options;
      if(practice&&card)await practice.beginAnswer(card,p.startedAt).catch(()=>{});
      const r=await this.options.api<DeckAnswer>('/api/deck/answer',{game_id:this.options.gameId,ply:this.options.ply,uci,hinted,redo:false,
        seconds:Number.isFinite(seconds)?seconds:0,expected_day:d.server_day},this.abort.signal);
      if(!this.active)return;
      if(!r||typeof r.correct!=='boolean'||typeof r.best_uci!=='string')throw Error('The answer response could not be read. Try this position again.');
      if(r.correct||uci==='0000')new Chess(this.options.fen).move({from:(uci==='0000'?r.best_uci:uci).slice(0,2),to:(uci==='0000'?r.best_uci:uci).slice(2,4),promotion:(uci==='0000'?r.best_uci:uci)[4]});
      if(practice&&card)await practice.finishAnswer(card,!r.correct||hinted||hadFirstAttempt||r.rating===null||uci==='0000').catch(()=>{});
      p.first??=r;p.pending=undefined;p.hadAttempt=true;
      const outcome=reviewOutcome({uci,answer:r,hadHelp:hinted,hadFirstAttempt});
      if(outcome){p.outcome=outcome;p.played=uci==='0000'?r.best_uci:uci;this.options.session.state.marks[this.options.ply]=outcome;}
      await this.save();
    }catch(e){if(this.active)this.error=e instanceof Error?e.message:'Could not check the answer. Try again.';}
    finally{this.busy=false;this.notify();}
  }
}
