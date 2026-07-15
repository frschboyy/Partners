import { useRef, useState, useCallback, useEffect } from 'react';
import { useMotionValue, useTransform, animate } from 'framer-motion';

const DIRECTION_LOCK_PX = 10;
const COMMIT_DISTANCE_RATIO = 0.35;
const COMMIT_VELOCITY = 0.55; // px/ms
const RELEASE_TRANSITION = { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.3 };
const CANCEL_TRANSITION = { type: 'spring', stiffness: 500, damping: 40, mass: 0.5 };
const SAMPLE_WINDOW = 6;

const defaultIsBlocked = (e) => !!e.target?.closest?.('[data-no-swipe-nav]');

// Drives a page-push transition that tracks the finger 1:1 while dragging,
// then resolves to a commit/cancel animation only once the finger lifts.
export function useInteractiveSwipe({ order, activeId, onChange, isBlocked = defaultIsBlocked }) {
  const dragX = useMotionValue(0);
  const [pending, setPending] = useState(null); // { id, direction: 1 | -1 }

  const containerRef = useRef(null);
  const widthRef = useRef(0);
  const startX = useRef(null);
  const startY = useRef(null);
  const locked = useRef(false);
  const blocked = useRef(false);
  const samples = useRef([]);
  const directionRef = useRef(0);
  const pendingRef = useRef(null);
  const activeIndexRef = useRef(order.indexOf(activeId));
  activeIndexRef.current = order.indexOf(activeId);

  const neighborX = useTransform(dragX, (v) => v + directionRef.current * widthRef.current);

  // Only safe to collapse the neighbor slot back into "current" once the parent's
  // activeId actually reflects the committed tab — resetting dragX any earlier could
  // land a render before the parent's update commits, flashing the old tab back in.
  useEffect(() => {
    if (pendingRef.current && pendingRef.current.id === activeId) {
      dragX.set(0);
      setPendingState(null);
    }
  }, [activeId]);

  function setPendingState(next) {
    pendingRef.current = next;
    setPending(next);
  }

  function reset() {
    startX.current = null;
    startY.current = null;
    locked.current = false;
    samples.current = [];
  }

  const onTouchStart = useCallback((e) => {
    blocked.current = isBlocked(e);
    if (blocked.current) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = false;
    samples.current = [{ t: e.timeStamp, x: e.touches[0].clientX }];
    widthRef.current = containerRef.current?.clientWidth || window.innerWidth;
  }, [isBlocked]);

  const onTouchMove = useCallback((e) => {
    if (blocked.current || startX.current === null) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const dx = x - startX.current;
    const dy = y - startY.current;

    if (!locked.current) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        blocked.current = true;
        return;
      }
      locked.current = true;
    }

    samples.current.push({ t: e.timeStamp, x });
    if (samples.current.length > SAMPLE_WINDOW) samples.current.shift();

    const dir = dx < 0 ? 1 : -1;
    const targetIdx = activeIndexRef.current + dir;
    if (targetIdx < 0 || targetIdx >= order.length) {
      dragX.set(0);
      return;
    }

    const neighborId = order[targetIdx];
    directionRef.current = dir;
    if (pendingRef.current?.id !== neighborId) setPendingState({ id: neighborId, direction: dir });
    dragX.set(dx);
  }, [order]);

  const onTouchEnd = useCallback(() => {
    if (blocked.current || startX.current === null || !locked.current) {
      reset();
      return;
    }

    const dx = dragX.get();
    const width = widthRef.current || 1;
    const first = samples.current[0];
    const last = samples.current[samples.current.length - 1];
    const velocity = last && first && last.t !== first.t ? (last.x - first.x) / (last.t - first.t) : 0;

    const dir = dx < 0 ? 1 : -1;
    const distanceRatio = Math.abs(dx) / width;
    const passedDistance = distanceRatio > COMMIT_DISTANCE_RATIO;
    const passedVelocity = Math.abs(velocity) > COMMIT_VELOCITY && Math.sign(velocity) === dir;
    const shouldCommit = !!pendingRef.current && (passedDistance || passedVelocity);

    if (shouldCommit) {
      const targetId = pendingRef.current.id;
      const target = dir === 1 ? -width : width;
      animate(dragX, target, {
        ...RELEASE_TRANSITION,
        onComplete: () => onChange(targetId),
      });
    } else {
      animate(dragX, 0, {
        ...CANCEL_TRANSITION,
        onComplete: () => setPendingState(null),
      });
    }

    reset();
  }, [order, onChange]);

  // Animates a push transition programmatically (e.g. a tab-bar tap) using
  // the same commit animation as a completed drag, without any manual input.
  const pushTo = useCallback((id) => {
    if (id === activeId) return;
    const targetIdx = order.indexOf(id);
    if (targetIdx === -1) {
      onChange(id);
      return;
    }
    const dir = targetIdx > activeIndexRef.current ? 1 : -1;
    widthRef.current = containerRef.current?.clientWidth || window.innerWidth;
    directionRef.current = dir;
    setPendingState({ id, direction: dir });
    dragX.set(0);
    const target = dir === 1 ? -widthRef.current : widthRef.current;
    animate(dragX, target, {
      ...RELEASE_TRANSITION,
      onComplete: () => onChange(id),
    });
  }, [order, activeId, onChange]);

  return {
    containerRef,
    dragX,
    neighborX,
    pending,
    pushTo,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
