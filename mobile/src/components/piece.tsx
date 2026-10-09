import type { ReactNode } from "react";
import Svg, { Path, Rect, Circle, G } from "react-native-svg";
import { useTheme } from "../lib/theme";
export type PieceKind = "k" | "q" | "r" | "b" | "n" | "p";
export type PieceSide = "w" | "b";
const BODY: Record<PieceKind, ReactNode> = {
  p: (
    <>
      <Path d="M34 79 C34 64 40 56 50 51 C60 56 66 64 66 79 Z" />
      <Rect x="37" y="44" width="26" height="9" rx="4.5" />
      <Circle cx="50" cy="30" r="13" />
    </>
  ),
  r: (
    <>
      <Path d="M31 79 L34 44 H66 L69 79 Z" />
      <Path d="M27 18 H37 V25 H45 V18 H55 V25 H63 V18 H73 V40 Q73 44 69 44 H31 Q27 44 27 40 Z" />
    </>
  ),
  n: (
    <Path d="M30 79 H72 C72 60 70 46 64 36 C59 27 52 21 44 19 L45 10 L37 16 C29 19 22 28 18 39 L15 50 C17 57 26 58 30 53 L39 46 C41 54 36 64 30 79 Z" />
  ),
  b: (
    <>
      <Path d="M37 66 C37 72 33 76 29 79 H71 C67 76 63 72 63 66 Z" />
      <Rect x="35" y="58" width="30" height="9" rx="4.5" />
      <Path d="M50 19 C35 30 33 46 40 58 H60 C67 46 65 30 50 19 Z" />
      <Circle cx="50" cy="13" r="6.5" />
    </>
  ),
  q: (
    <>
      <Path d="M34 69 C34 74 29 77 26 79 H74 C71 77 66 74 66 69 Z" />
      <Rect x="31" y="61" width="38" height="9" rx="4.5" />
      <Path d="M22 30 L33 61 H67 L78 30 L63 46 L58 22 L50 44 L42 22 L37 46 Z" />
      <Circle cx="22" cy="27" r="5.5" />
      <Circle cx="42" cy="19" r="5.5" />
      <Circle cx="58" cy="19" r="5.5" />
      <Circle cx="78" cy="27" r="5.5" />
    </>
  ),
  k: (
    <>
      <Path d="M35 69 C35 74 30 77 27 79 H73 C70 77 65 74 65 69 Z" />
      <Rect x="32" y="61" width="36" height="9" rx="4.5" />
      <Path d="M27 40 C27 30 37 26 50 32 C63 26 73 30 73 40 C73 50 66 55 64 61 H36 C34 55 27 50 27 40 Z" />
      <Rect x="46" y="6" width="8" height="24" rx="3" />
      <Rect x="39" y="12" width="22" height="8" rx="3" />
    </>
  ),
};

/** Lines drawn over the body: the rook's band, the knight's mane, the bishop's mitre cut. */
const DETAIL: Partial<Record<PieceKind, string>> = {
  r: "M36 58 H64",
  n: "M50 24 C58 30 63 42 64 56",
  b: "M56 30 L46 44",
};

export function Piece({ kind, side }: { kind: PieceKind; side: PieceSide }) {
  const { colors: c } = useTheme();
  const white = side === "w";
  const fill = white ? c.pieceWhite : c.pieceBlack;
  const shade = white ? c.pieceWhiteShade : c.pieceBlackShade;
  const outline = white ? c.pieceOutline : c.pieceBlackOutline;
  const detail = white ? shade : c.pieceBlackDetail;
  const stroke = {
    stroke: outline,
    strokeWidth: 4.5,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  } as const;
  return (
    <Svg width="96%" height="96%" viewBox="0 0 100 100" aria-hidden={true}>
      <Rect
        x="20"
        y="79"
        width="60"
        height="13"
        rx="6.5"
        {...stroke}
        fill={shade}
      />
      <G {...stroke} fill={fill}>
        {BODY[kind]}
      </G>
      {kind === "n" && (
        <Circle
          cx="35"
          cy="31"
          r="3.6"
          fill={white ? outline : c.pieceBlackEye}
        />
      )}
      {DETAIL[kind] && (
        <Path
          d={DETAIL[kind]}
          fill="none"
          stroke={detail}
          strokeWidth={4}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}
