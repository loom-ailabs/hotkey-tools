import Image from "next/image";
import { Button } from "@hotkey-tools/ui";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";

export type SignInPageProps = {
  googleSignInUrl: string;
  githubSignInUrl: string;
};

export function SignInPage({ googleSignInUrl, githubSignInUrl }: SignInPageProps) {
  return (
    <div className="flex min-h-screen flex-col px-5 sm:px-8">
      <header className="mx-auto flex h-20 w-full max-w-5xl items-center justify-between gap-4 border-b">
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
        <Button asChild variant="ghost" className="h-9 px-3">
          <a href="https://www.loom-labs.ai/workspace">
            <ArrowLeft aria-hidden="true" />
            返回工作区
          </a>
        </Button>
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 py-12 lg:grid-cols-2 lg:gap-20 lg:py-20">
        <div className="max-w-lg space-y-6">
          <p className="text-xs font-medium tracking-widest text-link">LOOM ACCOUNT</p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            连接智能，
            <br />
            编织未来。
          </h1>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            让灵感与工具在同一个工作区相遇。
            <br />
            登录 Loom，继续你的下一次创造。
          </p>
          <p className="border-l border-border pl-4 text-xs leading-6 text-muted-foreground">
            Connecting Intelligence.
            <br />
            Crafting Tomorrow.
          </p>
        </div>
        <section
          aria-labelledby="sign-in-title"
          className="w-full max-w-sm border-t pt-8 lg:justify-self-end lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0"
        >
          <div className="mb-8 space-y-3">
            <h2 id="sign-in-title" className="text-2xl font-semibold tracking-tight">
              欢迎来到 Loom
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              使用已有账号继续。首次登录将创建你的 Loom 账号。
            </p>
          </div>
          <div className="space-y-3">
            <Button asChild variant="outline" className="h-9 w-full justify-between bg-control">
              <a href={googleSignInUrl}>
                使用 Google 继续
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="outline" className="h-9 w-full justify-between bg-control">
              <a href={githubSignInUrl}>
                使用 GitHub 继续
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
          </div>
          <p className="mt-6 flex items-start gap-2 text-xs leading-6 text-muted-foreground">
            <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
            请在 Google 或 GitHub 的官方页面完成授权，无需向 Loom 提供密码。
          </p>
        </section>
      </main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Loom AI</span>
        <span>Connecting Intelligence. Crafting Tomorrow.</span>
      </footer>
    </div>
  );
}
