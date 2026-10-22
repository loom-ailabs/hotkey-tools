import { Badge } from "@hotkey-tools/ui";
import { Command, FlaskConical, ShieldCheck } from "lucide-react";
import { ManageAccess } from "@/features/manage-access";

export function IdentityPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 sm:px-8">
      <header className="flex h-20 items-center justify-between gap-4 border-b">
        <a
          href="/"
          className="flex items-center gap-2.5 rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Hotkey Tools 账户中心首页"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="size-5" aria-hidden="true" />
          </span>
          Hotkey Tools
        </a>
        <Badge variant="warning">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          Sandbox 测试环境
        </Badge>
      </header>
      <main className="flex-1 space-y-10 py-10 sm:py-14">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm font-medium text-primary">账户中心</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            一个账号，工具随时可用。
          </h1>
          <p className="text-sm leading-7 text-muted-foreground sm:text-base">
            登录账号，查看和解锁你的使用权限。购买完成后，随时回来都能继续使用。
          </p>
        </div>
        <ManageAccess />
        <p className="flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          安全登录 · 托管收银台 · 使用权限随账号保存
        </p>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Hotkey Tools</span>
        <span>少一点操作，多一点专注。</span>
      </footer>
    </div>
  );
}
