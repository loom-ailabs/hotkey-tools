import Image from "next/image";
import { Badge } from "@hotkey-tools/ui";
import { ArrowUpRight, FlaskConical, ShieldCheck } from "lucide-react";
import { ManageAccess } from "@/features/manage-access";

export function IdentityPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 sm:px-8">
      <header className="flex h-20 items-center justify-between gap-4 border-b">
        <a
          href="https://www.loom-labs.ai/"
          className="flex items-center gap-2.5 rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Loom AI 首页"
        >
          <Image
            src="/loom-mark.svg"
            alt=""
            width={36}
            height={36}
            className="size-9 opacity-85 invert"
            unoptimized
            priority
          />
          Loom AI
        </a>
        <Badge variant="warning">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          Sandbox
        </Badge>
      </header>
      <main className="flex-1 space-y-10 py-10 sm:py-14">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-medium tracking-widest text-link">LOOM ACCOUNT</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            你的账号与访问权限。
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">
            管理 Loom 账号，体验从购买到解锁的完整流程。
            <br />
            当前为测试环境，不会产生真实扣款。
          </p>
        </div>
        <ManageAccess />
        <p className="flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          安全登录 · 托管收银台 · 使用权限随账号保存
        </p>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Loom AI</span>
        <a
          href="https://www.loom-labs.ai/workspace"
          className="inline-flex h-9 items-center gap-1.5 rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          返回 Loom 工作区
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
