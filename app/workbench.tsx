"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Box,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  Database,
  Download,
  FileJson,
  FlaskConical,
  Layers,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  ScanLine,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "sonner";
import { inspect, selection, defaultPolicy } from "@/lib/reliability/engine";
import type {
  Dataset,
  Evaluation,
  Policy,
  Prediction,
} from "@/lib/reliability/engine";
import { distributionDrift } from "@/lib/reliability/drift";
type Run = {
  id: string;
  dataset: Dataset;
  evaluation: Evaluation;
  datasetHash: string;
  createdAt: number | null;
  source: string;
};
type Review = {
  run_id: string;
  record_id: string;
  decision: string;
  note: string;
  created_at: number;
};
type Saved = {
  id: string;
  name: string;
  dataset_hash: string;
  created_at: number;
};
type Bootstrap = {
  user: { workspace: string; role: string; kind: string };
  run: Run;
  runs: Saved[];
  reviews: Review[];
  model: {
    name: string;
    version: string;
    type: string;
    data: string;
    license: string;
  };
};
type Inference = {
  probabilities: number[];
  classes: string[];
  predictionLabel: string;
  confidence: number;
  entropy: number;
  disagreement: number;
  oodScore: number;
  accepted: boolean;
  reasons: string[];
  contributions: { token: string; weight: number }[];
  memberPredictions: string[];
  temperature: number;
  explanation: string;
};
const links = [
  { id: "overview", label: "Overview", icon: Layers },
  { id: "evaluation", label: "Evaluation", icon: BarChart3 },
  { id: "data", label: "Datasets & runs", icon: Database },
  { id: "playground", label: "Inference lab", icon: FlaskConical },
  { id: "vision", label: "Vision lab", icon: ScanLine },
  { id: "review", label: "Human review", icon: Users },
  { id: "monitoring", label: "Monitoring", icon: Activity },
];
const fmt = (n: number | null, places = 1) =>
  n === null ? "—" : `${(n * 100).toFixed(places)}%`;
const decimal = (n: number | null, places = 3) =>
  n === null ? "—" : n.toFixed(places);
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Marginloom-Client": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}
let initialLoad: Promise<Bootstrap> | null = null;
function load() {
  if (!initialLoad)
    initialLoad = api("session", {})
      .then(() => api<Bootstrap>("bootstrap"))
      .catch((e) => {
        initialLoad = null;
        throw e;
      });
  return initialLoad;
}
function Mark() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#32d2ba" />
      <path
        d="M10 28V13l10 9 10-9v15M20 22v7"
        stroke="#0b3030"
        strokeWidth="3.5"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function CalibrationChart({ evaluation }: { evaluation: Evaluation }) {
  const W = 520,
    H = 220,
    L = 42,
    B = 26,
    T = 16,
    R = 14,
    plotW = W - L - R,
    plotH = H - B - T;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label="Reliability diagram comparing raw and calibrated confidence against observed accuracy"
      >
        <g>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line
                x1={L}
                x2={W - R}
                y1={T + plotH * (1 - v)}
                y2={T + plotH * (1 - v)}
                className="gridline"
              />
              <text
                x={L - 8}
                y={T + plotH * (1 - v) + 4}
                textAnchor="end"
                className="axis-label"
              >
                {v * 100}%
              </text>
            </g>
          ))}
          <line
            x1={L}
            y1={H - B}
            x2={W - R}
            y2={T}
            stroke="#a9b8c5"
            strokeDasharray="4 5"
          />
          {evaluation.raw.bins.map(
            (b, i) =>
              b.count > 0 && (
                <rect
                  key={i}
                  x={L + ((i + 0.12) * plotW) / 10}
                  y={T + plotH * (1 - (b.accuracy ?? 0))}
                  width={(plotW / 10) * 0.32}
                  height={plotH * (b.accuracy ?? 0)}
                  fill="#b8c8e9"
                  rx="2"
                >
                  <title>
                    Raw: {b.count} records; accuracy {fmt(b.accuracy)};
                    confidence {fmt(b.confidence)}
                  </title>
                </rect>
              ),
          )}
          {evaluation.calibrated.bins.map(
            (b, i) =>
              b.count > 0 && (
                <rect
                  key={i}
                  x={L + ((i + 0.49) * plotW) / 10}
                  y={T + plotH * (1 - (b.accuracy ?? 0))}
                  width={(plotW / 10) * 0.32}
                  height={plotH * (b.accuracy ?? 0)}
                  fill="#149e8e"
                  rx="2"
                >
                  <title>
                    Calibrated: {b.count} records; accuracy {fmt(b.accuracy)};
                    confidence {fmt(b.confidence)}
                  </title>
                </rect>
              ),
          )}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
            <text
              key={v}
              x={L + plotW * v}
              y={H - 7}
              textAnchor="middle"
              className="axis-label"
            >
              {v * 100}%
            </text>
          ))}
        </g>
      </svg>
      <figcaption>
        <span className="legend">
          <i style={{ background: "#b8c8e9" }} />
          Raw
          <i style={{ background: "#149e8e" }} />
          Calibrated
        </span>
        <span>Confidence → · observed accuracy ↑</span>
      </figcaption>
    </figure>
  );
}
function RiskChart({
  evaluation,
  policy,
}: {
  evaluation: Evaluation;
  policy: Policy;
}) {
  const points = evaluation.curve;
  const max = Math.max(0.1, ...points.map((p) => p.risk)) * 1.12;
  const x = (v: number) => 42 + v * 458,
    y = (v: number) => 190 - (v / max) * 160;
  const line = points.map((p) => `${x(p.coverage)},${y(p.risk)}`).join(" ");
  return (
    <figure>
      <svg
        viewBox="0 0 520 220"
        className="chart"
        role="img"
        aria-label="Empirical risk versus coverage, sorted by calibrated confidence"
      >
        <defs>
          <linearGradient id="risk-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1aab99" stopOpacity=".18" />
            <stop offset="100%" stopColor="#1aab99" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line
              x1="42"
              x2="500"
              y1={y(v * max)}
              y2={y(v * max)}
              className="gridline"
            />
            <text
              x="34"
              y={y(v * max) + 4}
              textAnchor="end"
              className="axis-label"
            >
              {fmt(v * max, 0)}
            </text>
            <text x={x(v)} y="212" textAnchor="middle" className="axis-label">
              {v * 100}%
            </text>
          </g>
        ))}
        {points.length > 0 && (
          <>
            <polygon
              points={`${x(points[0].coverage)},190 ${line} 500,190`}
              fill="url(#risk-area)"
            />
            <polyline
              points={line}
              fill="none"
              stroke="#0fa693"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </>
        )}
        {points
          .filter(
            (_, i) => i % Math.max(1, Math.floor(points.length / 25)) === 0,
          )
          .map((p, i) => (
            <circle
              key={i}
              cx={x(p.coverage)}
              cy={y(p.risk)}
              r="3"
              fill="#0fa693"
            >
              <title>
                {fmt(p.coverage)} coverage · {fmt(p.risk)} error · threshold{" "}
                {p.threshold.toFixed(3)}
              </title>
            </circle>
          ))}
      </svg>
      <figcaption>
        <span className="legend">
          <i style={{ background: "#0fa693" }} />
          Confidence-only ranking
        </span>
        <span>Coverage → · empirical error ↑</span>
      </figcaption>
      <p className="footnote">
        All ties included together. Current policy adds disagreement and
        vocabulary checks; its result can differ from this curve. Threshold{" "}
        {fmt(policy.threshold, 0)}.
      </p>
    </figure>
  );
}
function Stat({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  accent?: boolean;
}) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <div className="stat-label">
        {label}
        <Icon size={16} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
