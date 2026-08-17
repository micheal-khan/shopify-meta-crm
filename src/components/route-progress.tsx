"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type ProgressState = {
  visible: boolean;
  value: number;
};

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const startedFromRoute = useRef<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ visible: false, value: 0 });

  useEffect(() => {
    function beginNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      if (destination.origin !== current.origin) return;
      if (destination.pathname === current.pathname && destination.search === current.search) return;

      startedFromRoute.current = `${current.pathname}?${current.searchParams.toString()}`;
      setProgress({ visible: true, value: 10 });
    }

    document.addEventListener("click", beginNavigation, true);
    return () => document.removeEventListener("click", beginNavigation, true);
  }, []);

  useEffect(() => {
    if (!progress.visible || startedFromRoute.current === null || startedFromRoute.current === routeKey) return;
    startedFromRoute.current = null;
    setProgress({ visible: true, value: 100 });
    const completionTimer = window.setTimeout(() => setProgress({ visible: false, value: 0 }), 220);
    return () => window.clearTimeout(completionTimer);
  }, [progress.visible, routeKey]);

  useEffect(() => {
    if (!progress.visible) return;
    const movementTimer = window.setInterval(() => {
      setProgress((current) => ({
        visible: true,
        value: current.value >= 100 ? 100 : Math.min(92, current.value + Math.max(1, (92 - current.value) * 0.14)),
      }));
    }, 300);
    const safetyTimer = window.setTimeout(() => {
      startedFromRoute.current = null;
      setProgress({ visible: false, value: 0 });
    }, 15_000);
    return () => {
      window.clearInterval(movementTimer);
      window.clearTimeout(safetyTimer);
    };
  }, [progress.visible]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden transition-opacity duration-200 ${progress.visible ? "opacity-100" : "opacity-0"}`}
    >
      <div
        className="h-full bg-primary shadow-[0_0_12px_1px] shadow-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${progress.value}%` }}
      />
    </div>
  );
}
