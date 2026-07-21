"use client";

import type { AnimationItem } from "lottie-web";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
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

import {
  normalizeOpeningTone,
  openingPackIdentity,
  themePackOpeningAnimation,
} from "@/lib/packs/opening-theme.mjs";

import styles from "./play-transition.module.css";

type OpeningPhase =
  "opening" | "committing" | "route-loading" | "handoff-complete";

type OpeningState = Readonly<{
  pack: string;
  packTitle: string;
  coverTone: string;
  coverRecipe: string;
  phase: OpeningPhase;
  readyPlayId: string | null;
}>;

type PlayTransitionContextValue = Readonly<{
  beginOpening: (
    pack: string,
    packTitle: string | null,
    coverTone: string | null,
    coverRecipe: string | null,
  ) => void;
  resolveOpening: (playId: string) => void;
  abortOpening: () => void;
  completeHandoff: (playId: string) => void;
}>;

const SNAP_PROGRESS = 0.85;
const LAST_LOTTIE_FRAME = 119;
const HANDOFF_FRAME = 94;
const HANDOFF_PROGRESS = HANDOFF_FRAME / LAST_LOTTIE_FRAME;
const PlayTransitionContext = createContext<PlayTransitionContextValue | null>(
  null,
);

function PackOpeningAnimation({
  progress,
  opened,
  packTitle,
  coverTone,
  coverRecipe,
}: {
  progress: MotionValue<number>;
  opened: boolean;
  packTitle: string;
  coverTone: string;
  coverRecipe: string;
}) {
  const [renderer, setRenderer] = useState<"loading" | "lottie" | "fallback">(
    "loading",
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const identity = openingPackIdentity(coverRecipe);
  const identityOpacity = useTransform(progress, [0, 0.18, 0.34], [1, 1, 0]);
  const identityY = useTransform(progress, [0, 0.18, 0.34], [0, 0, -16]);

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

    void Promise.all([
      import("lottie-web"),
      fetch("/animations/gyeop-pack-opening.json").then((response) => {
        if (!response.ok) throw new Error("Pack opening animation failed");
        return response.json();
      }),
    ])
      .then(([{ default: lottie }, baseAnimation]) => {
        if (!active) return;
        animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: false,
          autoplay: false,
          animationData: themePackOpeningAnimation(baseAnimation, coverTone),
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
  }, [coverTone, progress, setFrame]);

  return (
    <div
      ref={stageRef}
      className={styles.packArt}
      data-testid="pack-opening-stage"
      data-frame="0"
      data-renderer={renderer}
      data-opened={opened || undefined}
      data-cover-tone={coverTone}
      data-cover-recipe={coverRecipe}
      data-pack-mark={identity.mark}
      data-pattern={identity.pattern}
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
      <motion.div
        className={styles.packIdentity}
        data-testid="pack-opening-identity"
        style={{ opacity: identityOpacity, y: identityY }}
      >
        <span>{identity.mark}</span>
        <strong>{packTitle}</strong>
      </motion.div>
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
    (
      pack: string,
      packTitle: string | null,
      coverTone: string | null,
      coverRecipe: string | null,
    ) => {
      resetMotion();
      window.scrollTo({ top: 0, behavior: "instant" });
      const next: OpeningState = {
        pack,
        packTitle: packTitle ?? "새 질문팩",
        coverTone: normalizeOpeningTone(coverTone),
        coverRecipe: coverRecipe ?? "",
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

  const finishOpening = useCallback(
    (playId: string) => {
      settlingRef.current?.stop();
      const controls = animate(progress, 1, {
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.7,
      });
      settlingRef.current = controls;
      void controls.then(() => {
        if (settlingRef.current === controls) settlingRef.current = null;
        const current = openingRef.current;
        if (current?.phase !== "committing" || current.readyPlayId !== playId) {
          return;
        }
        navigateToPlay(playId);
      });
    },
    [navigateToPlay, progress],
  );

  const resolveOpening = useCallback(
    (playId: string) => {
      const current = openingRef.current;
      if (!current) return;
      const next: OpeningState = { ...current, readyPlayId: playId };
      openingRef.current = next;
      setOpening(next);
      if (shouldReduceMotion) {
        navigateToPlay(playId);
      } else if (current.phase === "committing") {
        finishOpening(playId);
      }
    },
    [finishOpening, navigateToPlay, shouldReduceMotion],
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
    const next: OpeningState = { ...current, phase: "committing" };
    openingRef.current = next;
    setOpening(next);
    if (next.readyPlayId) {
      finishOpening(next.readyPlayId);
      return;
    }
    const controls = animate(progress, HANDOFF_PROGRESS, {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 0.7,
    });
    settlingRef.current = controls;
    void controls.then(() => {
      if (settlingRef.current === controls) settlingRef.current = null;
    });
  }, [finishOpening, progress]);

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
    progress.set(Math.min(value / SNAP_PROGRESS, 1) * HANDOFF_PROGRESS);
    if (value >= SNAP_PROGRESS) settleOpening();
  });

  useEffect(
    () => () => {
      settlingRef.current?.stop();
    },
    [],
  );

  const hiddenFromAccessibility = opening?.phase !== "opening";

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
          data-cover-tone={opening.coverTone}
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
              packTitle={opening.packTitle}
              coverTone={opening.coverTone}
              coverRecipe={opening.coverRecipe}
              opened={
                opening.phase === "route-loading" ||
                opening.phase === "handoff-complete"
              }
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
              ) : null}
            </div>
          </div>
        </motion.section>
      ) : null}
    </PlayTransitionContext.Provider>
  );
}
