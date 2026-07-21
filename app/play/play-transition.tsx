"use client";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "./play-transition.module.css";

type OpeningPhase =
  "opening" | "opened-waiting" | "route-loading" | "handoff-complete";

type OpeningState = Readonly<{
  pack: string;
  packTitle: string;
  phase: OpeningPhase;
  readyPlayId: string | null;
}>;

type PlayTransitionContextValue = Readonly<{
  beginOpening: (pack: string, packTitle: string | null) => void;
  resolveOpening: (playId: string) => void;
  abortOpening: () => void;
  completeHandoff: (playId: string) => void;
}>;

const SNAP_PROGRESS = 0.85;
const PlayTransitionContext = createContext<PlayTransitionContextValue | null>(
  null,
);

export function usePlayTransition() {
  const value = useContext(PlayTransitionContext);
  if (!value) throw new Error("PlayTransitionProvider is missing");
  return value;
}

export function PlayTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useMotionValue(0);
  const smoothProgress = useSpring(progress, {
    stiffness: 260,
    damping: 34,
    mass: 0.72,
    restDelta: 0.001,
  });
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const openingRef = useRef<OpeningState | null>(null);
  const lockedRef = useRef(false);
  const settlingRef = useRef<ReturnType<typeof animate> | null>(null);

  const resetMotion = useCallback(() => {
    settlingRef.current?.stop();
    settlingRef.current = null;
    lockedRef.current = false;
    progress.jump(0);
  }, [progress]);

  const beginOpening = useCallback(
    (pack: string, packTitle: string | null) => {
      resetMotion();
      window.scrollTo({ top: 0, behavior: "instant" });
      const next: OpeningState = {
        pack,
        packTitle: packTitle ?? "새 질문팩",
        phase: "opening",
        readyPlayId: null,
      };
      openingRef.current = next;
      setOpening(next);
    },
    [resetMotion],
  );

  const abortOpening = useCallback(() => {
    resetMotion();
    openingRef.current = null;
    setOpening(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [resetMotion]);

  const navigateToPlay = useCallback(
    (playId: string) => {
      const current = openingRef.current;
      if (!current || current.phase === "route-loading") return;
      lockedRef.current = true;
      progress.jump(1);
      const next: OpeningState = {
        ...current,
        readyPlayId: playId,
        phase: "route-loading",
      };
      openingRef.current = next;
      setOpening(next);
      window.scrollTo({ top: 0, behavior: "instant" });
      router.replace(`/play/${encodeURIComponent(playId)}`, { scroll: false });
    },
    [progress, router],
  );

  const resolveOpening = useCallback(
    (playId: string) => {
      const current = openingRef.current;
      if (!current) return;
      const next: OpeningState = { ...current, readyPlayId: playId };
      openingRef.current = next;
      setOpening(next);
      if (shouldReduceMotion || current.phase === "opened-waiting") {
        navigateToPlay(playId);
      }
    },
    [navigateToPlay, shouldReduceMotion],
  );

  const completeHandoff = useCallback((playId: string) => {
    const current = openingRef.current;
    if (current?.phase !== "route-loading" || current.readyPlayId !== playId) {
      return;
    }
    const next: OpeningState = { ...current, phase: "handoff-complete" };
    openingRef.current = next;
    setOpening(next);
  }, []);

  const settleOpening = useCallback(() => {
    const current = openingRef.current;
    if (!current || current.phase !== "opening" || lockedRef.current) return;
    lockedRef.current = true;
    settlingRef.current?.stop();
    const controls = animate(progress, 1, {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 0.7,
    });
    settlingRef.current = controls;
    void controls.then(() => {
      settlingRef.current = null;
      const value = openingRef.current;
      if (value?.phase !== "opening") return;
      const next: OpeningState = { ...value, phase: "opened-waiting" };
      openingRef.current = next;
      setOpening(next);
      if (next.readyPlayId) navigateToPlay(next.readyPlayId);
    });
  }, [navigateToPlay, progress]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const current = openingRef.current;
    if (
      !current ||
      current.phase !== "opening" ||
      shouldReduceMotion ||
      lockedRef.current
    ) {
      return;
    }
    progress.set(Math.min(value / SNAP_PROGRESS, 1));
    if (value >= SNAP_PROGRESS) settleOpening();
  });

  useEffect(
    () => () => {
      settlingRef.current?.stop();
    },
    [],
  );

  const cardX = useTransform(
    smoothProgress,
    [0, 0.3, 0.58, 0.84, 1],
    [0, 0, -4, 3, 0],
  );
  const cardY = useTransform(
    smoothProgress,
    [0, 0.18, 0.34, 0.72, 0.9, 1],
    [16, 18, 8, -86, -138, -132],
  );
  const cardScale = useTransform(
    smoothProgress,
    [0, 0.28, 0.72, 0.9, 1],
    [0.96, 0.96, 0.985, 1.02, 1],
  );
  const cardRotate = useTransform(
    smoothProgress,
    [0, 0.3, 0.62, 0.88, 1],
    [-1.2, -1.2, -0.5, 1.2, 0],
  );
  const shellY = useTransform(
    smoothProgress,
    [0, 0.12, 0.24, 0.66, 0.86, 1],
    [0, 3, 0, 6, 72, 118],
  );
  const shellScaleY = useTransform(
    smoothProgress,
    [0, 0.12, 0.25],
    [1, 0.985, 1],
  );
  const shellRotate = useTransform(
    smoothProgress,
    [0, 0.13, 0.3, 1],
    [0, -0.7, 0.25, 0],
  );
  const shellOpacity = useTransform(smoothProgress, [0.82, 1], [1, 0]);
  const tearX = useTransform(
    smoothProgress,
    [0, 0.1, 0.28, 0.5, 0.72],
    [0, 0, -12, -78, -98],
  );
  const tearY = useTransform(
    smoothProgress,
    [0, 0.12, 0.3, 0.52, 0.72],
    [0, 1, -5, -24, -34],
  );
  const tearRotate = useTransform(
    smoothProgress,
    [0, 0.12, 0.34, 0.72],
    [0, -1, -7, -18],
  );
  const tearScaleX = useTransform(
    smoothProgress,
    [0, 0.14, 0.32, 0.58],
    [1, 0.98, 1.02, 1],
  );
  const tearOpacity = useTransform(smoothProgress, [0.62, 0.82], [1, 0]);
  const mouthScaleY = useTransform(
    smoothProgress,
    [0.12, 0.28, 0.42],
    [0.05, 0.32, 1],
  );
  const mouthOpacity = useTransform(smoothProgress, [0.12, 0.22], [0, 1]);
  const haloScale = useTransform(smoothProgress, [0, 0.72, 1], [0.86, 1, 1.08]);
  const haloOpacity = useTransform(
    smoothProgress,
    [0, 0.68, 1],
    [0.16, 0.28, 0.12],
  );
  const cardShadow = useTransform(
    smoothProgress,
    [0, 0.5, 0.78, 1],
    [
      "2px 3px 0 #315cff",
      "3px 4px 0 #315cff",
      "8px 12px 0 #315cff",
      "6px 7px 0 #315cff",
    ],
  );

  const hiddenFromAccessibility =
    opening?.phase === "route-loading" || opening?.phase === "handoff-complete";

  return (
    <PlayTransitionContext.Provider
      value={{
        beginOpening,
        resolveOpening,
        abortOpening,
        completeHandoff,
      }}
    >
      {children}
      {opening && !shouldReduceMotion ? (
        <motion.section
          className={styles.overlay}
          data-opening-state={opening.phase}
          data-pack={opening.pack}
          aria-hidden={hiddenFromAccessibility || undefined}
          animate={{ opacity: opening.phase === "handoff-complete" ? 0 : 1 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          onAnimationComplete={() => {
            if (openingRef.current?.phase !== "handoff-complete") return;
            resetMotion();
            openingRef.current = null;
            setOpening(null);
          }}
        >
          <div className={styles.stage}>
            <p className={styles.brand}>겹 · CARD PACK</p>
            <div className={styles.packArt} aria-hidden="true">
              <motion.i
                className={styles.halo}
                style={{ scale: haloScale, opacity: haloOpacity }}
              />
              <div className={styles.cardAnchor}>
                <motion.div
                  className={styles.innerCard}
                  data-testid="pack-inner-card"
                  style={{
                    x: cardX,
                    y: cardY,
                    scale: cardScale,
                    rotate: cardRotate,
                    boxShadow: cardShadow,
                  }}
                >
                  <span>겹 · 첫 질문</span>
                  <strong>{opening.packTitle}</strong>
                  <i />
                  <i />
                </motion.div>
              </div>
              <motion.div
                className={styles.packShell}
                data-testid="pack-shell"
                style={{
                  y: shellY,
                  scaleY: shellScaleY,
                  rotate: shellRotate,
                  opacity: shellOpacity,
                }}
              >
                <motion.i
                  className={styles.packMouth}
                  data-testid="pack-mouth"
                  style={{ scaleY: mouthScaleY, opacity: mouthOpacity }}
                />
                <motion.i
                  className={styles.tearStrip}
                  data-testid="pack-tear-strip"
                  style={{
                    x: tearX,
                    y: tearY,
                    rotate: tearRotate,
                    scaleX: tearScaleX,
                    opacity: tearOpacity,
                  }}
                />
                <span className={styles.seal}>GYEOP</span>
              </motion.div>
            </div>
            <div className={styles.copy}>
              <h1>{opening.packTitle}</h1>
              {opening.phase === "opening" ? (
                <>
                  <p>위로 밀어 첫 질문을 꺼내세요</p>
                  <button type="button" onClick={settleOpening}>
                    팩 열기
                  </button>
                </>
              ) : opening.phase === "opened-waiting" ? (
                <p role="status">첫 질문을 준비하고 있어요…</p>
              ) : null}
            </div>
          </div>
        </motion.section>
      ) : null}
    </PlayTransitionContext.Provider>
  );
}
