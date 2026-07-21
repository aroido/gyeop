import type { ReactNode } from "react";

import { PlayTransitionProvider } from "./play-transition";

export default function PlayLayout({ children }: { children: ReactNode }) {
  return <PlayTransitionProvider>{children}</PlayTransitionProvider>;
}
