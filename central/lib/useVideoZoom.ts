'use client';

import { RefObject, useEffect } from 'react';

export function useVideoZoom(wrapRef: RefObject<HTMLDivElement | null>, onResetRef?: RefObject<(() => void) | null>) {
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const layer = wrap.querySelector('.video-zoom') as HTMLElement | null;
    const el = wrap;
    if (!layer) return;

    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let isPanning = false;

    function clampPan() {
      if (scale <= 1) {
        translateX = 0;
        translateY = 0;
        return;
      }
      const maxX = ((scale - 1) * el.clientWidth) / 2;
      const maxY = ((scale - 1) * el.clientHeight) / 2;
      translateX = Math.min(maxX, Math.max(-maxX, translateX));
      translateY = Math.min(maxY, Math.max(-maxY, translateY));
    }

    function applyTransform() {
      clampPan();
      layer!.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      el.classList.toggle('is-zoomed', scale > 1.01);
    }

    function resetZoom() {
      scale = 1;
      translateX = 0;
      translateY = 0;
      applyTransform();
    }

    if (onResetRef) onResetRef.current = resetZoom;

    function zoomAt(clientX: number, clientY: number, factor: number) {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left - rect.width / 2;
      const y = clientY - rect.top - rect.height / 2;
      const newScale = Math.min(5, Math.max(1, scale * factor));
      if (newScale === scale) return;
      const ratio = newScale / scale;
      translateX = x - (x - translateX) * ratio;
      translateY = y - (y - translateY) * ratio;
      scale = newScale;
      applyTransform();
    }

    function touchDistance(touches: TouchList) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    }

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(event.clientX, event.clientY, factor);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length === 2) {
        pinchStartDistance = touchDistance(event.touches);
        pinchStartScale = scale;
        isPanning = false;
        event.preventDefault();
      } else if (event.touches.length === 1 && scale > 1) {
        isPanning = true;
        panStartX = event.touches[0].clientX;
        panStartY = event.touches[0].clientY;
        panOriginX = translateX;
        panOriginY = translateY;
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (event.touches.length === 2) {
        event.preventDefault();
        const distance = touchDistance(event.touches);
        scale = Math.min(5, Math.max(1, pinchStartScale * (distance / pinchStartDistance)));
        applyTransform();
      } else if (event.touches.length === 1 && isPanning && scale > 1) {
        event.preventDefault();
        translateX = panOriginX + (event.touches[0].clientX - panStartX);
        translateY = panOriginY + (event.touches[0].clientY - panStartY);
        applyTransform();
      }
    }

    function onTouchEnd() {
      if (scale <= 1.01) resetZoom();
      isPanning = false;
    }

    function onMouseDown(event: MouseEvent) {
      if (scale <= 1 || event.button !== 0) return;
      isPanning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      panOriginX = translateX;
      panOriginY = translateY;
      el.classList.add('is-panning');
      event.preventDefault();
    }

    function onMouseMove(event: MouseEvent) {
      if (!isPanning || scale <= 1) return;
      translateX = panOriginX + (event.clientX - panStartX);
      translateY = panOriginY + (event.clientY - panStartY);
      applyTransform();
    }

    function onMouseUp() {
      isPanning = false;
      el.classList.remove('is-panning');
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      if (onResetRef) onResetRef.current = null;
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [wrapRef, onResetRef]);
}

export function isZoomed(wrap: HTMLElement | null): boolean {
  return Boolean(wrap?.classList.contains('is-zoomed'));
}
