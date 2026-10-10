import { createContext } from "react";

/** A measured parent can seed the board before its own first layout event. */
export const BoardSizeContext = createContext(0);
