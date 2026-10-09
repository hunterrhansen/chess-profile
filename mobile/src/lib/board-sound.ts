import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAudioPlayer } from "expo-audio";
import type { MoveSound } from "./board-motion";
import { answerSound } from "./board-cues";
/** Bundled motifs work offline. The default audio session respects silent mode.
 * Player hooks release native resources when the board unmounts. */
export function useBoardSound(
  cue: { id: string; sound: MoveSound; delay: number } | null,
  enabled: boolean,
  feedback?: { id: number; tone: "right" | "wrong" },
  special?: { id: string; delay: number } | null,
) {
  const move = useAudioPlayer(require("../../assets/board-sounds/move.wav"));
  const capture = useAudioPlayer(
    require("../../assets/board-sounds/capture.wav"),
  );
  const castle = useAudioPlayer(
    require("../../assets/board-sounds/castle.wav"),
  );
  const check = useAudioPlayer(require("../../assets/board-sounds/check.wav"));
  const promote = useAudioPlayer(
    require("../../assets/board-sounds/promote.wav"),
  );
  const checkmate = useAudioPlayer(
    require("../../assets/board-sounds/checkmate.wav"),
  );
  const right = useAudioPlayer(require("../../assets/board-sounds/right.wav"));
  const wrong = useAudioPlayer(require("../../assets/board-sounds/wrong.wav"));
  const brilliant = useAudioPlayer(
    require("../../assets/board-sounds/brilliant.wav"),
  );
  const sound = cue?.sound;
  const player =
    sound === "capture"
      ? capture
      : sound === "castle"
        ? castle
        : sound === "check"
          ? check
          : sound === "promote"
            ? promote
            : sound === "checkmate"
              ? checkmate
              : move;
  const id = cue?.id,
    delay = cue?.delay ?? 0;
  const playedMove = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!sound || playedMove.current === id) return;
    if (!enabled) {
      playedMove.current = id;
      return;
    }
    const timer = setTimeout(() => {
      playedMove.current = id;
      if (AppState.currentState !== "active") return;
      void player
        .seekTo(0)
        .then(() => player.play())
        .catch(() => {});
    }, delay);
    return () => clearTimeout(timer);
  }, [id, sound, player, delay, enabled]);
  const feedbackId = feedback?.id,
    tone = answerSound(feedback?.tone, sound);
  const feedbackPlayer = tone === "right" ? right : wrong;
  const playedAnswer = useRef<number | undefined>(feedbackId);
  useEffect(() => {
    if (feedbackId === undefined || playedAnswer.current === feedbackId) return;
    if (!enabled || !tone) {
      playedAnswer.current = feedbackId;
      return;
    }
    const timer = setTimeout(() => {
      playedAnswer.current = feedbackId;
      if (AppState.currentState !== "active") return;
      void feedbackPlayer
        .seekTo(0)
        .then(() => feedbackPlayer.play())
        .catch(() => {});
    }, delay);
    return () => clearTimeout(timer);
  }, [feedbackId, feedbackPlayer, tone, delay, enabled]);
  const specialId = special?.id,
    specialDelay = special?.delay;
  const playedSpecial = useRef<string | undefined>(specialId);
  useEffect(() => {
    if (specialId === undefined || playedSpecial.current === specialId) return;
    if (!enabled) {
      playedSpecial.current = specialId;
      return;
    }
    const timer = setTimeout(() => {
      playedSpecial.current = specialId;
      if (AppState.currentState !== "active") return;
      void brilliant
        .seekTo(0)
        .then(() => brilliant.play())
        .catch(() => {});
    }, specialDelay);
    return () => clearTimeout(timer);
  }, [specialId, specialDelay, brilliant, enabled]);
}
