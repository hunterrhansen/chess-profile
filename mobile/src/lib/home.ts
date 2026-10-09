export interface Unit {
  id: "blunders" | "conversion" | "punish" | "comebacks";
  title: string;
  kpi: string;
  value: number | null; // over the last 90 days, as on Progress
  target: number;
  lower_better: boolean;
  done: boolean;
  check: { size: number; games: number; hits: number; value: number | null };
}

export interface Home {
  units: Unit[]; // path order: weakest unfinished first, finished last
  today: {
    game: {
      id: number;
      opponent: string | null;
      played_at: string;
      outcome: string | null;
      blunders: number | null;
      time_control: string | null;
      fits_unit: boolean;
    } | null; // the game to review today, if there's a new one
    new_games: number;
    reviewed_today: number;
    positions: { done: number; total: number };
    deck_total: number;
    /** Lichess puzzles for your most common tactic (puzzles.py). */
    puzzles: {
      theme: string | null;
      share: number | null;
      done: number;
      session: number;
      available: boolean;
    };
  };
}