export default function Workbench({
  initialView = "overview",
}: {
  initialView?: string;
}) {
  const [view, setView] = useState(initialView),
    [boot, setBoot] = useState<Bootstrap | null>(null),
    [run, setRun] = useState<Run | null>(null),
    [policy, setPolicy] = useState<Policy>(defaultPolicy),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [upload, setUpload] = useState(""),
    [search, setSearch] = useState(""),
    [reviewFilter, setReviewFilter] = useState("pending"),
    [selected, setSelected] = useState<Prediction | null>(null),
    [note, setNote] = useState(""),
    [text, setText] = useState(
      "I have been charged twice and nobody has replied. Please help me resolve this today.",
    ),
    [inference, setInference] = useState<Inference | null>(null),
    [events, setEvents] = useState<
      { id: string; action: string; detail: string; created_at: number }[]
    >([]),
    [apiKey, setApiKey] = useState("");
  const [exportFile, setExportFile] = useState<{
    name: string;
    url: string;
    bytes: number;
  } | null>(null);
  useEffect(
    () => () => {
      if (exportFile) URL.revokeObjectURL(exportFile.url);
    },
    [exportFile],
  );
  function download(name: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    setExportFile({ name, url: URL.createObjectURL(blob), bytes: blob.size });
  }
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    load()
      .then((b) => {
        if (live) {
          setBoot(b);
          setRun(b.run);
          setPolicy(b.run.evaluation.policy);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const f = () => setView(location.pathname.slice(1) || "overview");
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  function navigate(next: string) {
    setView(next);
    history.pushState({}, "", next === "overview" ? "/" : "/" + next);
    setSearch("");
    window.scrollTo(0, 0);
  }
  const testRows = useMemo(
    () => run?.dataset.rows.filter((r) => r.split === "test") ?? [],
    [run],
  );
  const current = useMemo(
    () =>
      run ? selection(testRows, run.evaluation.temperature, policy) : null,
    [run, testRows, policy],
  );
  const details = useMemo(
    () =>
      run
        ? testRows.map((r) => inspect(r, run.evaluation.temperature, policy))
        : [],
    [run, testRows, policy],
  );
  const reviewMap = useMemo(
    () =>
      new Map(
        (boot?.reviews ?? [])
          .filter((r) => r.run_id === run?.id)
          .map((r) => [r.record_id, r]),
      ),
    [boot, run],
  );
  const queue = details
    .filter(
      (r) => !r.accepted && (reviewFilter === "all" || !reviewMap.has(r.id)),
    )
    .filter((r) =>
      `${r.id} ${r.text ?? ""} ${r.slice ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  async function perform<T>(
    action: () => Promise<T>,
    done?: (value: T) => void,
  ) {
    setBusy(true);
    try {
      const value = await action();
      done?.(value);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  function adopt(value: Run) {
    setRun(value);
    setPolicy(value.evaluation.policy);
    setBoot((b) =>
      b
        ? {
            ...b,
            runs: [
              {
                id: value.id,
                name: value.dataset.name,
                dataset_hash: value.datasetHash,
                created_at: value.createdAt ?? Date.now(),
              },
              ...b.runs.filter((r) => r.id !== value.id),
            ],
          }
        : b,
    );
  }
  async function importData() {
    await perform(
      () => api<Run>("evaluate", JSON.parse(upload)),
      (r) => {
        adopt(r);
        setImportOpen(false);
        setUpload("");
        navigate("evaluation");
        toast.success("Evaluation completed and saved");
      },
    );
  }
  function exportReport() {
    if (view === "vision") {
      void perform(
        async () => {
          const response = await fetch("/vision/report.json");
          if (!response.ok) throw new Error("Vision report unavailable");
          return response.json();
        },
        (report) => download("marginloom-vision-report.json", report),
      );
      return;
    }
    if (run)
      void perform(
        () => api("report/" + run.id, { policy }),
        (report) => {
          download("marginloom-report-" + run.id + ".json", report);
          toast.success("Evidence report ready");
        },
      );
  }
  function savePolicy() {
    if (run)
      void perform(
        () => api<Run>("policy", { runId: run.id, policy }),
        (r) => {
          adopt(r);
          toast.success("Policy saved as a new run");
        },
      );
  }
  async function saveReview(decision: string) {
    if (!selected || !run) return;
    await perform(
      () =>
        api("review", { runId: run.id, recordId: selected.id, decision, note }),
      () => {
        const review: Review = {
          run_id: run.id,
          record_id: selected.id,
          decision,
          note,
          created_at: Date.now(),
        };
        setBoot((b) =>
          b
            ? {
                ...b,
                reviews: [
                  review,
                  ...b.reviews.filter(
                    (r) =>
                      !(r.run_id === run.id && r.record_id === selected.id),
                  ),
                ],
              }
            : b,
        );
        setSelected(null);
        setNote("");
        toast.success("Review saved; benchmark labels preserved");
      },
    );
  }
  const activeRunId = run?.id;
  useEffect(() => {
    if (!activeRunId) return;
    const id = activeRunId;
    api<{ reviews: Review[] }>("reviews/" + id)
      .then((x) =>
        setBoot((b) =>
          b
            ? {
                ...b,
                reviews: [
                  ...b.reviews.filter((r) => r.run_id !== id),
                  ...x.reviews,
                ],
              }
            : b,
        ),
      )
      .catch((e) => toast.error(e.message));
  }, [activeRunId]);
  useEffect(() => {
    if (view === "monitoring" && boot)
      api<{ events: typeof events }>("audit")
        .then((x) => setEvents(x.events))
        .catch((e) => toast.error(e.message));
  }, [view, boot]);
  useEffect(() => {
    const modelContext = (
      document as Document & {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!modelContext) return;
    const abort = new AbortController();
    Promise.resolve(
      modelContext.registerTool(
        {
          name: "inspect_reliability_policy",
          description:
            "Read the current policy and computed held-out selection metrics without changing data.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown) => {
            if (input && typeof input === "object" && Object.keys(input).length)
              throw new Error("No arguments expected");
            return { runId: run?.id, policy, result: current };
          },
        },
        { signal: abort.signal },
      ),
    ).catch(() => {});
    return () => abort.abort();
  }, [run, policy, current]);
  const title =
    links.find((l) => l.id === view)?.label ??
    ({
      developers: "Developer access",
      settings: "Workspace settings",
      about: "About Marginloom",
    }[view] ||
      "Overview");
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "232px" } as React.CSSProperties}
    >
      <Toaster position="bottom-right" richColors />
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <Link href="/" className="brand">
            <Mark />
            <span>
              marginloom<span className="brand-dot">.</span>
            </span>
          </Link>
          <div className="workspace-switch">
            <div className="workspace-avatar">M</div>
            <div>
              <strong>Personal workspace</strong>
              <span>Reliability lab</span>
            </div>
            <ChevronRight size={15} />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>WORKSPACE</SidebarGroupLabel>
            <SidebarMenu>
              {links.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={view === id}
                    onClick={() => navigate(id)}
                  >
                    <Icon />
                    <span>{label}</span>
                    {id === "review" && current && current.review > 0 && (
                      <span className="nav-count">{current.review}</span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>BUILD</SidebarGroupLabel>
            <SidebarMenu>
              {[
                { id: "developers", label: "Developer access", icon: Code2 },
                { id: "settings", label: "Settings", icon: Settings2 },
                { id: "about", label: "Product guide", icon: BookOpen },
              ].map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={view === id}
                    onClick={() => navigate(id)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <strong>Evidence before automation</strong>
            <p>Explore the boundary between a prediction and a decision.</p>
            <Badge tone="sidebar-badge">v0.1 · Research preview</Badge>
          </div>
          <div className="user-area">
            <div className="user-avatar">D</div>
            <div>
              <strong>Demo workspace</strong>
              <span>Isolated session · 7 days</span>
            </div>
            <LockKeyhole size={15} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="app-main" ref={rootRef}>
        <header className="topbar">
          <div className="breadcrumbs">
            <SidebarTrigger className="mobile-toggle" />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-indicator">
              {view === "vision" ||
              view === "playground" ||
              run?.source.includes("Synthetic")
                ? "Synthetic demo data"
                : "Imported predictions"}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="icon-button"
                  aria-label="Open product guide"
                  onClick={() => navigate("about")}
                >
                  <BookOpen size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Product guide</TooltipContent>
            </Tooltip>
            <div className="top-avatar">ZH</div>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> AI RELIABILITY WORKBENCH
              </div>
              <h1>{view === "overview" ? "Reliability overview" : title}</h1>
              <p>
                {
                  (
                    {
                      overview:
                        "Understand the errors. Set the boundary. Keep a human in the loop.",
                      evaluation:
                        "Calibration and selective prediction, grounded in held-out evidence.",
                      data: "Version your predictions and make every result reproducible.",
                      playground:
                        "Inspect a real local model before trusting its prediction.",
                      vision:
                        "Inspect synthetic microscopy and pixel-level uncertainty.",
                      review:
                        "Turn uncertain predictions into deliberate human decisions.",
                      monitoring:
                        "Inspect workspace activity and dataset distribution shifts.",
                      developers:
                        "Use the same evaluation engine through a scoped API.",
                      settings: "Your workspace boundary and access settings.",
                      about:
                        "A practical bridge from model research to accountable software.",
                    } as Record<string, string>
                  )[view]
                }
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                onClick={exportReport}
                disabled={!run || busy}
              >
                <Download size={16} />
                {view === "vision" ? "Export vision report" : "Export report"}
              </button>
              <button
                className="button primary"
                onClick={() => setImportOpen(true)}
              >
                <Plus size={17} />
                New evaluation
              </button>
            </div>
          </div>
          {error ? (
            <div className="error-state">
              <TriangleAlert />
              <h2>We couldn’t open your workspace</h2>
              <p>{error}</p>
              <button
                className="button primary"
                onClick={() => location.reload()}
              >
                Try again
              </button>
            </div>
          ) : !boot || !run || !current ? (
            <div aria-busy="true" aria-label="Loading evaluation">
              <Skeleton className="h-20 w-full mb-6" />
              <div className="stat-grid">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-36 w-full" />
                ))}
              </div>
              <Skeleton className="h-80 w-full mt-6" />
            </div>
          ) : (
            <>
              {![
                "vision",
                "playground",
                "about",
                "developers",
                "settings",
              ].includes(view) && (
                <div className="project-strip">
                  <div className="project-symbol">
                    <MessageSquare size={19} />
                  </div>
                  <div className="project-title">
                    <strong>{run.dataset.name}</strong>
                    <span>
                      {run.dataset.classNames.length} classes ·{" "}
                      {run.evaluation.testCount} test records ·{" "}
                      {run.evaluation.calibrationCount} calibration records
                    </span>
                  </div>
                  <Badge tone="teal">
                    {run.id === "demo" ? "Reproducible demo" : "Saved run"}
                  </Badge>
                  <span className="hash-label">
                    <LockKeyhole size={13} />
                    {run.datasetHash.slice(0, 10)}
                  </span>
                  <Select
                    value={run.id}
                    onValueChange={(value) => {
                      if (value)
                        void perform(
                          () => api<Run>("runs/" + value),
                          (r) => {
                            setRun(r);
                            setPolicy(r.evaluation.policy);
                          },
                        );
                    }}
                  >
                    <SelectTrigger
                      className="run-select"
                      aria-label="Select evaluation run"
                    >
                      <SelectValue placeholder="Select run" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="demo">Seeded baseline</SelectItem>
                      {boot.runs.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ·{" "}
                          {new Date(r.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(view === "overview" || view === "evaluation") && (
                <>
                  <div className="stat-grid">
                    <Stat
                      label="Held-out accuracy"
                      value={fmt(run.evaluation.calibrated.accuracy)}
                      detail={`${run.evaluation.testCount} test predictions · argmax unchanged`}
                      icon={CheckCheck}
                    />
                    <Stat
                      label="Calibration error"
                      value={fmt(run.evaluation.calibrated.ece)}
                      detail={`Raw ${fmt(run.evaluation.raw.ece)} · 10 equal-width bins`}
                      icon={BarChart3}
                      accent
                    />
                    <Stat
                      label="Automated coverage"
                      value={fmt(current.coverage)}
                      detail={`${current.accepted} predictions pass your policy`}
                      icon={Layers}
                    />
                    <Stat
                      label="Routed to review"
                      value={String(current.review)}
                      detail={`${reviewMap.size} review decisions recorded for this run`}
                      icon={Users}
                    />
                  </div>
                  <div className="analysis-grid">
                    <Panel
                      title="Confidence, calibrated"
                      description="Observed accuracy within each confidence bin"
                      action={
                        <Badge tone="teal">
                          T = {run.evaluation.temperature.toFixed(2)}
                        </Badge>
                      }
                    >
                      <CalibrationChart evaluation={run.evaluation} />
                    </Panel>
                    <Panel
                      title="The cost of coverage"
                      description="What changes as you automate more predictions?"
                      action={<Badge>Held-out set</Badge>}
                    >
                      <RiskChart evaluation={run.evaluation} policy={policy} />
                    </Panel>
                  </div>
                  <div className="policy-grid">
                    <Panel
                      title="Your automation boundary"
                      description="Explore the trade-off before you save a policy."
                      className="policy-panel"
                      action={<SlidersHorizontal size={18} />}
                    >
                      <div className="threshold-label">
                        <span>Minimum confidence</span>
                        <strong>{fmt(policy.threshold, 0)}</strong>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[policy.threshold * 100]}
                        onValueChange={(v) =>
                          setPolicy((p) => ({ ...p, threshold: v[0] / 100 }))
                        }
                        aria-label="Minimum confidence threshold"
                      />
                      <div className="slider-endpoints">
                        <span>More automation</span>
                        <span>More review</span>
                      </div>
                      <div className="policy-outcomes">
                        <div>
                          <span>Accepted error rate</span>
                          <strong>{fmt(current.risk)}</strong>
                        </div>
                        <div>
                          <span>95% Wilson upper bound</span>
                          <strong>{fmt(current.wilsonUpper)}</strong>
                        </div>
                        <div>
                          <span>Review workload</span>
                          <strong>
                            {current.review} <small>/ {current.total}</small>
                          </strong>
                        </div>
                      </div>
                      <div className="policy-footer">
                        <p>
                          Exploratory test-set analysis. Select a policy on
                          separate validation data before making release claims.
                        </p>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={savePolicy}
                        >
                          <ShieldCheck size={16} />
                          Save policy
                        </button>
                      </div>
                    </Panel>
                    <section className="insight-panel">
                      <div className="insight-icon">
                        <ShieldCheck size={23} />
                      </div>
                      <Badge tone="dark-teal">DECISION SUPPORT</Badge>
                      <h2>
                        High confidence.
                        <br />
                        Still worth a second look.
                      </h2>
                      <p>
                        Confidence is one signal. This policy also checks model
                        disagreement and unfamiliar vocabulary.
                      </p>
                      <div className="insight-rule">
                        <span>Ensemble disagreement</span>
                        <strong>
                          ≤ {policy.maxDisagreement.toFixed(2)} nats
                        </strong>
                      </div>
                      <div className="insight-rule">
                        <span>Unknown vocabulary</span>
                        <strong>≤ {fmt(policy.maxOod, 0)}</strong>
                      </div>
                      <button
                        className="insight-link"
                        onClick={() => navigate("review")}
                      >
                        Inspect the review queue <ChevronRight size={17} />
                      </button>
                    </section>
                  </div>
                  <Panel
                    title="Where the model struggles"
                    description="Slice performance makes aggregate scores easier to question."
                    action={
                      <Badge>{run.evaluation.slices.length} slices</Badge>
                    }
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>DATA SLICE</TableHead>
                          <TableHead>RECORDS</TableHead>
                          <TableHead>ACCURACY</TableHead>
                          <TableHead>CALIBRATION ERROR</TableHead>
                          <TableHead>COVERAGE</TableHead>
                          <TableHead>SIGNAL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {run.evaluation.slices.map((s) => {
                          const v = selection(
                            testRows.filter(
                              (r) => (r.slice ?? "all") === s.name,
                            ),
                            run.evaluation.temperature,
                            policy,
                          );
                          return (
                            <TableRow key={s.name}>
                              <TableCell className="slice-name">
                                <span className="slice-marker" />
                                {s.name.replaceAll("_", " ")}
                              </TableCell>
                              <TableCell>{s.metrics.count}</TableCell>
                              <TableCell>{fmt(s.metrics.accuracy)}</TableCell>
                              <TableCell>{fmt(s.metrics.ece)}</TableCell>
                              <TableCell>
                                <div className="inline-meter">
                                  <span
                                    style={{ width: `${v.coverage * 100}%` }}
                                  />
                                </div>
                                {fmt(v.coverage, 0)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  tone={
                                    s.metrics.accuracy < 0.8 ? "amber" : "teal"
                                  }
                                >
                                  {s.metrics.count < 30
                                    ? "Small sample"
                                    : s.metrics.accuracy < 0.8
                                      ? "Inspect failures"
                                      : "Measured"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Panel>
                  {view === "evaluation" && (
                    <div className="analysis-grid">
                      <Panel
                        title="Metric comparison"
                        description="Calibration changes probabilities, not predicted classes."
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>METRIC</TableHead>
                              <TableHead>RAW</TableHead>
                              <TableHead>CALIBRATED</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(
                              [
                                "accuracy",
                                "macroF1",
                                "ece",
                                "brier",
                                "nll",
                                "macroAuroc",
                              ] as const
                            ).map((k) => (
                              <TableRow key={k}>
                                <TableCell>
                                  {
                                    {
                                      accuracy: "Accuracy ↑",
                                      macroF1: "Macro F1 ↑",
                                      ece: "ECE ↓",
                                      brier: "Multiclass Brier ↓",
                                      nll: "Log loss ↓",
                                      macroAuroc: "Macro OVR AUROC ↑",
                                    }[k]
                                  }
                                </TableCell>
                                <TableCell>
                                  {decimal(run.evaluation.raw[k])}
                                </TableCell>
                                <TableCell>
                                  {decimal(run.evaluation.calibrated[k])}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <p className="footnote padded">
                          Brier range [0,2]. Brier and log loss reflect both
                          discrimination and calibration. No improvement is
                          guaranteed on held-out data.
                        </p>
                      </Panel>
                      <Panel
                        title="Confusion matrix"
                        description="Rows: reference label · columns: predicted label"
                      >
                        <div
                          className="confusion"
                          style={{
                            gridTemplateColumns: `repeat(${run.dataset.classNames.length + 1},minmax(60px,1fr))`,
                            overflowX: "auto",
                          }}
                        >
                          <div />
                          {run.dataset.classNames.map((c) => (
                            <span key={c}>{c}</span>
                          ))}
                          {run.evaluation.calibrated.confusion.map((row, i) => (
                            <div className="contents" key={i}>
                              <span>{run.dataset.classNames[i]}</span>
                              {row.map((count, j) => (
                                <div
                                  className={
                                    i === j ? "diagonal" : "off-diagonal"
                                  }
                                  key={j}
                                  style={{
                                    opacity:
                                      0.55 +
                                      (0.45 * count) / Math.max(...row, 1),
                                  }}
                                >
                                  {count}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </Panel>
                    </div>
                  )}
                </>
              )}
              {view === "data" && (
                <>
                  <div className="analysis-grid">
                    <Panel
                      title="Dataset lineage"
                      description="A stable snapshot of the exact evaluation input."
                    >
                      <dl className="definition-list">
                        <div>
                          <dt>Source</dt>
                          <dd>{run.source}</dd>
                        </div>
                        <div>
                          <dt>Calibration split</dt>
                          <dd>
                            {run.evaluation.calibrationCount} records ·
                            temperature fit only
                          </dd>
                        </div>
                        <div>
                          <dt>Test split</dt>
                          <dd>
                            {run.evaluation.testCount} records · evaluation only
                          </dd>
                        </div>
                        <div>
                          <dt>SHA-256</dt>
                          <dd className="mono break-all">{run.datasetHash}</dd>
                        </div>
                        <div>
                          <dt>Validation</dt>
                          <dd>
                            Unique IDs · finite logits · split & group isolation
                          </dd>
                        </div>
                      </dl>
                      <button
                        className="button secondary panel-button"
                        onClick={() =>
                          download("marginloom-dataset.json", run.dataset)
                        }
                      >
                        <FileJson size={16} />
                        Download this dataset
                      </button>
                    </Panel>
                    <Panel
                      title="Bring your own model outputs"
                      description="Your architecture can change. The evidence format stays simple."
                    >
                      <div className="import-help">
                        <Database size={30} />
                        <h3>One JSON bundle. A complete evaluation.</h3>
                        <p>
                          Import logits from PyTorch, scikit-learn or any
                          classifier. Include reference labels and disjoint
                          calibration/test splits.
                        </p>
                        <div className="pill-row">
                          <Badge>2–12 classes</Badge>
                          <Badge>20–2,000 records</Badge>
                          <Badge>900 KB maximum</Badge>
                        </div>
                        <button
                          className="button primary"
                          onClick={() => setImportOpen(true)}
                        >
                          <Plus size={16} />
                          Import predictions
                        </button>
                      </div>
                    </Panel>
                  </div>
                  <Panel
                    title="Evaluation history"
                    description="Every import and saved policy creates a separate run."
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>RUN</TableHead>
                          <TableHead>VERSION</TableHead>
                          <TableHead>CREATED</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>{boot.run.dataset.name}</TableCell>
                          <TableCell>
                            <Badge>Seeded baseline</Badge>
                          </TableCell>
                          <TableCell>Reproducible fixture</TableCell>
                          <TableCell>
                            <button
                              className="text-button"
                              onClick={() => {
                                setRun(boot.run);
                                setPolicy(boot.run.evaluation.policy);
                                navigate("evaluation");
                              }}
                            >
                              Inspect
                            </button>
                          </TableCell>
                        </TableRow>
                        {boot.runs.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.name}</TableCell>
                            <TableCell className="mono">
                              {r.dataset_hash.slice(0, 12)}
                            </TableCell>
                            <TableCell>
                              {new Date(r.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <button
                                className="text-button"
                                onClick={() =>
                                  void perform(
                                    () => api<Run>("runs/" + r.id),
                                    (r) => {
                                      setRun(r);
                                      setPolicy(r.evaluation.policy);
                                      navigate("evaluation");
                                    },
                                  )
                                }
                              >
                                Inspect
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Panel>
                </>
              )}
              {view === "playground" && (
                <div className="analysis-grid lab-grid">
                  <Panel
                    title="Support triage"
                    description="Three independently trained linear models. No external API."
                  >
                    <div className="lab-content">
                      <Badge tone="teal">
                        Local ensemble · synthetic training data
                      </Badge>
                      <label htmlFor="inference-input">Support message</label>
                      <textarea
                        id="inference-input"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        maxLength={2000}
                        rows={7}
                      />
                      <div className="sample-prompts">
                        <span>Try an example</span>
                        {[
                          "Could you tell me how to update my address?",
                          "Someone is accessing my account without permission.",
                          "The quantum telescope has purple feelings.",
                        ].map((s, i) => (
                          <button key={s} onClick={() => setText(s)}>
                            {
                              [
                                "Routine request",
                                "Urgent request",
                                "Unfamiliar input",
                              ][i]
                            }
                          </button>
                        ))}
                      </div>
                      <button
                        className="button primary"
                        disabled={busy || text.trim().length < 3}
                        onClick={() =>
                          void perform(
                            () => api<Inference>("predict", { text, policy }),
                            setInference,
                          )
                        }
                      >
                        {busy ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                        Run inference
                      </button>
                      <p className="footnote">
                        The labels describe synthetic support categories, not a
                        person’s true emotional state. This bag-of-words
                        baseline can miss negation and misleading context.
                      </p>
                    </div>
                  </Panel>
                  <Panel
                    title="Decision evidence"
                    description="Prediction, uncertainty and the reasons to defer."
                  >
                    {inference ? (
                      <div className="lab-content">
                        <div
                          className={`decision-banner ${inference.accepted ? "accepted" : "review"}`}
                        >
                          <ShieldCheck size={25} />
                          <div>
                            <strong>
                              {inference.accepted
                                ? "Policy accepts this prediction"
                                : "Send to human review"}
                            </strong>
                            <span>
                              Predicted category: {inference.predictionLabel}
                            </span>
                          </div>
                          <Badge>{fmt(inference.confidence)}</Badge>
                        </div>
                        {inference.classes.map((c, i) => (
                          <div className="prob-row" key={c}>
                            <span>{c}</span>
                            <div>
                              <i
                                style={{
                                  width: `${inference.probabilities[i] * 100}%`,
                                }}
                              />
                            </div>
                            <strong>{fmt(inference.probabilities[i])}</strong>
                          </div>
                        ))}
                        {inference.reasons.length > 0 && (
                          <ul className="reason-list">
                            {inference.reasons.map((r) => (
                              <li key={r}>
                                <TriangleAlert size={15} />
                                {r}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="inference-stats">
                          <div>
                            <span>Entropy</span>
                            <strong>{inference.entropy.toFixed(3)} nats</strong>
                          </div>
                          <div>
                            <span>Disagreement</span>
                            <strong>
                              {inference.disagreement.toFixed(3)} nats
                            </strong>
                          </div>
                          <div>
                            <span>Unknown tokens</span>
                            <strong>{fmt(inference.oodScore)}</strong>
                          </div>
                        </div>
                        <h3>What contributed?</h3>
                        <div className="token-contributions">
                          {inference.contributions.map((c) => (
                            <span
                              key={c.token}
                              className={
                                c.weight >= 0 ? "positive" : "negative"
                              }
                              title={`Selected-class coefficient: ${c.weight.toFixed(3)}`}
                            >
                              {c.token}
                              <small>
                                {c.weight >= 0 ? "+" : ""}
                                {c.weight.toFixed(2)}
                              </small>
                            </span>
                          ))}
                        </div>
                        <p className="footnote">{inference.explanation}</p>
                      </div>
                    ) : (
                      <div className="empty-state">
                        <FlaskConical size={36} />
                        <h3>A prediction you can inspect</h3>
                        <p>
                          Run a message to see calibrated probabilities, model
                          disagreement and token contributions.
                        </p>
                      </div>
                    )}
                  </Panel>
                </div>
              )}
              {view === "review" && (
                <Panel
                  title="Review queue"
                  description="Only predictions that fail the current policy. Reviews never overwrite evaluation labels."
                  action={<Badge tone="amber">{queue.length} visible</Badge>}
                >
                  <div className="table-toolbar">
                    <div className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Search review records"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search messages, IDs or slices…"
                      />
                    </div>
                    <Select
                      value={reviewFilter}
                      onValueChange={(v) => v && setReviewFilter(v)}
                    >
                      <SelectTrigger className="filter-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending reviews</SelectItem>
                        <SelectItem value="all">All flagged records</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {queue.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>MESSAGE</TableHead>
                          <TableHead>PREDICTION</TableHead>
                          <TableHead>CONFIDENCE</TableHead>
                          <TableHead>REASON</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queue.slice(0, 80).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <strong className="record-text">
                                {r.text || r.id}
                              </strong>
                              <span className="record-meta">
                                {r.id} ·{" "}
                                {(r.slice ?? "all").replaceAll("_", " ")}
                              </span>
                            </TableCell>
                            <TableCell>
                              {run.dataset.classNames[r.prediction]}
                            </TableCell>
                            <TableCell>{fmt(r.confidence)}</TableCell>
                            <TableCell>
                              <Badge tone="amber">{r.reasons[0]}</Badge>
                            </TableCell>
                            <TableCell>
                              <button
                                className="button small secondary"
                                onClick={() => {
                                  setSelected(r);
                                  setNote(reviewMap.get(r.id)?.note ?? "");
                                }}
                              >
                                Review
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="empty-state">
                      <CheckCheck size={36} />
                      <h3>No pending records in this view</h3>
                      <p>
                        Change the policy or filter to inspect other
                        predictions.
                      </p>
                    </div>
                  )}
                  {queue.length > 80 && (
                    <p className="footnote padded">
                      Showing the first 80 matches. Use search to narrow the
                      queue.
                    </p>
                  )}
                </Panel>
              )}
              {view === "monitoring" && (
                <>
                  <div className="analysis-grid">
                    <Panel
                      title="Distribution checks"
                      description="Compare predicted label proportions in each test slice."
                    >
                      <div className="drift-list">
                        {run.evaluation.slices.map((s) => {
                          const subset = details.filter(
                              (r) => (r.slice ?? "all") === s.name,
                            ),
                            counts = run.dataset.classNames.map(
                              (_, c) =>
                                subset.filter((r) => r.prediction === c).length,
                            ),
                            reference = run.dataset.classNames.map(
                              (_, c) =>
                                details.filter((r) => r.prediction === c)
                                  .length,
                            ),
                            drift = distributionDrift(reference, counts);
                          return (
                            <div key={s.name}>
                              <span>{s.name.replaceAll("_", " ")}</span>
                              <div className="distribution-bar">
                                {counts.map((n, c) => (
                                  <i
                                    key={c}
                                    style={{
                                      width: `${(n / subset.length) * 100}%`,
                                      background: [
                                        "#119f8f",
                                        "#7198d9",
                                        "#d1ad72",
                                      ][c % 3],
                                    }}
                                    title={`${run.dataset.classNames[c]}: ${n}`}
                                  />
                                ))}
                              </div>
                              <strong>
                                {decimal(drift)} <small>JS</small>
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                      <p className="footnote padded">
                        Descriptive slice comparison against the full test set,
                        not a production drift alarm or significance test.
                      </p>
                    </Panel>
                    <Panel
                      title="Operational boundary"
                      description="Small, inspectable limits for a lightweight deployment."
                    >
                      <dl className="definition-list">
                        <div>
                          <dt>Request budget</dt>
                          <dd>120 requests / workspace / minute</dd>
                        </div>
                        <div>
                          <dt>Evaluation budget</dt>
                          <dd>8 imports / minute · 30 saved runs</dd>
                        </div>
                        <div>
                          <dt>Input limit</dt>
                          <dd>2,000 records · 900 KB</dd>
                        </div>
                        <div>
                          <dt>Data boundary</dt>
                          <dd>Workspace-scoped database queries</dd>
                        </div>
                        <div>
                          <dt>Health</dt>
                          <dd>
                            <a
                              href="/api/health"
                              target="_blank"
                              rel="noreferrer"
                              className="text-link"
                            >
                              Inspect live health response
                            </a>
                          </dd>
                        </div>
                      </dl>
                    </Panel>
                  </div>
                  <Panel
                    title="Audit trail"
                    description="Actual actions recorded in this workspace."
                    action={
                      <button
                        className="text-button"
                        onClick={() =>
                          void perform(
                            () => api<{ events: typeof events }>("audit"),
                            (v) => setEvents(v.events),
                          )
                        }
                      >
                        Refresh
                      </button>
                    }
                  >
                    <div className="event-list">
                      {events.length ? (
                        events.map((e) => (
                          <div key={e.id}>
                            <div className="event-icon">
                              <Activity size={15} />
                            </div>
                            <div>
                              <strong>{e.action.replaceAll(".", " · ")}</strong>
                              <p>{e.detail}</p>
                            </div>
                            <time>
                              {new Date(e.created_at).toLocaleTimeString()}
                            </time>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">
                          <Activity />
                          <p>No activity loaded yet.</p>
                        </div>
                      )}
                    </div>
                  </Panel>
                </>
              )}
              {view === "developers" && (
                <div className="analysis-grid">
                  <Panel
                    title="Scoped API access"
                    description="Keys can access only the workspace in which they were created."
                  >
                    <div className="lab-content">
                      <LockKeyhole size={28} />
                      <h3>Connect your evaluation pipeline</h3>
                      <p>
                        Generate one key for this workspace. Generating another
                        key revokes the previous one.
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void perform(
                            () => api<{ key: string }>("keys", {}),
                            (v) => setApiKey(v.key),
                          )
                        }
                      >
                        Generate API key
                      </button>
                      {apiKey && (
                        <div className="key-reveal">
                          <strong>
                            Copy now. This key is shown only in this session.
                          </strong>
                          <code>{apiKey}</code>
                          <button
                            className="text-button"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(apiKey)
                                .then(() => toast.success("Copied"))
                            }
                          >
                            Copy key
                          </button>
                        </div>
                      )}
                      <p className="footnote">
                        Keys are stored as SHA-256 hashes. Treat the key as a
                        secret; never commit it to a repository.
                      </p>
                    </div>
                  </Panel>
                  <Panel
                    title="Evaluate from your terminal"
                    description="Use your deployment origin and a JSON prediction bundle."
                  >
                    <pre className="code-block">{`curl "$MARGINLOOM_URL/api/evaluate" \\\n  -H "Authorization: Bearer $MARGINLOOM_KEY" \\\n  -H "Content-Type: application/json" \\\n  --data-binary @predictions.json`}</pre>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>METHOD</TableHead>
                          <TableHead>ENDPOINT</TableHead>
                          <TableHead>PURPOSE</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          [
                            "POST",
                            "/api/evaluate",
                            "Validate, calibrate, evaluate",
                          ],
                          ["GET", "/api/runs/:id", "Retrieve a versioned run"],
                          ["POST", "/api/predict", "Run text inference"],
                          ["POST", "/api/review", "Record a human decision"],
                          [
                            "GET",
                            "/api/report/:id",
                            "Export reproducible evidence",
                          ],
                        ].map((r) => (
                          <TableRow key={r[1]}>
                            {r.map((c) => (
                              <TableCell key={c}>
                                <code>{c}</code>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Panel>
                </div>
              )}
              {view === "settings" && (
                <div className="analysis-grid">
                  <Panel
                    title="Workspace & session"
                    description="An isolated environment for your experiments."
                  >
                    <dl className="definition-list">
                      <div>
                        <dt>Workspace ID</dt>
                        <dd className="mono break-all">
                          {boot.user.workspace}
                        </dd>
                      </div>
                      <div>
                        <dt>Role</dt>
                        <dd>Owner of this demo workspace</dd>
                      </div>
                      <div>
                        <dt>Authentication</dt>
                        <dd>
                          Random bearer capability · HttpOnly session cookie
                        </dd>
                      </div>
                      <div>
                        <dt>Session duration</dt>
                        <dd>7 days; save an API key for programmatic access</dd>
                      </div>
                      <div>
                        <dt>Persistence</dt>
                        <dd>Server-side SQLite / D1</dd>
                      </div>
                    </dl>
                    <p className="footnote padded">
                      Demo sessions are browser-specific and are not recoverable
                      accounts. Export important evidence. Platform sign-in also
                      protects this private hosted preview.
                    </p>
                  </Panel>
                  <Panel
                    title="Policy controls"
                    description="These checks apply alongside minimum confidence."
                  >
                    <div className="lab-content">
                      <label>
                        Maximum ensemble disagreement:{" "}
                        {policy.maxDisagreement.toFixed(2)} nats
                      </label>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[policy.maxDisagreement]}
                        onValueChange={(v) =>
                          setPolicy((p) => ({ ...p, maxDisagreement: v[0] }))
                        }
                        aria-label="Maximum ensemble disagreement"
                      />
                      <label>
                        Maximum unknown vocabulary: {fmt(policy.maxOod, 0)}
                      </label>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[policy.maxOod * 100]}
                        onValueChange={(v) =>
                          setPolicy((p) => ({ ...p, maxOod: v[0] / 100 }))
                        }
                        aria-label="Maximum unknown vocabulary"
                      />
                      <p>
                        Missing optional signals do not count as evidence of
                        safety. Imported runs without ensemble logits or OOD
                        scores use confidence alone.
                      </p>
                      <button
                        className="button primary"
                        onClick={savePolicy}
                        disabled={busy}
                      >
                        Save policy as new run
                      </button>
                    </div>
                  </Panel>
                </div>
              )}
              {view === "vision" && <VisionLab />}
              {view === "about" && (
                <>
                  <section className="about-hero">
                    <div>
                      <Badge tone="dark-teal">OPEN, INSPECTABLE AI</Badge>
                      <h2>
                        A model gives you a prediction.
                        <br />
                        Marginloom gives you the evidence.
                      </h2>
                      <p>
                        Connect model evaluation to a practical decision:
                        automate, abstain or ask a person. Bring logits from
                        your own model, fit a calibrator, inspect errors, and
                        export the complete chain of evidence.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => navigate("evaluation")}
                      >
                        Explore the evaluation
                      </button>
                    </div>
                    <div className="about-flow">
                      {[
                        ["01", "Measure", "Evaluate a disjoint test set"],
                        [
                          "02",
                          "Calibrate",
                          "Fit probabilities on calibration data",
                        ],
                        ["03", "Decide", "Inspect risk, coverage and failures"],
                        [
                          "04",
                          "Review",
                          "Record human decisions with provenance",
                        ],
                      ].map(([n, t, d]) => (
                        <div key={n}>
                          <span>{n}</span>
                          <div>
                            <strong>{t}</strong>
                            <p>{d}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="analysis-grid">
                    <Panel
                      title="A deliberately honest baseline"
                      description="Small models make the whole system reproducible."
                    >
                      <div className="prose">
                        <p>
                          The text adapter uses a trained three-member logistic
                          ensemble with binary token features. It is a
                          transparent baseline, not a large language model or a
                          claim of production-grade emotion recognition.
                        </p>
                        <p>
                          The vision adapter uses synthetic micrographs to
                          connect segmentation quality and pixel uncertainty.
                          Neither demonstration establishes real clinical or
                          operational performance.
                        </p>
                      </div>
                    </Panel>
                    <Panel
                      title="Designed to be extended"
                      description="Research depth without unnecessary infrastructure."
                    >
                      <div className="prose">
                        <p>
                          Model-independent prediction bundles let you bring
                          outputs from Transformers, vision networks and
                          conventional ML. The calibration, error analysis and
                          review workflow remains the same.
                        </p>
                        <p>
                          Python reproducibility scripts, typed APIs, a
                          relational store, tests, Docker and documented
                          decisions make the implementation inspectable.
                        </p>
                      </div>
                    </Panel>
                  </div>
                </>
              )}
              <footer className="workspace-footer">
                <span>
                  <ShieldCheck size={14} />
                  Measured evidence. Human judgment.
                </span>
                <span>
                  Marginloom v0.1 · Synthetic demonstration · No external model
                  API
                </span>
              </footer>
            </>
          )}
        </main>
      </SidebarInset>
      <Dialog
        open={!!exportFile}
        onOpenChange={(open) => {
          if (!open) setExportFile(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your evidence is ready</DialogTitle>
            <DialogDescription>
              Download the generated JSON file to keep a reproducible copy of
              this evidence.
            </DialogDescription>
          </DialogHeader>
          {exportFile && (
            <>
              <p>{exportFile.name}</p>
              <p className="footnote">
                {(exportFile.bytes / 1024).toFixed(1)} KB · JSON
              </p>
              <a
                className="button primary"
                href={exportFile.url}
                download={exportFile.name}
              >
                Download JSON
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="import-dialog">
          <DialogHeader>
            <DialogTitle>New evaluation</DialogTitle>
            <DialogDescription>
              Import a JSON bundle with classNames and calibration/test
              prediction rows. Your data stays in this workspace.
            </DialogDescription>
          </DialogHeader>
          <label className="file-drop">
            <FileJson size={24} />
            <span>Choose a JSON prediction bundle</span>
            <small>900 KB maximum · 2,000 records</small>
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Upload prediction bundle"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 900000) {
                  toast.error("File exceeds 900 KB");
                  return;
                }
                setUpload(await f.text());
              }}
            />
          </label>
          <div className="textarea-label">
            <label htmlFor="json-input">Or paste JSON</label>
            <button
              className="text-button"
              onClick={() =>
                run &&
                setUpload(
                  JSON.stringify(
                    { ...run.dataset, name: "Support triage · imported" },
                    null,
                    2,
                  ),
                )
              }
            >
              Use current dataset
            </button>
          </div>
          <textarea
            id="json-input"
            className="json-editor"
            value={upload}
            onChange={(e) => setUpload(e.target.value)}
            placeholder={
              '{"name":"My model","classNames":["a","b"],"rows":[…]}'
            }
            rows={8}
          />
          <p className="footnote">
            Use at least 10 records per split. We reject duplicate IDs,
            nonfinite logits, and repeated text or groups across splits.
          </p>
          <button
            className="button primary"
            disabled={busy || !upload.trim()}
            onClick={() => {
              try {
                JSON.parse(upload);
                void importData();
              } catch {
                toast.error("Invalid JSON. Check the bundle and try again.");
              }
            }}
          >
            {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            Run evaluation
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review prediction</DialogTitle>
            <DialogDescription>
              Record your judgment without changing the benchmark’s original
              labels.
            </DialogDescription>
          </DialogHeader>
          {selected && run && (
            <>
              <Badge tone="amber">{selected.id}</Badge>
              <blockquote className="review-message">
                {selected.text || "No source text attached"}
              </blockquote>
              <dl className="definition-list compact">
                <div>
                  <dt>Model prediction</dt>
                  <dd>
                    {
                      run.dataset.classNames[
                        inspect(selected, run.evaluation.temperature, policy)
                          .prediction
                      ]
                    }
                  </dd>
                </div>
                <div>
                  <dt>Reference label</dt>
                  <dd>{run.dataset.classNames[selected.label]}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>
                    {fmt(
                      inspect(selected, run.evaluation.temperature, policy)
                        .confidence,
                    )}
                  </dd>
                </div>
              </dl>
              <label htmlFor="review-note">Review note</label>
              <textarea
                id="review-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="What evidence supports your decision?"
              />
              <div className="review-actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void saveReview("confirmed")}
                >
                  <Check size={16} />
                  Confirm
                </button>
                <button
                  className="button secondary"
                  disabled={busy || !note.trim()}
                  onClick={() => void saveReview("corrected")}
                >
                  Record correction
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void saveReview("needs-context")}
                >
                  Needs context
                </button>
              </div>
              <p className="footnote">
                A correction requires a note. Confirming a prediction does not
                certify real-world safety.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
function VisionLab() {
  const [data, setData] = useState<{
      images: {
        id: string;
        image: string;
        mask: string;
        prediction: string;
        uncertainty: string;
        dice: number;
        iou: number;
        slice: string;
      }[];
      summary: { dice: number; iou: number };
      description: string;
    } | null>(null),
    [error, setError] = useState(""),
    [index, setIndex] = useState(0);
  useEffect(() => {
    fetch("/vision/manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error("Vision assets unavailable");
        return r.json();
      })
      .then((v) => setData(v as NonNullable<typeof data>))
      .catch((e) => setError(e.message));
  }, []);
  if (error)
    return (
      <div className="error-state">
        <p>{error}</p>
      </div>
    );
  if (!data) return <Skeleton className="h-80 w-full" />;
  const sample = data.images[index];
  return (
    <>
      <div className="stat-grid">
        <Stat
          label="Mean per-image Dice"
          value={fmt(data.summary.dice)}
          detail="Held-out synthetic images"
          icon={ScanLine}
        />
        <Stat
          label="Mean per-image IoU"
          value={fmt(data.summary.iou)}
          detail="Foreground overlap with generated masks"
          icon={Layers}
        />
        <Stat
          label="Inspectable samples"
          value={String(data.images.length)}
          detail="All generated with fixed random seeds"
          icon={Database}
        />
        <Stat
          label="Model family"
          value="Linear"
          detail="Pixel features · logistic regression"
          icon={Box}
        />
      </div>
      <Panel
        title="Segmentation inspection"
        description={
          data.description +
          " Results precomputed by the reproducible Python pipeline."
        }
        action={
          <Select
            value={String(index)}
            onValueChange={(v) => v !== null && setIndex(Number(v))}
          >
            <SelectTrigger className="filter-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.images.map((im, i) => (
                <SelectItem key={im.id} value={String(i)}>
                  {im.id} · {im.slice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <div className="vision-grid">
          {[
            ["Input micrograph", sample.image],
            ["Reference mask", sample.mask],
            ["Predicted mask", sample.prediction],
            ["Pixel entropy", sample.uncertainty],
          ].map(([label, src]) => (
            <figure key={label}>
              <Image
                unoptimized
                src={src}
                alt={`${label} for ${sample.id}`}
                width={192}
                height={192}
              />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
        <div className="vision-summary">
          <Badge tone="teal">Dice {fmt(sample.dice)}</Badge>
          <Badge>IoU {fmt(sample.iou)}</Badge>
          <Badge tone="amber">{sample.slice}</Badge>
          <p>
            Entropy is pixel-level uncertainty, not the probability that a whole
            mask is correct. These are synthetic objects, not patient images.
          </p>
        </div>
      </Panel>
    </>
  );
}
