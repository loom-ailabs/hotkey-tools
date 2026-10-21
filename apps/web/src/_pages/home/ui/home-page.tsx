const examples = [
  { combo: "Ctrl + K", label: "打开命令面板" },
  { combo: "Ctrl + Shift + P", label: "快速搜索" },
  { combo: "Alt + ↑", label: "切换到上一个工作区" },
];

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-16 px-6 py-16 lg:px-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-indigo-600">
            Hotkey Tools
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            把快捷键整理成自己的工作流
          </h1>
        </div>
        <span className="rounded-full bg-white px-4 py-2 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          初始化版本
        </span>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-3xl bg-slate-950 p-8 text-white shadow-xl shadow-slate-900/10">
          <p className="text-sm text-indigo-300">快捷键库</p>
          <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight">
            记录、搜索并复用你最常用的快捷键。
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Web 使用 Next.js 静态导出，数据接口由同一个 Cloudflare Worker 提供，结构化数据存储在
            D1。
          </p>
          <a
            className="mt-8 inline-flex rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
            href="#examples"
          >
            查看示例
          </a>
        </div>

        <div id="examples" className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-950">示例快捷键</h2>
          <ul className="mt-5 space-y-3">
            {examples.map((example) => (
              <li
                className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3"
                key={example.combo}
              >
                <span className="text-sm text-slate-600">{example.label}</span>
                <kbd className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  {example.combo}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
