import type { Metadata } from "next";

export const SITE_URL = "https://www.loom-labs.ai";
export const SITE_NAME = "Loom AI";
export const SITE_DESCRIPTION =
  "连接桌面、浏览器与编辑器，让灵感在同一个工作区延续。探索 Loom AI 愿景与固定工作计划演示。";
export const BRAND_IMAGE = {
  url: `${SITE_URL}/loom.png`,
  width: 1254,
  height: 1254,
  alt: "Loom AI 品牌标志",
};

export const PUBLIC_PAGES = [
  {
    path: "/",
    title: "Loom AI · 连接智能，织就未来",
    label: "首页",
    description: SITE_DESCRIPTION,
    content:
      "Loom AI 希望连接桌面、浏览器与编辑器中的上下文，让人与智能协作。当前网站提供产品愿景、工作区与体验方案，工作计划使用预置示例。",
  },
  {
    path: "/vision",
    title: "我们的愿景 · Loom AI",
    label: "我们的愿景",
    description: "了解 Loom AI 如何连接工具与上下文，让零散的发现延续为清晰、可行动的下一步。",
    content:
      "Loom AI 的愿景是让灵感不止于一个窗口，让上下文在熟悉的工具中自然延续，并让想法走向下一步。这是产品方向，不表示已交付跨工具自动执行能力。",
  },
  {
    path: "/workspace",
    title: "Loom 工作区 · 固定工作计划演示",
    label: "Loom 工作区",
    description:
      "探索 Loom 工作区的预置工作计划。Pro 演示每次运行均由服务端验证当前权益，不调用真实 AI 模型。",
    content:
      "工作区展示预置创意工具工作计划。Pro 演示需要登录和有效权益，每次运行由服务端检查；不会调用真实模型、创建文件或执行外部操作。公开介绍无需登录，个人资料和付费接口需要服务端认证。",
  },
  {
    path: "/pricing",
    title: "体验方案 · Loom Explore 与 Loom Pro",
    label: "体验方案",
    description:
      "Loom Explore 免费探索；Loom Pro 以 USD 1.00 一次性 Sandbox 付款验证解锁流程，无真实扣款、订阅或自动续费。",
    content:
      "Loom Explore 可免费浏览产品愿景与工作区。Loom Pro 当前仅以 USD 1.00 一次性 Stripe Sandbox 交易测试购买、权益开通和退款撤权，不发生真实扣款，不含订阅或自动续费；该金额不是正式商业售价。",
  },
] as const;

export type PublicPath = (typeof PUBLIC_PAGES)[number]["path"];

export function publicPageUrl(path: PublicPath): string {
  return new URL(path, SITE_URL).href;
}

export function createPageMetadata(path: PublicPath): Metadata {
  const page = PUBLIC_PAGES.find((candidate) => candidate.path === path)!;
  const url = publicPageUrl(path);
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: url, languages: { "zh-CN": url } },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: SITE_NAME,
      url,
      title: page.title,
      description: page.description,
      images: [BRAND_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [{ url: BRAND_IMAGE.url, alt: BRAND_IMAGE.alt }],
    },
  };
}

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        url: BRAND_IMAGE.url,
        width: BRAND_IMAGE.width,
        height: BRAND_IMAGE.height,
        caption: BRAND_IMAGE.alt,
      },
    },
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: "zh-CN",
      description: SITE_DESCRIPTION,
    },
  ],
};

/** Keep structured data inert even if future public content includes HTML-like text. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const llmsIndex = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

当前是产品演示：工作计划为预置内容，不调用真实 AI 模型。USD 1.00 仅用于一次性 Stripe Sandbox 测试，不是真实扣款或正式商业售价。

## 公开页面

${PUBLIC_PAGES.map((page) => `- [${page.label}](${publicPageUrl(page.path)}): ${page.description}`).join("\n")}

## 公开内容正文

- [纯文本说明](${SITE_URL}/llms-full.txt): 四个公开页面的简洁说明与演示边界，不含账户、订单或认证资料。
`;

export const llmsFullText = `# ${SITE_NAME} 公开内容说明

> 本文只描述公开产品内容，不提供个人资料、认证凭据或付费内容。

${PUBLIC_PAGES.map((page) => `## ${page.label}\n\n页面：${publicPageUrl(page.path)}\n\n${page.content}`).join("\n\n")}
`;

export const publicTextHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
  "X-Content-Type-Options": "nosniff",
  Link: `<${SITE_URL}/llms.txt>; rel="describedby"`,
};
