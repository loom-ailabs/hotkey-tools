import { Button, Card, CardContent, CardDescription, CardHeader } from "@hotkey-tools/ui";
import { ArrowRight, Command, ShieldCheck } from "lucide-react";

export type SignInPageProps = {
  googleSignInUrl: string;
  githubSignInUrl: string;
};

export function SignInPage({ googleSignInUrl, githubSignInUrl }: SignInPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30 px-5 sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center py-7">
        <a
          href="/"
          className="flex items-center gap-2.5 rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Hotkey Tools 登录首页"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="size-5" aria-hidden="true" />
          </span>
          Hotkey Tools
        </a>
      </header>
      <main className="flex flex-1 items-center justify-center py-10 sm:py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 text-center">
            <p className="text-sm font-medium text-primary">欢迎回来</p>
            <h1 className="text-3xl leading-tight font-semibold tracking-tight">
              登录，继续你的工作。
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">
              使用已有账号安全登录，无需另设密码。
            </p>
          </div>
          <Card>
            <CardHeader className="pb-5 text-center">
              <h2 className="text-base font-semibold">选择登录方式</h2>
              <CardDescription>首次使用将自动创建 Hotkey Tools 账号。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" size="lg" className="w-full justify-between">
                <a href={googleSignInUrl}>
                  使用 Google 继续
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full justify-between">
                <a href={githubSignInUrl}>
                  使用 GitHub 继续
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            </CardContent>
          </Card>
          <p className="flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            通过官方授权页面登录，密码不会交给 Hotkey Tools。
          </p>
        </div>
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Hotkey Tools
      </footer>
    </div>
  );
}
