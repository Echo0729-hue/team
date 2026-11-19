"use client";

// Adapted from React Bits SpotlightCard by David Haz.
// https://reactbits.dev/components/spotlight-card
// License: third-party/react-bits.LICENSE.md
import { createElement, useEffect, useRef, type HTMLAttributes, type PointerEvent } from "react";
import "./react-bits.css";

type SpotlightCardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "button";
  type?: "button";
  spotlightColor?: string;
  spotlightSize?: number;
};

/** Local, event-driven lighting; keeps the original element, semantics and handlers. */
export default function SpotlightCard({
  as = "div", children, className = "", spotlightColor = "rgba(15, 118, 110, 0.12)",
  spotlightSize = 240, onPointerMove, onPointerLeave, onPointerCancel, style, ...props
}: SpotlightCardProps) {
  const rootRef = useRef<HTMLElement>(null);
  const enabledRef = useRef(false);
  const frameRef = useRef(0);
  const pointRef = useRef({ x: 0, y: 0 });

  const clear = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    rootRef.current?.removeAttribute("data-spotlight-active");
  };

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const sync = () => {
      enabledRef.current = !reduce.matches && pointer.matches;
      if (!enabledRef.current) clear();
    };
    const onVisibility = () => { if (document.hidden) clear(); };
    sync();
    reduce.addEventListener("change", sync);
    pointer.addEventListener("change", sync);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      reduce.removeEventListener("change", sync);
      pointer.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", clear);
    };
  }, []);

  const move = (event: PointerEvent<HTMLElement>) => {
    onPointerMove?.(event);
    if (!enabledRef.current || event.pointerType === "touch") return;
    pointRef.current = { x: event.clientX, y: event.clientY };
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      root.style.setProperty("--rb-spotlight-x", `${pointRef.current.x - rect.left}px`);
      root.style.setProperty("--rb-spotlight-y", `${pointRef.current.y - rect.top}px`);
      root.setAttribute("data-spotlight-active", "true");
    });
  };

  return createElement(as, {
    ...props, ref: rootRef, className: `rb-spotlight ${className}`,
    style: { "--rb-spotlight-color": spotlightColor, "--rb-spotlight-size": `${spotlightSize}px`, ...style },
    onPointerMove: move,
    onPointerLeave: (event: PointerEvent<HTMLElement>) => { clear(); onPointerLeave?.(event); },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => { clear(); onPointerCancel?.(event); },
  }, children, <span className="rb-spotlight-light" aria-hidden="true" />);
}
