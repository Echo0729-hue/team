"use client";

// Adapted from React Bits AnimatedContent by David Haz.
// https://reactbits.dev/animations/animated-content
// License: third-party/react-bits.LICENSE.md
import { useEffect, useRef, type HTMLAttributes } from "react";
import "./react-bits.css";

/** A brief transition for the workspace heading, without remounting the editor/player. */
export default function AnimatedContent({
  active = true, children, className = "", ...props
}: HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !active || typeof element.animate !== "function") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    const animation = element.animate([
      { opacity: 0.72, transform: "translateY(6px)", filter: "blur(2px)" },
      { opacity: 1, transform: "none", filter: "none" },
    ], { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    const cancel = () => animation.cancel();
    const onVisibility = () => { if (document.hidden) cancel(); };
    reduce.addEventListener("change", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancel();
      reduce.removeEventListener("change", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  return <div {...props} ref={ref} className={`rb-animated-content ${className}`}>{children}</div>;
}
