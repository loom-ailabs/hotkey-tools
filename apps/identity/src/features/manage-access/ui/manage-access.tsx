"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@hotkey-tools/ui";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Info,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Settings2,
  UserRound,
} from "lucide-react";
import { useManageAccess } from "../model/use-manage-access";

const benefits = ["购买记录关联当前账号", "付款确认后自动开通", "重新登录后继续使用"];

export function ManageAccess() {
  const state = useManageAccess();
  const user = state.profile?.user;
  const disabled = state.loading || state.action !== null || state.configurationMissing;

  return (
    <section aria-labelledby="access-title" className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 id="access-title" className="text-sm font-medium text-muted-foreground">
          账号概览
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={state.refresh}
          disabled={state.refreshing || state.loading || state.action !== null}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(state.refreshing && "motion-safe:animate-spin")}
          />
          {state.refreshing ? "刷新中…" : "刷新状态"}
        </Button>
      </div>

      <div className="space-y-3" aria-live="polite">
        {state.failure && (
          <Alert variant={state.configurationMissing ? "warning" : "destructive"}>
            {state.configurationMissing ? (
              <Settings2 aria-hidden="true" />
            ) : (
              <CircleAlert aria-hidden="true" />
            )}
            <div className="min-w-0">
              <AlertTitle>
                {state.configurationMissing ? "服务尚未配置完成" : "暂时未能完成操作"}
              </AlertTitle>
              <AlertDescription>
                <p className="break-words">{state.failure.message}</p>
                <p>
                  {state.configurationMissing
                    ? "完成服务配置后，点击刷新状态即可继续。"
                    : "可以点击刷新状态重试；付款确认不会因关闭页面而中断。"}
                </p>
              </AlertDescription>
            </div>
          </Alert>
        )}
        {state.notice && (
          <Alert role="status">
            <Info aria-hidden="true" />
            <p className="leading-relaxed">{state.notice}</p>
          </Alert>
        )}
        {state.featureResult && (
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden="true" />
            <p className="leading-relaxed">{state.featureResult}</p>
          </Alert>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card aria-labelledby="account-title">
          <CardHeader>
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <Badge variant={user ? "success" : "outline"}>
                {state.loading ? "读取中" : user ? "已登录" : "未登录"}
              </Badge>
            </div>
            <CardTitle id="account-title">
              {state.loading ? "正在读取账号…" : (user?.name ?? (user ? "欢迎回来" : "从登录开始"))}
            </CardTitle>
            <CardDescription className="break-words">
              {user
                ? (user.email ?? "你已登录，购买记录将保存在此账号下。")
                : "使用 Google 或 GitHub 账号登录，无需设置新密码。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">使用权限跟随账号</p>
              <p>在其他设备登录同一个账号，也能继续使用已解锁的功能。</p>
            </div>
          </CardContent>
          <CardFooter className="min-h-19">
            {user ? (
              <>
                <span className="mr-auto flex items-center gap-2 text-sm text-success">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  账号已连接
                </span>
                <form action="/api/auth/logout" method="post">
                  <Button type="submit" variant="ghost" size="sm">
                    <LogOut aria-hidden="true" />
                    退出登录
                  </Button>
                </form>
              </>
            ) : state.loading || state.configurationMissing ? (
              <Button className="w-full" disabled>
                {state.loading && (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                )}
                {state.loading ? "读取账号中…" : "配置完成后即可登录"}
              </Button>
            ) : (
              <Button asChild className="w-full">
                <a href="/api/auth/login?destination=checkout">
                  登录 / 创建账号
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card aria-labelledby="product-title" className={cn(state.premium && "border-success/30")}>
          <CardHeader>
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <LockKeyhole className="size-5" aria-hidden="true" />
              </span>
              <Badge variant={state.premium ? "success" : "secondary"}>
                {state.premium ? "已解锁" : "单次购买"}
              </Badge>
            </div>
            <CardTitle id="product-title">高级功能</CardTitle>
            <CardDescription>
              {state.premium
                ? "使用权限已开通，现在可以体验已解锁功能。"
                : "完成一次测试付款，体验购买到解锁的完整流程。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2.5">
                  <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                  {benefit}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <div className="w-full space-y-3">
              <Button
                className="w-full"
                onClick={state.premium ? state.usePremium : state.purchase}
                disabled={disabled}
              >
                {state.action ? (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                ) : state.premium ? (
                  <CircleCheck aria-hidden="true" />
                ) : (
                  <CreditCard aria-hidden="true" />
                )}
                {state.action
                  ? "请稍候…"
                  : state.premium
                    ? "使用已解锁功能"
                    : user
                      ? "前往测试收银台"
                      : "登录并解锁"}
                {!state.action && <ArrowRight aria-hidden="true" />}
              </Button>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                测试付款不会真实扣款，金额以收银台为准。
              </p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
