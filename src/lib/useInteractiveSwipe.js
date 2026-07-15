import { useRef, useState, useCallback, useEffect } from 'react';
import { useMotionValue, useTransform, animate } from 'framer-motion';

const AXIS_DECIDE_PX = 8;
const COMMIT_DISTANCE_RATIO = 0.35;
const COMMIT_VELOCITY = 0.55; // px/ms
const RELEASE_TRANSITION = { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.3 };
const CANCEL_TRANSITION = { type: 'spring', stiffness: 500, damping: 40, mass: 0.5 };
const SAMPLE_WINDOW = 6;

const defaultIsBlocked = (e) => !!e.target?.closest?.('[data-no-swipe-nav]');

// Drives a page-push transition that tracks the finger 1:1 while dragging,
// then resolves to a commit/cancel animation only once the finger lifts.
//
// Axis locking: the gesture stays undecided until either axis crosses
// AXIS_DECIDE_PX. Once it resolves to horizontal, the touch is locked to X for
// the rest of the gesture — vertical deltas are never read again, and
// preventDefault suppresses the browser's own vertical scroll so it can't
// fight the transform. If it resolves to vertical, we back off entirely and
// let the page scroll natively.
export function useInteractiveSwipe({ order, activeId, onChange, isBlocked = defaultIsBlocked }) {
  const dragX = useMotionValue(0);
  const [pending, setPending] = useState(null); // { id, direction: 1 | -1 }

  // A plain useRef here would silently never attach: this hook is typically
  // called before a component's loading/auth-gated early returns, so on the
  // first render the swipeable element doesn't exist yet. A callback ref +
  // state re-fires the attach effect exactly when the node actually mounts.
  const [containerEl, setContainerEl] = useState(null);
  const containerRef = useCallback((node) => setContainerEl(node), []);
  const widthRef = useRef(0);
  const startX = useRef(null);
  const startY = useRef(null);
  const axis = useRef(null); // null | 'x' | 'y'
  const blocked = useRef(false);
  const samples = useRef([]);
  const directionRef = useRef(0);
  const pendingRef = useRef(null);
  const activeIndexRef = useRef(order.indexOf(activeId));
  activeIndexRef.current = order.indexOf(activeId);

  const isBlockedRef = useRef(isBlocked);
  isBlockedRef.current = isBlocked;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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

  function resetGesture() {
    startX.current = null;
    startY.current = null;
    axis.current = null;
    samples.current = [];
  }

  const commitOrCancel = useCallback(() => {
    if (blocked.current || startX.current === null || axis.current !== 'x') {
      resetGesture();
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
        onComplete: () => onChangeRef.current(targetId),
      });
    } else {
      animate(dragX, 0, {
        ...CANCEL_TRANSITION,
        onComplete: () => setPendingState(null),
      });
    }

    resetGesture();
  }, [order]);

  useEffect(() => {
    const el = containerEl;
    if (!el) return;

    function onTouchStart(e) {
      blocked.current = isBlockedRef.current(e);
      if (blocked.current) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      axis.current = null;
      samples.current = [{ t: e.timeStamp, x: e.touches[0].clientX }];
      widthRef.current = el.clientWidth || window.innerWidth;
    }

    function onTouchMove(e) {
      if (blocked.current || startX.current === null) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - startX.current;
      const dy = y - startY.current;

      if (axis.current === null) {
        if (Math.abs(dx) < AXIS_DECIDE_PX && Math.abs(dy) < AXIS_DECIDE_PX) return;
        // Horizontal keeps a slight edge so a mostly-sideways finger path reads as a swipe.
        axis.current = Math.abs(dy) > Math.abs(dx) * 1.2 ? 'y' : 'x';
        if (axis.current === 'y') {
          blocked.current = true;
          return;
        }
      }

      if (axis.current !== 'x') return;

      // Locked to horizontal: stop the browser's native vertical scroll from
      // fighting the transform, and never read dy again for the rest of this gesture.
      e.preventDefault();

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
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', commitOrCancel, { passive: true });
    el.addEventListener('touchcancel', commitOrCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', commitOrCancel);
      el.removeEventListener('touchcancel', commitOrCancel);
    };
  }, [containerEl, order, commitOrCancel]);

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
    widthRef.current = containerEl?.clientWidth || window.innerWidth;
    directionRef.current = dir;
    setPendingState({ id, direction: dir });
    dragX.set(0);
    const target = dir === 1 ? -widthRef.current : widthRef.current;
    animate(dragX, target, {
      ...RELEASE_TRANSITION,
      onComplete: () => onChange(id),
    });
  }, [order, activeId, onChange, containerEl]);

  return {
    containerRef,
    dragX,
    neighborX,
    pending,
    pushTo,
  };
}
