"use client";

import type { AnimationItem } from "lottie-web";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  type MotionValue,
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
const LAST_LOTTIE_FRAME = 119;
const PlayTransitionContext = createContext<PlayTransitionContextValue | null>(
  null,
);

function PackOpeningAnimation({
  progress,
  opened,
}: {
  progress: MotionValue<number>;
  opened: boolean;
}) {
  const [renderer, setRenderer] = useState<"loading" | "lottie" | "fallback">(
    "loading",
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);

  const setFrame = useCallback((value: number) => {
    const frame = Math.round(
      Math.max(0, Math.min(value, 1)) * LAST_LOTTIE_FRAME,
    );
    stageRef.current?.setAttribute("data-frame", String(frame));
    animationRef.current?.goToAndStop(frame, true);
  }, []);

  useMotionValueEvent(progress, "change", setFrame);

  useEffect(() => {
    setFrame(progress.get());
  }, [progress, setFrame]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;
    let animation: AnimationItem | null = null;
    const handleLoadError = () => {
      if (active) setRenderer("fallback");
    };

    void import("lottie-web")
      .then(({ default: lottie }) => {
        if (!active) return;
        animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: false,
          autoplay: false,
          path: "/animations/gyeop-pack-opening.json",
        });
        animationRef.current = animation;
        animation.addEventListener("DOMLoaded", () => {
          if (!active) return;
          setRenderer("lottie");
          setFrame(progress.get());
        });
        animation.addEventListener("data_failed", handleLoadError);
      })
      .catch(handleLoadError);

    return () => {
      active = false;
      animationRef.current = null;
      animation?.destroy();
    };
  }, [progress, setFrame]);

  return (
    <div
      ref={stageRef}
      className={styles.packArt}
      data-testid="pack-opening-stage"
      data-frame="0"
      data-renderer={renderer}
      data-opened={opened || undefined}
      aria-hidden="true"
    >
      <div className={styles.fallbackArt}>
        <i className={styles.fallbackHalo} />
        <i className={styles.fallbackCard} />
        <i className={styles.fallbackPack} />
      </div>
      <div
        ref={containerRef}
        className={styles.lottieCanvas}
        data-testid="pack-opening-lottie"
      />
    </div>
  );
}

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
            <PackOpeningAnimation
              progress={progress}
              opened={opening.phase !== "opening"}
            />
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
