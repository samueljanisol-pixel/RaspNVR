'use client';

import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  onEnter?: () => void;
  onExit?: () => void;
};

export function useLiveFullscreen(stageRef: RefObject<HTMLElement | null>, options: Options = {}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pushedRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const unlockOrientation = useCallback(() => {
    const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
    orientation.unlock?.();
  }, []);

  const lockLandscape = useCallback(async () => {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // Non supporté (iOS, desktop…)
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    unlockOrientation();
    if (pushedRef.current) {
      pushedRef.current = false;
      history.back();
    }
    setIsFullscreen(false);
    optionsRef.current.onExit?.();
  }, [unlockOrientation]);

  const enterFullscreen = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || document.fullscreenElement) return;
    await stage.requestFullscreen();
    history.pushState({ liveFullscreen: true }, '');
    pushedRef.current = true;
    setIsFullscreen(true);
    await lockLandscape();
    optionsRef.current.onEnter?.();
  }, [stageRef, lockLandscape]);

  useEffect(() => {
    function onFullscreenChange() {
      const active = document.fullscreenElement === stageRef.current;
      setIsFullscreen(active);
      if (!active) {
        unlockOrientation();
        if (pushedRef.current) {
          pushedRef.current = false;
          history.back();
        }
        optionsRef.current.onExit?.();
      }
    }

    function onPopState() {
      if (document.fullscreenElement === stageRef.current) {
        pushedRef.current = false;
        document.exitFullscreen();
        unlockOrientation();
        setIsFullscreen(false);
        optionsRef.current.onExit?.();
      }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
      window.removeEventListener('popstate', onPopState);
      unlockOrientation();
    };
  }, [stageRef, unlockOrientation]);

  return { isFullscreen, enterFullscreen, exitFullscreen };
}
