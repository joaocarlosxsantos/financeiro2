import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

function Bone({ className }: { className?: string }) {
  return <div className={cn("loading-bone h-3 rounded-md", className)} />;
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card min-w-0 space-y-5 p-4 sm:p-5", className)}>{children}</div>;
}

function Header() {
  return <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 flex-1 space-y-3">
      <Bone className="h-7 w-44 max-w-full" />
      <Bone className="w-64 max-w-full" />
    </div>
    <Bone className="h-11 w-32" />
  </div>;
}

function MetricValues() {
  return <div className="grid min-w-0 grid-cols-3 gap-3">
    {[0, 1, 2].map((item) => <div key={item} className="min-w-0 space-y-3">
      <Bone className="w-16 max-w-full" />
      <Bone className="h-6 w-24 max-w-full" />
    </div>)}
  </div>;
}

function Metrics({ hero = false }: { hero?: boolean }) {
  return <Panel>
    {hero && <div className="space-y-3 pb-1">
      <Bone className="w-28" />
      <Bone className="h-10 w-52 max-w-full sm:h-14" />
    </div>}
    <div className={hero ? "border-t pt-4" : undefined}><MetricValues /></div>
  </Panel>;
}

function List({ rows = 4, progress = false }: { rows?: number; progress?: boolean }) {
  return <Panel>
    <Bone className="h-4 w-36 max-w-full" />
    <div className="divide-y">
      {Array.from({ length: rows }, (_, item) => <div key={item} className="space-y-3 py-4 first:pt-0 last:pb-0">
        <div className="flex min-w-0 items-center gap-3">
          <Bone className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className={item % 2 ? "w-2/3" : "w-4/5"} />
            <Bone className="h-2 w-1/2" />
          </div>
          <Bone className="h-4 w-16 shrink-0 sm:w-24" />
        </div>
        {progress && <Bone className="h-2 w-full rounded-full" />}
      </div>)}
    </div>
  </Panel>;
}

function Chart() {
  return <Panel>
    <div className="space-y-2">
      <Bone className="h-4 w-40 max-w-full" />
      <Bone className="w-24" />
    </div>
    <div className="flex h-40 items-end gap-3 border-b pb-3 sm:h-56 sm:gap-5">
      {["h-2/5", "h-3/5", "h-1/2", "h-4/5", "h-3/5", "h-5/6"].map((height, item) =>
        <Bone key={item} className={cn("min-w-0 flex-1 rounded-b-none", height)} />)}
    </div>
    <div className="flex justify-between gap-3">
      {[0, 1, 2, 3, 4, 5].map((item) => <Bone key={item} className="h-2 w-8" />)}
    </div>
  </Panel>;
}

function Composer() {
  return <Panel className="self-start">
    <Bone className="h-4 w-36 max-w-full" />
    <Bone className="h-11 w-full lg:hidden" />
    <div className="hidden space-y-4 lg:block">
      {[0, 1, 2].map((item) => <div key={item} className="space-y-2">
        <Bone className="w-20" />
        <Bone className="h-12 w-full" />
      </div>)}
      <Bone className="h-11 w-full" />
    </div>
  </Panel>;
}

type LoadingLayout = "overview" | "dashboard" | "transactions" | "debts" | "goals";

/** Server-rendered placeholders: no timers or hydration needed for the loading UI. */
export function LoadingSkeleton({ layout = "overview" }: { layout?: LoadingLayout }) {
  return <section role="status" aria-busy="true" className="min-w-0 space-y-5">
    <span className="sr-only">Carregando seus dados…</span>
    <div aria-hidden="true" className="min-w-0 space-y-5">
      <Header />
      {layout === "transactions" ? <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel><div className="grid grid-cols-2 gap-3"><Bone className="h-11" /><Bone className="h-11" /></div></Panel>
          <List rows={6} />
        </div>
        <div className="min-w-0 space-y-4"><Metrics /><Composer /></div>
      </div> : layout === "debts" ? <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4"><Metrics /><List rows={3} /><Chart /></div>
        <Composer />
      </div> : layout === "goals" ? <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel><Bone className="h-4 w-40 max-w-full" /><Bone className="h-9 w-44 max-w-full" /><Bone className="h-2 w-full rounded-full" /><MetricValues /></Panel>
          <List rows={3} progress />
        </div>
        <Composer />
      </div> : <>
        <Metrics hero />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Chart />
          <List rows={layout === "dashboard" ? 4 : 3} />
        </div>
      </>}
    </div>
  </section>;
}
