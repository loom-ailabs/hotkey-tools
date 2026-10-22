"use client";

import Image from "next/image";
import { Button } from "@hotkey-tools/ui";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Braces,
  Check,
  ChevronRight,
  Command,
  Globe2,
  Layers3,
  Monitor,
  Orbit,
  Sparkles,
} from "lucide-react";
import { IntelligenceOrbit } from "./intelligence-orbit";
import { ProductWorkspace, useProductAccess } from "@/features/product-workspace";

const capabilities = [
  {
    number: "01",
    icon: Monitor,
    title: "灵感，不止于一个窗口。",
    body: "从桌面的专注工作，到浏览器里的偶然发现，让智能进入你已经熟悉的日常。",
    label: "ACROSS YOUR TOOLS",
  },
  {
    number: "02",
    icon: Layers3,
    title: "让上下文，自然延续。",
    body: "把零散的信息织成有用的线索。少一些来回切换，多一些连续思考。",
    label: "CONTEXT THAT CONNECTS",
  },
  {
    number: "03",
    icon: Sparkles,
    title: "从想法，走向下一步。",
    body: "让人和智能协作，把模糊的灵感，逐步变成清晰、可行动的计划。",
    label: "FROM THOUGHT TO ACTION",
  },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="/"
      className="inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Loom AI 首页"
    >
      <Image
        src="/loom-mark.svg"
        alt=""
        width={36}
        height={36}
        className="size-9 opacity-85 invert"
        unoptimized
      />
      <span className="text-lg font-semibold tracking-tight">
        Loom<span className="ml-1 font-normal text-muted-foreground">AI</span>
      </span>
      {!compact && (
        <span className="ml-1 hidden rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
          LABS
        </span>
      )}
    </a>
  );
}

type ProductView = "home" | "vision" | "workspace" | "pricing";

