import { Button, cn } from "@hotkey-tools/ui";
import {
  ArrowRight,
  Check,
  CircleDot,
  Command,
  CornerDownLeft,
  FileText,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { useProductAccess } from "../model/use-product-access";

type Access = ReturnType<typeof useProductAccess>;
export function ProductWorkspace({ access }: { access: Access }) {
  const premium = access.profile?.entitlements.premium ?? false;
  return (
    <section id="workspace" className="py-20 sm:py-28">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-3 font-mono text-xs tracking-widest text-link">01 / THE WORKSPACE</p>
          <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
            从一个想法，开始连接。
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          一个小小的产品演示，体验从登录、解锁到使用的完整旅程。
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-surface shadow-2xl shadow-background/30">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4 text-xs">
          <span className="flex items-center gap-2 font-medium">
            <Command className="size-4 text-link" /> Loom 工作区
          </span>
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-link" />
            交互演示
          </span>
        </div>
        <div className="grid md:grid-cols-4">
          <aside className="hidden border-r bg-background/40 p-4 md:block">
            <p className="px-3 pb-4 text-xs text-muted-foreground">个人空间</p>
            <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-link">
              <Sparkles className="size-4" />
              灵感工作台
            </div>
            <div className="mt-2 flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <FileText className="size-4" />
              示例计划
            </div>
            <div className="mt-24 border-t px-3 pt-4 text-xs leading-6 text-muted-foreground">
              Connecting intelligence.
              <br />
              Crafting tomorrow.
            </div>
          </aside>
          <div className="p-6 sm:p-10 md:col-span-3">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleDot className="size-3.5 text-link" />
                {access.loading
                  ? "正在同步账号…"
                  : premium
                    ? "Loom Pro 已解锁"
                    : access.profile?.user
                      ? "已登录 · 免费探索"
                      : "访客 · 免费探索"}
              </div>
              <div className="flex items-center gap-3">
                {access.profile?.user && (
                  <form action="/api/auth/logout" method="post">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      type="submit"
                    >
                      <LogOut className="size-3" />
                      退出登录
                    </button>
                  </form>
                )}
                <button
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  disabled={access.loading}
                  onClick={() => void access.refresh()}
                >
                  <RefreshCw
                    className={cn(
                      "size-3",
                      access.loading && "animate-spin motion-reduce:animate-none",
                    )}
                  />
                  刷新权益
                </button>
              </div>
            </div>
            <h3 className="text-xl font-medium">把灵感，织成下一步。</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              从浏览器里的发现，到编辑器里的实现，让上下文在你的工作中自然延续。
            </p>
            <div className="mt-6 rounded-lg border bg-background p-4 text-sm leading-7 text-foreground/80">
              为一个 AI 创意工具，制定从想法到第一版的工作计划。
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>预置示例 · 不调用真实 AI 模型</span>
                <CornerDownLeft className="size-3.5" />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {premium ? (
                <Button
                  disabled={access.running || access.loading}
                  onClick={() => void access.run()}
                >
                  <Sparkles />
                  {access.running ? "正在验证权限…" : "运行 Pro 演示"}
                  <ArrowRight />
                </Button>
              ) : (
                <Button asChild>
                  <a
                    href={access.profile?.user ? "https://checkout.loom-labs.ai" : access.loginUrl}
                  >
                    {access.profile?.user ? "解锁 Loom Pro" : "登录，开启体验"}
                    <ArrowRight />
                  </a>
                </Button>
              )}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="size-3" />
                {premium ? "每次运行均校验当前权益" : "Pro 演示需要一次性解锁"}
              </span>
            </div>
            {access.error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {access.error}
              </p>
            )}
            {access.unlocked && (
              <div className="mt-6 border-t pt-6" role="status">
                <p className="mb-4 text-xs font-medium text-link">权限验证通过 · 预置示例计划</p>
                <ol className="space-y-3">
                  {[
                    "明确问题：梳理目标用户、使用场景和第一项核心能力。",
                    "连接上下文：整理浏览器发现与编辑器中的原型。",
                    "完成第一版：验证核心操作，邀请反馈并持续迭代。",
                  ].map((step) => (
                    <li key={step} className="flex gap-3 text-sm leading-6">
                      <Check className="mt-1 size-4 shrink-0 text-link" />
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-xs leading-6 text-muted-foreground">
                  本次仅展示固定示例内容，不会创建文件、调用模型或执行外部操作。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
