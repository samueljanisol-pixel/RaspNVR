'use client';

import { RefObject, useEffect, useRef } from 'react';

type Options = {
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function useSwipePages(stageRef: RefObject<HTMLElement | null>, options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const touchRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function onTouchStart(event: TouchEvent) {
      if (!optionsRef.current.enabled || event.touches.length !== 1) return;
      const target = event.target as Element;
      if (target.closest('.video-wrap.is-zoomed')) return;
      touchRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        active: true,
      };
    }

    function onTouchEnd(event: TouchEvent) {
      if (!optionsRef.current.enabled || !touchRef.current.active) return;
      touchRef.current.active = false;
      const dx = event.changedTouches[0].clientX - touchRef.current.x;
      const dy = event.changedTouches[0].clientY - touchRef.current.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) optionsRef.current.onNext();
      else optionsRef.current.onPrev();
    }

    function onWheel(event: WheelEvent) {
      if (!optionsRef.current.enabled) return;
      const target = event.target as Element;
      if (target.closest('.video-wrap.is-zoomed')) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 24) return;
      event.preventDefault();
      if (event.deltaX > 0) optionsRef.current.onNext();
      else optionsRef.current.onPrev();
    }

    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('wheel', onWheel);
    };
  }, [stageRef]);
}