export function HomePage({ view = "home" }: { view?: ProductView }) {
  const access = useProductAccess();
  const premium = access.profile?.entitlements.premium ?? false;
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-lg">
        <nav
          className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-6 lg:px-10"
          aria-label="主导航"
        >
          <Brand />
          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="/vision">
              我们的愿景
            </a>
            <a className="transition-colors hover:text-foreground" href="/workspace">
              工作区
            </a>
            <a className="transition-colors hover:text-foreground" href="/pricing">
              体验方案
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
              href={access.profile?.user ? "/workspace" : access.loginUrl}
            >
              {access.loading
                ? "同步中…"
                : access.profile?.user
                  ? premium
                    ? "Loom Pro"
                    : "我的账号"
                  : "登录"}
            </a>
            <Button asChild size="sm" variant="outline">
              <a href="/workspace">
                进入工作区
                <ArrowUpRight />
              </a>
            </Button>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 lg:px-10">
        {view !== "home" && (
          <h1 className="sr-only">
            {view === "workspace" ? "Loom 工作区" : view === "vision" ? "我们的愿景" : "体验方案"}
          </h1>
        )}
        {view === "home" && (
          <>
            <section className="grid items-center gap-8 pt-16 pb-16 lg:grid-cols-5 lg:pt-24 lg:pb-24">
              <div className="lg:col-span-3">
                <div className="mb-7 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-link" />
                  为人与智能协作而构建
                  <ChevronRight className="size-3" />
                </div>
                <h1 className="text-4xl leading-tight font-medium tracking-tight sm:text-6xl lg:text-7xl">
                  连接智能，
                  <br />
                  <span className="text-link">织就你的下一步。</span>
                </h1>
                <p className="mt-7 max-w-lg text-base leading-8 text-muted-foreground sm:text-lg">
                  让桌面、浏览器与编辑器里的灵感，在同一个工作区延续。Loom AI
                  希望成为与你一起思考、一起创造的智能伙伴。
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Button asChild size="lg">
                    <a href="/workspace">
                      探索 Loom AI
                      <ArrowRight />
                    </a>
                  </Button>
                  <a
                    href="/vision"
                    className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    了解我们的愿景
                    <ArrowRight className="size-4" />
                  </a>
                </div>
                <p className="mt-6 font-mono text-xs tracking-wide text-muted-foreground">
                  CONNECTING INTELLIGENCE. CRAFTING TOMORROW.
                </p>
              </div>
              <div className="lg:col-span-2">
                <IntelligenceOrbit />
              </div>
            </section>
            <div className="flex flex-wrap items-center justify-between gap-5 border-y py-5 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <Orbit className="size-4 text-link" />
                一个共同的愿景，一段连续的体验。
              </p>
              <div className="flex items-center gap-5 font-mono">
                <span className="flex items-center gap-2">
                  <Monitor className="size-3.5" />
                  DESKTOP
                </span>
                <span className="flex items-center gap-2">
                  <Globe2 className="size-3.5" />
                  BROWSER
                </span>
                <span className="flex items-center gap-2">
                  <Braces className="size-3.5" />
                  EDITOR
                </span>
              </div>
            </div>
          </>
        )}
        {(view === "home" || view === "vision") && (
          <section id="vision" className="scroll-mt-24 pt-20 sm:pt-28">
            <p className="mb-4 font-mono text-xs tracking-widest text-link">
              BUILT AROUND YOUR FLOW
            </p>
            <h2 className="max-w-3xl text-3xl leading-snug font-medium tracking-tight sm:text-4xl">
              工具各有所长，
              <br />
              <span className="text-muted-foreground">你的思考不该被它们分开。</span>
            </h2>
            <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-0">
              {capabilities.map(({ number, icon: Icon, title, body, label }) => (
                <article key={number} className="border-t pt-7 md:px-7 md:first:pl-0 md:last:pr-0">
                  <div className="mb-6 flex items-center justify-between">
                    <Icon className="size-6 text-link" />
                    <span className="font-mono text-xs text-muted-foreground">{number}</span>
                  </div>
                  <h3 className="text-lg font-medium tracking-tight">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
                  <p className="mt-6 font-mono text-xs tracking-wide text-muted-foreground/70">
                    {label}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
        {(view === "home" || view === "workspace") && <ProductWorkspace access={access} />}
        {(view === "home" || view === "pricing") && (
          <section id="pricing" className="scroll-mt-24 border-t py-20 sm:py-28">
            <div className="grid gap-10 lg:grid-cols-3">
              <div>
                <p className="mb-3 font-mono text-xs tracking-widest text-link">
                  02 / START EXPLORING
                </p>
                <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
                  先体验，再连接
                  <br />
                  更多可能。
                </h2>
                <p className="mt-5 max-w-xs text-sm leading-7 text-muted-foreground">
                  这是 Loom AI 的产品演示。登录与付费流程真实可用，工作计划使用预置示例。
                </p>
                <p className="mt-4 text-xs leading-6 text-muted-foreground">
                  当前仅限 Sandbox 测试，不会产生真实扣款。
                </p>
              </div>
              <div className="rounded-xl border bg-surface p-7">
                <Box className="size-5 text-muted-foreground" />
                <h3 className="mt-5 text-lg font-medium">Loom Explore</h3>
                <p className="mt-2 text-sm text-muted-foreground">从认识你的新伙伴开始。</p>
                <p className="mt-7 text-4xl tracking-tight">免费</p>
                <ul className="my-7 space-y-3 text-sm text-muted-foreground">
                  {[
                    "探索产品愿景与工作区",
                    "使用 Google 或 GitHub 登录",
                    "在熟悉的工具之间想象新连接",
                  ].map((x) => (
                    <li key={x} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0" />
                      {x}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="w-full">
                  <a href="/workspace">
                    开始探索
                    <ArrowRight />
                  </a>
                </Button>
              </div>
              <div className="relative rounded-xl border border-link/40 bg-surface p-7">
                <div className="flex items-center justify-between">
                  <Command className="size-5 text-link" />
                  <span className="rounded border border-link/30 bg-primary/10 px-2 py-1 text-xs text-link">
                    Sandbox
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-medium">Loom Pro</h3>
                <p className="mt-2 text-sm text-muted-foreground">亲手体验，从解锁到使用。</p>
                <p className="mt-7 text-4xl tracking-tight">
                  $1<span className="ml-2 text-xs text-muted-foreground">USD · 一次性测试付款</span>
                </p>
                <ul className="my-7 space-y-3 text-sm text-muted-foreground">
                  {[
                    "解锁 Pro 工作计划演示",
                    "同一账号重新登录后继续体验",
                    "一次性购买，无订阅或自动续费",
                  ].map((x) => (
                    <li key={x} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-link" />
                      {x}
                    </li>
                  ))}
                </ul>
                <Button asChild className="w-full">
                  <a
                    href={
                      premium
                        ? "/workspace"
                        : access.profile?.user
                          ? "https://checkout.loom-labs.ai"
                          : access.loginUrl
                    }
                  >
                    {premium ? "打开 Pro 演示" : access.profile?.user ? "前往解锁" : "登录后解锁"}
                    <ArrowRight />
                  </a>
                </Button>
              </div>
            </div>
          </section>
        )}
        {view === "home" && (
          <section className="border-t py-16 text-center sm:py-24">
            <p className="mb-5 font-mono text-xs tracking-widest text-link">
              THE NEXT THREAD STARTS WITH YOU
            </p>
            <h2 className="text-3xl font-medium tracking-tight sm:text-5xl">
              下一段创造，从这里开始。
            </h2>
            <Button asChild size="lg" className="mt-8">
              <a href="/workspace">
                进入 Loom 工作区
                <ArrowUpRight />
              </a>
            </Button>
          </section>
        )}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-8 lg:px-10">
          <Brand compact />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Loom AI · 连接智能，织就未来。
          </p>
          <a href="/pricing" className="text-xs text-muted-foreground hover:text-foreground">
            产品演示 · Sandbox
          </a>
        </div>
      </footer>
    </div>
  );
}
