"use client";

import { useEffect, useRef } from "react";
import { mountIntelligenceWeave } from "./weave-controller";

export function useIntelligenceWeave() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (rootRef.current && canvasRef.current)
      return mountIntelligenceWeave(rootRef.current, canvasRef.current);
  }, []);
  return { rootRef, canvasRef };
}
