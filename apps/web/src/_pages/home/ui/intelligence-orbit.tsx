import Image from "next/image";
import { Braces, Globe2, Monitor } from "lucide-react";

export function IntelligenceOrbit() {
  return (
    <div
      className="relative mx-auto flex aspect-square w-full max-w-md items-center justify-center"
      aria-label="Loom 多端协作愿景示意图"
    >
      <svg
        className="absolute inset-0 size-full text-link"
        viewBox="0 0 400 400"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="orbit-glow">
            <stop stopColor="currentColor" stopOpacity=".12" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="190" fill="url(#orbit-glow)" />
        <circle
          cx="200"
          cy="200"
          r="144"
          stroke="currentColor"
          strokeOpacity=".12"
          strokeDasharray="3 7"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="174"
          ry="68"
          transform="rotate(-35 200 200)"
          stroke="currentColor"
          strokeOpacity=".4"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="174"
          ry="68"
          transform="rotate(35 200 200)"
          stroke="currentColor"
          strokeOpacity=".2"
        />
        <ellipse cx="200" cy="200" rx="68" ry="174" stroke="currentColor" strokeOpacity=".13" />
        <path
          d="M72 111L200 200L329 293M200 200L313 101"
          stroke="currentColor"
          strokeOpacity=".18"
          strokeDasharray="3 6"
        />
        <circle cx="72" cy="111" r="4" fill="currentColor" />
        <circle cx="329" cy="293" r="4" fill="currentColor" />
        <circle cx="313" cy="101" r="3" fill="currentColor" />
        <circle cx="157" cy="338" r="2" fill="currentColor" fillOpacity=".5" />
        <circle cx="98" cy="285" r="2" fill="currentColor" fillOpacity=".4" />
      </svg>
      <div className="z-10 rounded-2xl border border-link/30 bg-surface p-4 shadow-2xl shadow-primary/10">
        <Image
          src="/loom.png"
          alt="Loom AI 环织精灵"
          width={64}
          height={64}
          className="size-16 rounded-xl opacity-90"
          unoptimized
        />
      </div>
      <div className="absolute top-16 left-0 flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs text-muted-foreground">
        <Monitor className="size-4 text-link" />
        桌面
      </div>
      <div className="absolute top-16 right-0 flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs text-muted-foreground">
        <Globe2 className="size-4 text-link" />
        浏览器
      </div>
      <div className="absolute right-0 bottom-20 flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs text-muted-foreground">
        <Braces className="size-4 text-link" />
        编辑器
      </div>
      <span className="absolute bottom-4 font-mono text-xs tracking-widest text-muted-foreground">
        ONE CONNECTED EXPERIENCE
      </span>
    </div>
  );
}
