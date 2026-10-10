import { Chess } from 'chess.js';
import { sampleGame } from '../../src/lib/game-replay.ts';
export function makeGame(san = ['e4','e5','Nf3','Nc6','Bc4','Bc5'], start_fen = null, color = 'white') {
  const chess = new Chess(start_fen ?? undefined);
  const plies = san.map((text, i) => {
    const move = chess.move(text);
    return { ply:i+1, san:move.san, uci:move.from+move.to+(move.promotion??''),
      color:move.color==='w'?'white':'black', is_user: (move.color==='w'?'white':'black')===color ? 1:0,
      classification:'good', best_san:move.san, best_uci:move.from+move.to+(move.promotion??''),
      win_pct_before:50, win_pct_after:50, eval_after:0, mate_after:null, clock_left:null,time_spent:null,pattern:null };
  });
  return {...sampleGame,id:12,analysed:true,start_fen,san,plies,color,
    deck_plies:[],review_marks:[],reviewed_at:null,accuracy:80};
}
export const reviewGame = makeGame();
reviewGame.plies[0].classification='mistake'; reviewGame.deck_plies=[1];
reviewGame.plies[2].classification='great'; reviewGame.plies[4].classification='blunder';
