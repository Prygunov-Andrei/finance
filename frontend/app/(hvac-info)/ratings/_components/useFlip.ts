'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

type Key = string | number;

export function useFlip(orderKey: string) {
  const nodesRef = useRef<Map<Key, HTMLElement>>(new Map());
  const prevRectsRef = useRef<Map<Key, number>>(new Map());

  const register = useCallback((key: Key, el: HTMLElement | null) => {
    if (el) nodesRef.current.set(key, el);
    else nodesRef.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    const current = new Map<Key, number>();
    nodesRef.current.forEach((el, k) => {
      current.set(k, el.getBoundingClientRect().top);
    });
    const prev = prevRectsRef.current;
    nodesRef.current.forEach((el, k) => {
      const newTop = current.get(k) ?? 0;
      const oldTop = prev.has(k) ? (prev.get(k) ?? newTop) : newTop;
      const dy = oldTop - newTop;
      if (Math.abs(dy) > 0.5) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        void el.getBoundingClientRect();
        el.style.transition = 'transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)';
        el.style.transform = 'translateY(0)';
      }
    });
    prevRectsRef.current = current;
  }, [orderKey]);

  return register;
}
