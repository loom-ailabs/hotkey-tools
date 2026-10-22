"use client";

import { Alert, AlertDescription, AlertTitle, Badge, Button, cn } from "@hotkey-tools/ui";
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
const workspaceUrl = "https://www.loom-labs.ai/workspace";

export function ManageAccess() {
  const state = useManageAccess();
  const user = state.profile?.user;
  const disabled = state.loading || state.action !== null || state.configurationMissing;

  return (
    <section aria-labelledby="access-title" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="access-title" className="text-sm font-medium text-muted-foreground">
          账号与使用权限
        </h2>
        <Button
          variant="outline"
          className="h-9 px-3"
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
        {state.featureResult && state.premium && (
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden="true" />
            <p className="leading-relaxed">{state.featureResult}</p>
          </Alert>
        )}
      </div>

      <div className="grid divide-y border-y md:grid-cols-2 md:divide-x md:divide-y-0">
        <section aria-labelledby="account-title" className="flex flex-col gap-6 py-8 md:pr-10">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="size-4" aria-hidden="true" />
              你的账号
            </span>
            <Badge variant={user ? "success" : "outline"}>
              {state.loading ? "读取中" : user ? "已登录" : "未登录"}
            </Badge>
          </div>
          <div className="space-y-3">
            <h3 id="account-title" className="break-words text-xl font-semibold tracking-tight">
              {state.loading ? "正在读取账号…" : (user?.name ?? (user ? "欢迎回来" : "从登录开始"))}
            </h3>
            <p className="break-words text-sm leading-6 text-muted-foreground">
              {user
                ? (user.email ?? "你已登录，购买记录将保存在此账号下。")
                : "使用 Google 或 GitHub 账号登录，无需设置新密码。"}
            </p>
          </div>
          <p className="text-sm leading-7 text-muted-foreground">
            使用权限跟随账号保存。
            <br />
            在其他设备登录同一个账号，也能继续使用已解锁的功能。
          </p>
          <div className="mt-auto pt-2">
            {user ? (
              <form action="/api/auth/logout" method="post">
                <Button type="submit" variant="outline" className="h-9">
                  <LogOut aria-hidden="true" />
                  退出登录
                </Button>
              </form>
            ) : state.loading || state.configurationMissing ? (
              <Button className="h-9" disabled>
                {state.loading && (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                )}
                {state.loading ? "读取账号中…" : "配置完成后即可登录"}
              </Button>
            ) : (
              <Button asChild className="h-9">
                <a href="/api/auth/login?destination=checkout">
                  登录 / 创建账号
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
        </section>

        <section aria-labelledby="product-title" className="flex flex-col gap-6 py-8 md:pl-10">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LockKeyhole className="size-4" aria-hidden="true" />
              访问权限
            </span>
            <Badge variant={state.premium ? "success" : "outline"}>
              {state.premium ? "已解锁" : "单次购买"}
            </Badge>
          </div>
          <div className="space-y-3">
            <h3 id="product-title" className="text-xl font-semibold tracking-tight">
              Loom Pro
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {state.premium
                ? "使用权限已开通，返回工作区继续体验。"
                : "完成一次测试付款，体验购买到解锁的完整流程。"}
            </p>
          </div>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2.5">
                <Check className="size-4 shrink-0" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-auto space-y-3 pt-2">
            {state.premium ? (
              <>
                <Button asChild className="h-9 w-full">
                  <a href={workspaceUrl}>
                    返回 Loom 工作区
                    <ArrowRight aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 w-full"
                  onClick={state.usePremium}
                  disabled={disabled}
                >
                  {state.action ? (
                    <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <CircleCheck aria-hidden="true" />
                  )}
                  {state.action ? "检查中…" : "检查使用权限"}
                </Button>
              </>
            ) : (
              <Button className="h-9 w-full" onClick={state.purchase} disabled={disabled}>
                {state.action ? (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <CreditCard aria-hidden="true" />
                )}
                {state.action ? "请稍候…" : user ? "前往测试收银台" : "登录并解锁"}
                {!state.action && <ArrowRight aria-hidden="true" />}
              </Button>
            )}
            <p className="text-xs leading-6 text-muted-foreground">
              仅供测试体验，不会真实扣款。金额以收银台为准。
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
