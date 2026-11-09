import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import {
    Activity,
    ArrowRight,
    ArrowUpRight,
    Battery,
    BookOpen,
    Braces,
    Check,
    CircleStop,
    Cpu,
    Gauge,
    Lock,
    Menu,
    Play,
    Radio,
    ScanLine,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Timer,
    Waves,
    Workflow,
    X,
    Zap,
    type LucideIcon,
} from "lucide-react";

import "./homepage.css";

const GITHUB_URL = "https://github.com/httxSereti/PES";
const DOCS_URL = `${GITHUB_URL}/tree/main/resources/docs`;
const API_URL = `${GITHUB_URL}/tree/main/apps/app/src/api`;
const RELEASES_URL = `${GITHUB_URL}/releases`;
const ISSUES_URL = `${GITHUB_URL}/issues`;

const themeStyle = {
    "--pes-bg": "#0B0A0F",
    "--pes-panel": "#121016",
    "--pes-panel-2": "#17141D",
    "--pes-panel-3": "#0E0C13",
    "--pes-border": "#26212F",
    "--pes-border-strong": "#342B40",
    "--pes-text": "#F7F5FA",
    "--pes-muted": "#A39DAF",
    "--pes-dim": "#6E6879",
    "--pes-purple": "#AD46FF",
    "--pes-purple-soft": "#D5A7FF",
    "--pes-success": "#8EF0B2",
} as CSSProperties;

const navLinks = [
    { label: "Features", href: "#features" },
    { label: "The engine", href: "#engine" },
    { label: "Integrations", href: "#integrations" },
    { label: "Safety", href: "#safety" },
];

const stats = [
    { value: "03", label: "UNITS" },
    { value: "06", label: "CHANNELS" },
    { value: "03", label: "SENSORS" },
    { value: "06", label: "INTEGRATIONS" },
    { value: "01", label: "RULE ENGINE" },
];

const expressions = [
    { value: "+10", label: "ADD INTENSITY" },
    { value: "%-[5-10]", label: "SUBTRACT % RANDOM" },
    { value: "[20-30]RO", label: "ONE RANDOM UNIT" },
    { value: "ABRM", label: "RANDOM CHANNELS" },
];

const presets = ["SLOW BURN", "EDGE HOLD", "REWARD"];

const units = [
    { id: "01", channels: [72, 48], pct: 42, active: true },
    { id: "02", channels: [38, 64], pct: 28, active: false },
    { id: "03", channels: [55, 31], pct: 35, active: false },
];

const sensors = [
    { label: "MOTION A", value: 72 },
    { label: "MOTION B", value: 24 },
    { label: "NOISE", value: 58 },
];

const roles = [
    { label: "HOST", access: "FULL", tone: "purple" },
    { label: "OPERATOR", access: "CONTROL", tone: "text" },
    { label: "TRUSTED", access: "PLAY", tone: "muted" },
    { label: "GUEST", access: "VIEW", tone: "dim" },
];

const integrations = [
    {
        index: "01",
        name: "Chaster",
        meta: "WEBHOOKS · LOCK EVENTS",
        description:
            "The lock is part of the session. Votes, tasks, wheel spins and freezes become triggers; actions can add or remove time.",
        tags: ["PILLORY", "TASKS", "WHEEL", "FREEZE", "SHARED LINKS"],
        href: "https://chaster.app",
        icon: Lock,
    },
    {
        index: "02",
        name: "PuryFi",
        meta: "WEBSOCKET · BROWSER",
        description:
            "A slip becomes a signal. Browser detections and lock states stream in over a local WebSocket, ready to punish, tease or lock.",
        tags: ["DETECTIONS", "LOCK STATE", "COOLDOWN", "EMERGENCY UNLOCK"],
        href: "https://puryfi.org",
        icon: ScanLine,
    },
    {
        index: "03",
        name: "Lovense",
        meta: "BUTTPLUG · RELAY",
        description:
            "Toys through Buttplug and Intiface. Patterns, caps, battery events and a remote companion that dials home — not the other way around.",
        tags: ["PATTERNS", "CAPS", "BATTERY", "REMOTE COMPANION"],
        href: "https://www.lovense.com",
        icon: Waves,
    },
];

const safetyRows: { icon: LucideIcon; title: string; description: string }[] = [
    {
        icon: Gauge,
        title: "Server-side caps",
        description: "Every command is clamped before it reaches hardware.",
    },
    {
        icon: Timer,
        title: "Dead-man switch",
        description:
            "Manual control expires after 60 seconds without a heartbeat.",
    },
    {
        icon: CircleStop,
        title: "Stop-all",
        description:
            "Session end, shutdown, integration disable, or one button.",
    },
    {
        icon: Battery,
        title: "Low battery",
        description: "Toys stop before they die mid-session.",
    },
    {
        icon: Activity,
        title: "Watchdogs",
        description: "Pattern runs have a max duration and fade out on stop.",
    },
];

const footerColumns = [
    {
        title: "PRODUCT",
        links: [
            { label: "Features", href: "#features", external: false },
            { label: "The engine", href: "#engine", external: false },
            { label: "Integrations", href: "#integrations", external: false },
            { label: "Safety", href: "#safety", external: false },
        ],
    },
    {
        title: "RESOURCES",
        links: [
            { label: "Docs", href: DOCS_URL, external: true },
            { label: "API reference", href: API_URL, external: true },
            { label: "Changelog", href: RELEASES_URL, external: true },
        ],
    },
    {
        title: "COMMUNITY",
        links: [
            { label: "GitHub", href: GITHUB_URL, external: true },
            { label: "Issues", href: ISSUES_URL, external: true },
            { label: "Releases", href: RELEASES_URL, external: true },
        ],
    },
];

function Container({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`mx-auto w-full max-w-[1200px] px-5 sm:px-8 xl:px-0 ${className}`}
        >
            {children}
        </div>
    );
}

function SectionLabel({
    number,
    children,
}: {
    number: string;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <span className="pes-mono text-[10px] font-semibold tracking-[0.12em] text-[var(--pes-purple)]">
                {number}
            </span>
            <span className="pes-mono text-[10px] font-medium tracking-[0.15em] text-[var(--pes-dim)]">
                / {children}
            </span>
        </div>
    );
}

function NavBar() {
    const [open, setOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 border-b border-[var(--pes-border)] bg-[#0B0A0F]/90 backdrop-blur-xl">
            <Container className="flex h-[76px] items-center justify-between gap-4 lg:h-[88px]">
                <Link
                    to="/"
                    className="flex shrink-0 items-center gap-2.5"
                    aria-label="PlunEStim home"
                >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--pes-purple)]">
                        <Sparkles
                            className="h-[17px] w-[17px] text-[#120018]"
                            aria-hidden="true"
                        />
                    </span>
                    <span className="pes-mono text-[15px] font-bold tracking-[-0.03em] sm:text-[16px]">
                        PlunEStim
                    </span>
                    <span className="hidden h-4 w-px bg-[var(--pes-border-strong)] lg:block" />
                    <span className="pes-mono hidden text-[9px] font-medium tracking-[0.16em] text-[var(--pes-dim)] lg:block">
                        SESSION ENGINE
                    </span>
                </Link>

                <nav className="hidden items-center gap-5 lg:flex lg:gap-8">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="text-[13.5px] text-[var(--pes-muted)] transition-colors hover:text-[var(--pes-text)]"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-4">
                    <a
                        href={DOCS_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="hidden text-[13.5px] text-[var(--pes-muted)] transition-colors hover:text-[var(--pes-text)] md:block"
                    >
                        Docs
                    </a>
                    <Link
                        to="/app"
                        className="pes-mono hidden h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[var(--pes-purple)] px-4 text-[11.5px] font-semibold tracking-[0.03em] text-[#120018] transition-colors hover:bg-[#c06bff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pes-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pes-bg)] sm:inline-flex"
                    >
                        Open app
                        <ArrowUpRight
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                        />
                    </Link>
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                        aria-controls="mobile-nav"
                        aria-label={open ? "Close menu" : "Open menu"}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--pes-border)] text-[var(--pes-text)] lg:hidden"
                    >
                        {open ? (
                            <X className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Menu className="h-4 w-4" aria-hidden="true" />
                        )}
                    </button>
                </div>
            </Container>

            {open && (
                <div
                    id="mobile-nav"
                    className="border-t border-[var(--pes-border)] bg-[var(--pes-bg)] px-5 py-4 lg:hidden"
                >
                    <nav className="flex flex-col">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                onClick={() => setOpen(false)}
                                className="border-b border-[var(--pes-border)] py-3 text-[14px] text-[var(--pes-muted)] last:border-0"
                            >
                                {link.label}
                            </a>
                        ))}
                        <a
                            href={DOCS_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="border-b border-[var(--pes-border)] py-3 text-[14px] text-[var(--pes-muted)]"
                        >
                            Docs
                        </a>
                        <Link
                            to="/app"
                            onClick={() => setOpen(false)}
                            className="pes-mono mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--pes-purple)] px-4 text-[11.5px] font-semibold tracking-[0.03em] text-[#120018]"
                        >
                            Open app
                            <ArrowUpRight
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                            />
                        </Link>
                    </nav>
                </div>
            )}
        </header>
    );
}

function SessionConsole() {
    return (
        <div
            className="relative z-10 mx-auto w-full min-w-0 max-w-[560px]"
            role="img"
            aria-label="Preview of a PES live session with three units, six channels and a Chaster trigger firing"
        >
            <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--pes-border-strong)] bg-[var(--pes-panel-3)] shadow-[0_30px_80px_rgba(0,0,0,0.55)] lg:w-full lg:max-w-[500px]">
                <div className="flex h-14 items-center justify-between border-b border-[var(--pes-border)] bg-[#100D15] px-4">
                    <div className="flex items-center gap-2.5">
                        <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-[var(--pes-purple)]">
                            <Sparkles
                                className="h-3 w-3 text-[#120018]"
                                aria-hidden="true"
                            />
                        </span>
                        <span className="pes-mono text-[10.5px] font-semibold tracking-[0.03em]">
                            PES / SESSION 04
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--pes-success)]" />
                            <span className="pes-mono text-[8.5px] font-semibold tracking-[0.11em] text-[var(--pes-success)]">
                                LIVE
                            </span>
                        </span>
                        <span className="pes-mono flex h-6 items-center gap-1.5 rounded-md border border-[#5A2026] bg-[#2A1216] px-2 text-[8px] font-bold tracking-[0.08em] text-[#FF8A78]">
                            <span className="h-[7px] w-[7px] rounded-[1px] bg-[#FF8A78]" />
                            STOP ALL
                        </span>
                    </div>
                </div>

                <div className="space-y-2.5 p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                        <span className="pes-mono text-[8.5px] font-semibold tracking-[0.14em] text-[var(--pes-dim)]">
                            UNITS
                        </span>
                        <span className="pes-mono text-[8.5px] font-medium tracking-[0.08em] text-[var(--pes-success)]">
                            3 CONNECTED
                        </span>
                    </div>

                    {units.map((unit) => (
                        <div
                            key={unit.id}
                            className={`flex items-center gap-3 rounded-xl border p-3 ${
                                unit.active
                                    ? "border-[#4D2A66] bg-[#181120]"
                                    : "border-[var(--pes-border)] bg-[var(--pes-panel)]"
                            }`}
                        >
                            <span
                                className={`pes-mono grid h-[29px] w-[29px] shrink-0 place-items-center rounded-md text-[9px] font-semibold ${
                                    unit.active
                                        ? "bg-[#2A1738] text-[var(--pes-purple-soft)]"
                                        : "bg-[#1D1924] text-[var(--pes-dim)]"
                                }`}
                            >
                                {unit.id}
                            </span>
                            <div className="min-w-0 flex-1 space-y-1.5">
                                {unit.channels.map((value, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-2"
                                    >
                                        <span
                                            className={`pes-mono w-2 text-[8px] font-semibold ${
                                                unit.active
                                                    ? "text-[var(--pes-purple-soft)]"
                                                    : "text-[var(--pes-dim)]"
                                            }`}
                                        >
                                            {index === 0 ? "A" : "B"}
                                        </span>
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#261F31]">
                                            <div
                                                className={`h-full rounded-full ${
                                                    unit.active
                                                        ? "bg-gradient-to-r from-[#AD46FF] to-[#D5A7FF]"
                                                        : "bg-[#51425F]"
                                                }`}
                                                style={{
                                                    width: `${value}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="text-right leading-none">
                                <span className="pes-mono text-[17px] font-semibold">
                                    {unit.pct}
                                </span>
                                <span className="pes-mono ml-0.5 text-[8px] text-[var(--pes-dim)]">
                                    %
                                </span>
                            </div>
                        </div>
                    ))}

                    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--pes-border)] bg-[#121018] px-3 py-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#241631]">
                            <Zap
                                className="h-3.5 w-3.5 text-[var(--pes-purple-soft)]"
                                aria-hidden="true"
                            />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="pes-mono text-[7.5px] font-semibold tracking-[0.1em] text-[var(--pes-dim)]">
                                TRIGGER FIRED
                            </div>
                            <div className="pes-mono truncate text-[10px] font-medium">
                                chaster.pillory_vote → unit 01
                            </div>
                        </div>
                        <span className="pes-mono text-[8.5px] text-[var(--pes-dim)]">
                            2s
                        </span>
                    </div>
                </div>
            </div>

            <div className="absolute -bottom-10 left-0 w-[250px] rounded-xl border border-[#4B2B66] bg-[#15101F] p-3.5 shadow-[0_16px_32px_rgba(0,0,0,0.55)] sm:-left-5">
                <div className="flex items-center justify-between">
                    <span className="pes-mono text-[8px] font-semibold tracking-[0.09em] text-[var(--pes-purple-soft)]">
                        RULE 07 / PILLORY
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-[var(--pes-success)]" />
                        <span className="pes-mono text-[7.5px] font-semibold text-[var(--pes-success)]">
                            ON
                        </span>
                    </span>
                </div>
                <div className="pes-mono mt-1 text-[16px] font-semibold tracking-[-0.03em]">
                    +10% CH A+B
                </div>
                <div className="pes-mono mt-1 text-[8.5px] text-[var(--pes-dim)]">
                    cooldown 5s · 1 action
                </div>
            </div>
        </div>
    );
}

function Hero() {
    return (
        <section className="relative overflow-hidden border-b border-[var(--pes-border)]">
            <div
                className="pointer-events-none absolute -right-60 -top-72 h-[980px] w-[980px] rounded-full"
                style={{
                    background:
                        "radial-gradient(circle at center, rgba(173,70,255,0.18), rgba(173,70,255,0.06) 45%, transparent 70%)",
                }}
            />
            <div className="pointer-events-none absolute -right-10 -top-14 hidden h-[620px] w-[620px] rounded-full border border-[#2C2338]/75 lg:block" />
            <div className="pointer-events-none absolute right-16 top-8 hidden h-[460px] w-[460px] rounded-full border border-[#2C2338]/55 lg:block" />
            <div className="pointer-events-none absolute right-[330px] top-[380px] hidden h-2 w-2 rounded-full bg-[var(--pes-purple)] shadow-[0_0_18px_#AD46FF] lg:block" />

            <Container className="relative grid grid-cols-1 gap-16 py-14 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:py-24 xl:gap-20">
                <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--pes-success)] shadow-[0_0_12px_#8EF0B299]" />
                        <span className="pes-mono text-[10px] font-medium tracking-[0.17em] text-[var(--pes-muted)]">
                            LOCAL-FIRST SESSION ENGINE
                        </span>
                    </div>

                    <h1 className="pes-mono mt-6 text-[36px] font-bold leading-[1.04] tracking-[-0.055em] sm:text-[52px] lg:text-[52px] xl:text-[60px]">
                        <span className="block">YOUR SESSION,</span>
                        <span className="block">OUT OF</span>
                        <span className="block text-[var(--pes-purple-soft)]">
                            YOUR HANDS.
                        </span>
                    </h1>

                    <p className="mt-6 max-w-[520px] text-[16px] leading-[1.65] text-[var(--pes-muted)] sm:text-[17px]">
                        PlunEStim turns live events — votes, motion, sound,
                        browser slips, toy battery — into real actions on real
                        hardware.
                    </p>
                    <p className="mt-4 max-w-[520px] text-[16px] leading-[1.65] text-[var(--pes-muted)] sm:text-[17px]">
                        Write the rules once. Then let go.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Link
                            to="/app"
                            className="pes-mono inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-[var(--pes-purple)] px-5 text-[12px] font-semibold tracking-[0.03em] text-[#120018] transition-colors hover:bg-[#c06bff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pes-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pes-bg)]"
                        >
                            Start a session
                            <ArrowRight
                                className="h-4 w-4"
                                aria-hidden="true"
                            />
                        </Link>
                        <a
                            href="#engine"
                            className="pes-mono inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border border-[var(--pes-border-strong)] px-5 text-[12px] font-medium tracking-[0.03em] text-[var(--pes-text)] transition-colors hover:border-[#4A3D5C] hover:bg-white/[0.03]"
                        >
                            <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            How it works
                        </a>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        {["3 UNITS", "6 CHANNELS", "REMOTE-READY"].map(
                            (item, index) => (
                                <span
                                    key={item}
                                    className="flex items-center gap-3"
                                >
                                    {index > 0 && (
                                        <span className="h-3 w-px bg-[var(--pes-border-strong)]" />
                                    )}
                                    <span className="pes-mono text-[9px] font-medium tracking-[0.12em] text-[var(--pes-dim)]">
                                        {item}
                                    </span>
                                </span>
                            ),
                        )}
                    </div>
                </div>

                <SessionConsole />
            </Container>
        </section>
    );
}

function IntegrationStrip() {
    return (
        <section
            aria-label="Integrations"
            className="border-b border-[var(--pes-border)] bg-[#100E15]"
        >
            <Container className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:gap-8">
                <div className="flex items-center gap-2.5 lg:w-[212px] lg:shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--pes-purple)]" />
                    <span className="pes-mono text-[9px] font-semibold tracking-[0.16em] text-[var(--pes-dim)]">
                        PLUGS INTO
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:flex lg:flex-1 lg:justify-between">
                    {[
                        "CHASTER",
                        "PURYFI",
                        "LOVENSE",
                        "BUTTPLUG",
                        "2B BOARDS",
                        "BT SENSORS",
                    ].map((name) => (
                        <span
                            key={name}
                            className="pes-mono text-[11px] font-medium tracking-[0.11em] text-[var(--pes-muted)]"
                        >
                            {name}
                        </span>
                    ))}
                </div>
            </Container>
        </section>
    );
}

function StatsStrip() {
    return (
        <section
            aria-label="Platform stats"
            className="border-b border-[var(--pes-border)]"
        >
            <Container>
                <div className="grid grid-cols-2 gap-y-8 py-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-0 lg:py-11">
                    {stats.map((stat, index) => (
                        <div
                            key={stat.label}
                            className={`flex flex-col gap-1.5 ${
                                index > 0
                                    ? "lg:border-l lg:border-[var(--pes-border)] lg:pl-6"
                                    : ""
                            }`}
                        >
                            <span className="pes-mono text-[38px] font-semibold leading-none tracking-[-0.06em] sm:text-[42px]">
                                {stat.value}
                            </span>
                            <span className="pes-mono text-[9.5px] font-medium tracking-[0.13em] text-[var(--pes-muted)]">
                                {stat.label}
                            </span>
                        </div>
                    ))}
                </div>
            </Container>
        </section>
    );
}

function RuleCard() {
    return (
        <div className="overflow-hidden rounded-2xl border border-[var(--pes-border-strong)] bg-[var(--pes-panel)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <div className="flex h-[52px] items-center justify-between border-b border-[var(--pes-border)] bg-[#100D15] px-5">
                <div className="flex items-center gap-2.5">
                    <Workflow
                        className="h-4 w-4 text-[var(--pes-purple-soft)]"
                        aria-hidden="true"
                    />
                    <span className="pes-mono text-[10.5px] font-semibold tracking-[0.05em]">
                        TRIGGER RULE 07
                    </span>
                </div>
                <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--pes-success)]" />
                    <span className="pes-mono text-[8.5px] font-semibold tracking-[0.1em] text-[var(--pes-success)]">
                        ENABLED
                    </span>
                </span>
            </div>

            <div className="space-y-2 p-5">
                <div className="pes-mono text-[8.5px] font-semibold tracking-[0.15em] text-[var(--pes-dim)]">
                    WHEN
                </div>
                <div className="flex items-center gap-3 rounded-[10px] border border-[var(--pes-border)] bg-[var(--pes-panel-3)] px-3.5 py-3">
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-[#241631]">
                        <Lock
                            className="h-3.5 w-3.5 text-[var(--pes-purple-soft)]"
                            aria-hidden="true"
                        />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="pes-mono text-[11.5px] font-medium">
                            chaster.pillory_vote
                        </div>
                        <div className="pes-mono text-[8px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                            PILLORY · EVERY VOTE
                        </div>
                    </div>
                    <span className="pes-mono rounded-md bg-[var(--pes-panel-2)] px-2 py-1 text-[7.5px] font-semibold tracking-[0.08em] text-[var(--pes-dim)]">
                        WEBHOOK
                    </span>
                </div>

                <div className="flex h-7 items-center gap-2.5 pl-3.5">
                    <span className="h-7 w-px bg-[#3A2A48]" />
                    <span className="pes-mono text-[8.5px] font-semibold tracking-[0.15em] text-[var(--pes-purple)]">
                        THEN
                    </span>
                </div>

                <div className="space-y-2">
                    {[
                        {
                            icon: SlidersHorizontal,
                            name: "unit-01 · CH A+B",
                            meta: "INTENSITY +10%",
                            value: "+10%",
                        },
                        {
                            icon: Lock,
                            name: "chaster lock",
                            meta: "ADD TIME",
                            value: "+05:00",
                        },
                        {
                            icon: Sparkles,
                            name: "profile · Slow Burn",
                            meta: "APPLY PROFILE",
                            value: "RUN",
                        },
                    ].map((action) => {
                        const Icon = action.icon;

                        return (
                            <div
                                key={action.name}
                                className="flex items-center gap-3 rounded-lg border border-[var(--pes-border)] bg-[#121018] px-3 py-2.5"
                            >
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#1D1527]">
                                    <Icon
                                        className="h-3.5 w-3.5 text-[var(--pes-purple-soft)]"
                                        aria-hidden="true"
                                    />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="pes-mono truncate text-[10.5px] font-medium">
                                        {action.name}
                                    </div>
                                    <div className="pes-mono text-[7.5px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                                        {action.meta}
                                    </div>
                                </div>
                                <span className="pes-mono text-[10px] font-semibold text-[var(--pes-purple-soft)]">
                                    {action.value}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex h-10 items-center justify-between border-t border-[var(--pes-border)] bg-[#100D15] px-5">
                <span className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-[var(--pes-success)]" />
                    <span className="pes-mono text-[8px] font-medium tracking-[0.06em] text-[var(--pes-dim)]">
                        LAST FIRED 14:32:08
                    </span>
                </span>
                <span className="pes-mono text-[8px] font-medium tracking-[0.06em] text-[var(--pes-dim)]">
                    RUNS 128×
                </span>
            </div>
        </div>
    );
}

function EngineSection() {
    return (
        <section
            id="engine"
            aria-labelledby="engine-heading"
            className="scroll-mt-24 border-b border-[var(--pes-border)] bg-[#0C0A10]"
        >
            <Container className="grid grid-cols-1 gap-14 py-20 xl:grid-cols-[520px_minmax(0,620px)] xl:justify-between xl:gap-16 xl:py-28">
                <div>
                    <SectionLabel number="01">THE ENGINE</SectionLabel>
                    <h2
                        id="engine-heading"
                        className="pes-mono mt-5 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] sm:text-[38px] lg:text-[40px]"
                    >
                        <span className="block">IF IT HAPPENS,</span>
                        <span className="block">IT HAPPENS TO YOU.</span>
                    </h2>
                    <p className="mt-5 max-w-[480px] text-[15px] leading-[1.7] text-[var(--pes-muted)] sm:text-[16px]">
                        Every input is an event. Every rule is a consequence.
                        Build the chain once and PES runs it in real time — no
                        scripting, no watching the screen.
                    </p>

                    <div className="mt-8">
                        <div className="pes-mono text-[9px] font-semibold tracking-[0.15em] text-[var(--pes-dim)]">
                            EVENT SOURCES
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {[
                                { icon: Lock, label: "CHASTER" },
                                { icon: Cpu, label: "MOTION" },
                                { icon: Radio, label: "SOUND" },
                                { icon: ScanLine, label: "BROWSER" },
                                { icon: Battery, label: "TOY BATTERY" },
                            ].map((source) => {
                                const Icon = source.icon;

                                return (
                                    <span
                                        key={source.label}
                                        className="flex h-8 items-center gap-2 rounded-md border border-[var(--pes-border)] bg-[var(--pes-panel)] px-3"
                                    >
                                        <Icon
                                            className="h-3 w-3 text-[var(--pes-purple-soft)]"
                                            aria-hidden="true"
                                        />
                                        <span className="pes-mono text-[9px] font-medium tracking-[0.08em] text-[var(--pes-muted)]">
                                            {source.label}
                                        </span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pes-mono mt-7 text-[9px] font-medium tracking-[0.1em] text-[var(--pes-dim)]">
                        EVENT → RULE → ACTION. STACK AS MANY AS YOU NEED.
                    </div>
                </div>

                <RuleCard />
            </Container>
        </section>
    );
}

function CardHeader({
    icon: Icon,
    title,
    meta,
}: {
    icon: LucideIcon;
    title: string;
    meta?: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#3A244D] bg-[#21162D]">
                <Icon
                    className="h-4 w-4 text-[var(--pes-purple-soft)]"
                    aria-hidden="true"
                />
            </span>
            <div>
                <h3 className="pes-mono text-[17px] font-semibold leading-[1.1] tracking-[-0.03em]">
                    {title}
                </h3>
                {meta && (
                    <div className="pes-mono mt-1 text-[8.5px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                        {meta}
                    </div>
                )}
            </div>
        </div>
    );
}

function MagicNumbersCard() {
    return (
        <div className="flex h-full flex-col rounded-2xl border border-[var(--pes-border)] bg-[var(--pes-panel)] p-6 transition-colors hover:border-[var(--pes-border-strong)]">
            <CardHeader
                icon={Braces}
                title="MagicNumbers"
                meta="EXPRESSIONS, NOT VALUES"
            />
            <p className="mt-3 max-w-[660px] text-[14px] leading-[1.55] text-[var(--pes-muted)]">
                Write intent instead of arithmetic. PES resolves it against the
                live value at the moment the rule fires.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {expressions.map((expression) => (
                    <div
                        key={expression.value}
                        className="flex min-h-[70px] flex-col justify-center rounded-lg border border-[var(--pes-border)] bg-[var(--pes-panel-3)] px-3.5 py-3"
                    >
                        <div className="pes-mono text-[16px] font-semibold tracking-[-0.02em] text-[var(--pes-purple-soft)]">
                            {expression.value}
                        </div>
                        <div className="pes-mono mt-1.5 text-[8.5px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                            {expression.label}
                        </div>
                    </div>
                ))}
            </div>
            <div className="pes-mono mt-auto pt-5 text-[8.5px] font-medium tracking-[0.09em] text-[var(--pes-dim)]">
                STATIC · RELATIVE · PERCENTAGE · RANDOM · PER-UNIT
            </div>
        </div>
    );
}

function ProfilesCard() {
    const heights = Array.from({ length: 30 }, (_, index) => {
        return 18 + Math.round((Math.sin(index * 0.62) + 1) * 22);
    });

    return (
        <div className="flex h-full flex-col rounded-2xl border border-[var(--pes-border)] bg-[var(--pes-panel)] p-6 transition-colors hover:border-[var(--pes-border-strong)]">
            <CardHeader
                icon={Waves}
                title="Profiles & ramps"
                meta="PRESETS THAT MOVE"
            />
            <p className="mt-3 text-[14px] leading-[1.55] text-[var(--pes-muted)]">
                Shape a session, then let phases step it up, edge it down or
                reward it.
            </p>

            <div className="mt-5 flex h-[92px] items-end gap-[3px]">
                {heights.map((height, index) => (
                    <span
                        key={index}
                        className={`min-w-0 flex-1 rounded-[2px] ${
                            index > 22
                                ? "bg-[var(--pes-purple)]"
                                : index > 14
                                  ? "bg-[#7A35A8]"
                                  : "bg-[#3A2747]"
                        }`}
                        style={{
                            height: `${height}px`,
                            opacity: 0.55 + (index / heights.length) * 0.45,
                        }}
                    />
                ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                    <span
                        key={preset}
                        className="pes-mono rounded-md border border-[var(--pes-border)] bg-[var(--pes-panel-2)] px-2.5 py-1.5 text-[8px] font-semibold tracking-[0.07em] text-[var(--pes-muted)]"
                    >
                        {preset}
                    </span>
                ))}
            </div>
            <div className="pes-mono mt-auto pt-4 text-[8px] font-medium tracking-[0.06em] text-[var(--pes-dim)]">
                APPLY ON START · STEP PER PHASE · LOWER AFTER EDGE
            </div>
        </div>
    );
}

function UnitsCard() {
    return (
        <div className="flex h-full flex-col rounded-2xl border border-[var(--pes-border)] bg-[var(--pes-panel)] p-6 transition-colors hover:border-[var(--pes-border-strong)]">
            <CardHeader icon={Cpu} title="3 units. 6 channels." />
            <p className="mt-3 text-[14px] leading-[1.55] text-[var(--pes-muted)]">
                Three 2B boards, each with two independent channels and its own
                cap.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
                {["01", "02", "03"].map((unit, index) => (
                    <div
                        key={unit}
                        className="flex min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-lg border border-[var(--pes-border)] bg-[var(--pes-panel-3)]"
                    >
                        <span className="flex items-center gap-1.5">
                            <span
                                className={`h-1 w-1 rounded-full ${
                                    index === 0
                                        ? "bg-[var(--pes-purple)]"
                                        : "bg-[#7A6B8C]"
                                }`}
                            />
                            <span
                                className={`pes-mono text-[12px] font-semibold ${
                                    index === 0
                                        ? "text-[var(--pes-text)]"
                                        : "text-[var(--pes-muted)]"
                                }`}
                            >
                                {unit}
                            </span>
                        </span>
                        <span className="pes-mono flex gap-1.5 text-[7.5px] font-semibold text-[var(--pes-dim)]">
                            <span>A</span>
                            <span>B</span>
                        </span>
                    </div>
                ))}
            </div>
            <div className="pes-mono mt-auto pt-4 text-[8.5px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                INDEPENDENT CAPS · ONE STOP-ALL
            </div>
        </div>
    );
}

function SensorsCard() {
    return (
        <div className="flex h-full flex-col rounded-2xl border border-[var(--pes-border)] bg-[var(--pes-panel)] p-6 transition-colors hover:border-[var(--pes-border-strong)]">
            <CardHeader icon={Radio} title="The room is an input." />
            <p className="mt-3 text-[14px] leading-[1.55] text-[var(--pes-muted)]">
                Motion and noise sensors can alarm, tease or interrupt the
                session.
            </p>
            <div className="mt-5 space-y-3">
                {sensors.map((sensor) => (
                    <div key={sensor.label} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="pes-mono text-[8.5px] font-semibold tracking-[0.08em] text-[var(--pes-muted)]">
                                {sensor.label}
                            </span>
                            <span
                                className={`pes-mono text-[8.5px] font-medium ${
                                    sensor.value > 50
                                        ? "text-[var(--pes-success)]"
                                        : "text-[var(--pes-dim)]"
                                }`}
                            >
                                {sensor.value}
                            </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#261F31]">
                            <div
                                className={`h-full rounded-full ${
                                    sensor.value > 50
                                        ? "bg-[var(--pes-purple)]"
                                        : "bg-[#51425F]"
                                }`}
                                style={{ width: `${sensor.value}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
            <div className="pes-mono mt-auto pt-4 text-[8.5px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                2 MOTION · 1 SOUND · LIVE ALARMS
            </div>
        </div>
    );
}

function AccessCard() {
    return (
        <div className="flex h-full flex-col rounded-2xl border border-[var(--pes-border)] bg-[var(--pes-panel)] p-6 transition-colors hover:border-[var(--pes-border-strong)]">
            <CardHeader icon={ShieldCheck} title="Hand over the keys." />
            <p className="mt-3 text-[14px] leading-[1.55] text-[var(--pes-muted)]">
                Give the right person the right access. Revoke it instantly.
            </p>
            <div className="mt-5 space-y-1.5">
                {roles.map((role) => (
                    <div
                        key={role.label}
                        className="flex h-9 items-center justify-between rounded-md border border-[var(--pes-border)] bg-[var(--pes-panel-3)] px-2.5"
                    >
                        <span className="pes-mono text-[9px] font-semibold tracking-[0.06em]">
                            {role.label}
                        </span>
                        <span
                            className={`pes-mono text-[8px] font-medium tracking-[0.06em] ${
                                role.tone === "purple"
                                    ? "text-[var(--pes-purple-soft)]"
                                    : role.tone === "text"
                                      ? "text-[var(--pes-text)]"
                                      : role.tone === "muted"
                                        ? "text-[var(--pes-muted)]"
                                        : "text-[var(--pes-dim)]"
                            }`}
                        >
                            {role.access}
                        </span>
                    </div>
                ))}
            </div>
            <div className="pes-mono mt-auto pt-4 text-[8.5px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                REMOTE-READY PERMISSIONS
            </div>
        </div>
    );
}

function ControlsSection() {
    return (
        <section
            id="features"
            aria-labelledby="controls-heading"
            className="scroll-mt-24"
        >
            <Container className="py-20 lg:py-28">
                <div className="flex flex-col justify-between gap-10 xl:flex-row xl:items-end">
                    <div className="max-w-[560px]">
                        <SectionLabel number="02">THE CONTROLS</SectionLabel>
                        <h2
                            id="controls-heading"
                            className="pes-mono mt-5 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] sm:text-[38px] lg:text-[40px]"
                        >
                            <span className="block">EVERY DIAL.</span>
                            <span className="block">ONE HAND.</span>
                        </h2>
                    </div>
                    <div className="max-w-[440px]">
                        <p className="text-[15px] leading-[1.65] text-[var(--pes-muted)]">
                            Set the limits, presets and expressions once. PES
                            handles the exact values — even when they are
                            random, relative or aimed at a channel you
                            didn&apos;t choose.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <span className="h-1 w-1 rounded-full bg-[var(--pes-purple)]" />
                            <span className="pes-mono text-[8.5px] font-medium tracking-[0.1em] text-[var(--pes-dim)]">
                                NO SCRIPTING · NO TIMING TO WATCH
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <div className="lg:col-span-7">
                        <MagicNumbersCard />
                    </div>
                    <div className="lg:col-span-5">
                        <ProfilesCard />
                    </div>
                    <div className="lg:col-span-4">
                        <UnitsCard />
                    </div>
                    <div className="lg:col-span-4">
                        <SensorsCard />
                    </div>
                    <div className="lg:col-span-4">
                        <AccessCard />
                    </div>
                </div>
            </Container>
        </section>
    );
}

function EcosystemSection() {
    return (
        <section
            id="integrations"
            aria-labelledby="integrations-heading"
            className="scroll-mt-24 border-y border-[var(--pes-border)] bg-[#0C0A10]"
        >
            <Container className="py-20 lg:py-28">
                <div className="flex flex-col justify-between gap-10 xl:flex-row xl:items-end">
                    <div className="max-w-[560px]">
                        <SectionLabel number="03">THE ECOSYSTEM</SectionLabel>
                        <h2
                            id="integrations-heading"
                            className="pes-mono mt-5 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] sm:text-[38px] lg:text-[40px]"
                        >
                            <span className="block">BRING YOUR</span>
                            <span className="block">WHOLE STACK.</span>
                        </h2>
                    </div>
                    <div className="max-w-[440px]">
                        <p className="text-[15px] leading-[1.65] text-[var(--pes-muted)]">
                            External services land on the same event bus as the
                            hardware. One rule can mix a vote, a motion sensor
                            and a toy battery.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <span className="h-1 w-1 rounded-full bg-[var(--pes-purple)]" />
                            <span className="pes-mono text-[8.5px] font-medium tracking-[0.1em] text-[var(--pes-dim)]">
                                ENABLE · DISABLE · ISOLATE A FAILURE
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-12 border-b border-[var(--pes-border)]">
                    {integrations.map((integration) => {
                        const Icon = integration.icon;

                        return (
                            <div
                                key={integration.name}
                                className="group grid gap-5 border-t border-[var(--pes-border)] py-7 transition-colors hover:bg-white/[0.015] lg:grid-cols-[42px_220px_minmax(0,1fr)_268px_36px] lg:items-center lg:gap-3"
                            >
                                <span className="pes-mono text-[9px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                                    {integration.index}
                                </span>
                                <div className="flex items-center gap-3">
                                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#3A244D] bg-[#21162D]">
                                        <Icon
                                            className="h-3.5 w-3.5 text-[var(--pes-purple-soft)]"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <div>
                                        <div className="pes-mono text-[20px] font-semibold tracking-[-0.05em]">
                                            {integration.name}
                                        </div>
                                        <div className="pes-mono mt-1 text-[8px] font-medium tracking-[0.08em] text-[var(--pes-dim)]">
                                            {integration.meta}
                                        </div>
                                    </div>
                                </div>
                                <p className="max-w-[520px] text-[14px] leading-[1.6] text-[var(--pes-muted)]">
                                    {integration.description}
                                </p>
                                <div>
                                    <div className="pes-mono text-[8px] font-semibold tracking-[0.09em] text-[var(--pes-dim)]">
                                        EVENTS + ACTIONS
                                    </div>
                                    <div className="mt-1 flex max-w-[268px] flex-wrap gap-x-3 gap-y-1">
                                        {integration.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="pes-mono text-[8.5px] font-medium tracking-[0.04em] text-[var(--pes-muted)]"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <a
                                    href={integration.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Open ${integration.name} website`}
                                    className="grid h-9 w-9 place-items-center rounded-full border border-[var(--pes-border)] bg-[var(--pes-panel-2)] text-[var(--pes-purple-soft)] transition-colors group-hover:border-[var(--pes-border-strong)]"
                                >
                                    <ArrowUpRight
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                    />
                                </a>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <span className="pes-mono text-[9px] font-semibold tracking-[0.12em] text-[var(--pes-dim)]">
                        CORE INTEGRATIONS
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {["2B UNITS", "BT SENSORS", "TRAINING"].map((tag) => (
                            <span
                                key={tag}
                                className="pes-mono rounded-md border border-[var(--pes-border)] bg-[var(--pes-panel-2)] px-2.5 py-1.5 text-[8.5px] font-medium tracking-[0.07em] text-[var(--pes-muted)]"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </Container>
        </section>
    );
}

function SafetySection() {
    return (
        <section
            id="safety"
            aria-labelledby="safety-heading"
            className="scroll-mt-24"
        >
            <Container className="grid grid-cols-1 gap-14 py-20 xl:grid-cols-[520px_minmax(0,620px)] xl:justify-between xl:gap-16 xl:py-28">
                <div>
                    <SectionLabel number="04">THE SAFETY LAYER</SectionLabel>
                    <h2
                        id="safety-heading"
                        className="pes-mono mt-5 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] sm:text-[38px] lg:text-[40px]"
                    >
                        <span className="block">THRILL, WITH A</span>
                        <span className="block text-[var(--pes-purple-soft)]">
                            SAFETY NET.
                        </span>
                    </h2>
                    <p className="mt-5 max-w-[470px] text-[15px] leading-[1.7] text-[var(--pes-muted)] sm:text-[16px]">
                        PES drives real hardware, so every action is queued,
                        reversible and capped. The safety layer is not a setting
                        you can forget to enable.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                        {[
                            "SERVER-SIDE CAPS",
                            "CANCELLABLE ACTIONS",
                            "STOP-ALL",
                        ].map((item) => (
                            <span
                                key={item}
                                className="flex h-8 items-center gap-2 rounded-md border border-[var(--pes-border)] bg-[var(--pes-panel-2)] px-3"
                            >
                                <Check
                                    className="h-3 w-3 text-[var(--pes-success)]"
                                    aria-hidden="true"
                                />
                                <span className="pes-mono text-[8px] font-medium tracking-[0.07em] text-[var(--pes-muted)]">
                                    {item}
                                </span>
                            </span>
                        ))}
                    </div>
                    <div className="pes-mono mt-8 text-[20px] font-semibold leading-[1.35] tracking-[-0.03em] sm:text-[22px]">
                        THE STOP BUTTON IS ALWAYS
                        <br />
                        ONE COMMAND AWAY.
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[var(--pes-border-strong)] bg-[var(--pes-panel)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                    <div className="flex h-[52px] items-center justify-between border-b border-[var(--pes-border)] bg-[#100D15] px-5">
                        <div className="flex items-center gap-2.5">
                            <ShieldCheck
                                className="h-4 w-4 text-[var(--pes-purple-soft)]"
                                aria-hidden="true"
                            />
                            <span className="pes-mono text-[10.5px] font-semibold tracking-[0.05em]">
                                SAFETY LAYER
                            </span>
                        </div>
                        <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--pes-success)]" />
                            <span className="pes-mono text-[8.5px] font-semibold tracking-[0.1em] text-[var(--pes-success)]">
                                ARMED
                            </span>
                        </span>
                    </div>

                    <div className="space-y-2 p-5">
                        {safetyRows.map((row) => {
                            const Icon = row.icon;

                            return (
                                <div
                                    key={row.title}
                                    className="flex items-center gap-3 rounded-lg border border-[var(--pes-border)] bg-[var(--pes-panel-3)] px-3 py-2.5"
                                >
                                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#1D1527]">
                                        <Icon
                                            className="h-3.5 w-3.5 text-[var(--pes-success)]"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <div>
                                        <div className="pes-mono text-[10.5px] font-medium">
                                            {row.title}
                                        </div>
                                        <div className="mt-0.5 text-[12px] leading-[1.3] text-[var(--pes-dim)]">
                                            {row.description}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex h-[46px] items-center justify-center gap-2 border-t border-[#5A2026] bg-[#2A1216]">
                        <CircleStop
                            className="h-3.5 w-3.5 text-[#FF8A78]"
                            aria-hidden="true"
                        />
                        <span className="pes-mono text-[10px] font-bold tracking-[0.11em] text-[#FF8A78]">
                            STOP ALL DEVICES
                        </span>
                    </div>
                </div>
            </Container>
        </section>
    );
}

function CtaSection() {
    return (
        <section className="border-t border-[var(--pes-border)] bg-[#0C0A10] py-20 lg:py-28">
            <Container>
                <div className="relative overflow-hidden rounded-3xl border border-[#3A2450] bg-[#140E1C] px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
                    <div
                        className="pointer-events-none absolute -right-40 -top-64 h-[900px] w-[900px] rounded-full"
                        style={{
                            background:
                                "radial-gradient(circle at center, rgba(173,70,255,0.2), rgba(173,70,255,0.07) 50%, transparent 70%)",
                        }}
                    />
                    <div className="pointer-events-none absolute -right-10 -top-20 hidden h-[620px] w-[620px] rounded-full border border-[#4B2B66]/70 lg:block" />
                    <div
                        aria-hidden="true"
                        className="pes-mono pointer-events-none absolute right-0 top-2 hidden select-none text-[300px] font-bold leading-none tracking-[-0.14em] text-[var(--pes-purple)] opacity-[0.055] lg:block"
                    >
                        PES
                    </div>

                    <div className="relative max-w-[620px]">
                        <div className="flex items-center gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--pes-purple)] shadow-[0_0_12px_#AD46FFCC]" />
                            <span className="pes-mono text-[9.5px] font-semibold tracking-[0.17em] text-[var(--pes-purple-soft)]">
                                YOUR MOVE
                            </span>
                        </div>
                        <h2 className="pes-mono mt-5 text-[34px] font-bold leading-[1.08] tracking-[-0.045em] sm:text-[42px] lg:text-[46px]">
                            <span className="block">THE NEXT SESSION</span>
                            <span className="block">IS ALREADY REACTING.</span>
                        </h2>
                        <p className="mt-4 max-w-[480px] text-[15px] leading-[1.6] text-[var(--pes-muted)]">
                            Write a rule. Hand over the controls. Pull the stop
                            whenever you want.
                        </p>
                        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                            <Link
                                to="/app"
                                className="pes-mono inline-flex h-12 items-center justify-center gap-2 rounded-[9px] bg-[var(--pes-purple)] px-5 text-[11.5px] font-semibold tracking-[0.03em] text-[#120018] transition-colors hover:bg-[#c06bff]"
                            >
                                Open PES
                                <ArrowRight
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                            </Link>
                            <a
                                href={DOCS_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="pes-mono inline-flex h-12 items-center justify-center gap-2 rounded-[9px] border border-[#4B3A5A] px-5 text-[11.5px] font-medium tracking-[0.03em] text-[var(--pes-text)] transition-colors hover:border-[#6b537d] hover:bg-white/[0.03]"
                            >
                                <BookOpen
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                />
                                Read the docs
                            </a>
                        </div>
                        <div className="pes-mono mt-7 flex items-center gap-2 text-[8.5px] font-medium tracking-[0.11em] text-[var(--pes-muted)]">
                            <span className="h-1 w-1 rounded-full bg-[var(--pes-success)]" />
                            LOCAL-FIRST · SELF-HOSTED · REMOTE-READY
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
}

function SiteFooter() {
    return (
        <footer className="border-t border-[var(--pes-border)]">
            <Container className="py-12 lg:py-14">
                <div className="flex flex-col justify-between gap-10 lg:flex-row lg:gap-16">
                    <div className="max-w-[420px]">
                        <div className="flex items-center gap-2.5">
                            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--pes-purple)]">
                                <Sparkles
                                    className="h-4 w-4 text-[#120018]"
                                    aria-hidden="true"
                                />
                            </span>
                            <span className="pes-mono text-[15px] font-bold tracking-[-0.03em]">
                                PlunEStim
                            </span>
                        </div>
                        <p className="mt-3 text-[13px] leading-[1.6] text-[var(--pes-muted)]">
                            A session engine for people who like their controls
                            negotiated, their rules explicit, and their stop
                            button close.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
                        {footerColumns.map((column) => (
                            <div key={column.title}>
                                <div className="pes-mono text-[8.5px] font-semibold tracking-[0.13em] text-[var(--pes-dim)]">
                                    {column.title}
                                </div>
                                <div className="mt-3 flex flex-col gap-2">
                                    {column.links.map((link) =>
                                        link.external ? (
                                            <a
                                                key={link.label}
                                                href={link.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-[13px] text-[var(--pes-muted)] transition-colors hover:text-[var(--pes-text)]"
                                            >
                                                {link.label}
                                            </a>
                                        ) : (
                                            <a
                                                key={link.label}
                                                href={link.href}
                                                className="text-[13px] text-[var(--pes-muted)] transition-colors hover:text-[var(--pes-text)]"
                                            >
                                                {link.label}
                                            </a>
                                        ),
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-10 flex flex-col justify-between gap-3 border-t border-[var(--pes-border)] pt-5 sm:flex-row sm:items-center">
                    <span className="pes-mono text-[8.5px] font-medium tracking-[0.09em] text-[var(--pes-dim)]">
                        PLUNESTIM © 2026
                    </span>
                    <span className="pes-mono text-[8.5px] font-medium tracking-[0.09em] text-[var(--pes-dim)]">
                        BUILT FOR CONSENTING ADULTS · 18+
                    </span>
                    <span className="pes-mono text-[8.5px] font-medium tracking-[0.09em] text-[var(--pes-dim)]">
                        LOCAL-FIRST BY DESIGN
                    </span>
                </div>
            </Container>
        </footer>
    );
}

export function meta() {
    return [
        { title: "PlunEStim — Your session, out of your hands" },
        {
            name: "description",
            content:
                "PlunEStim turns live events — votes, sensor motion, browser detections and toy battery — into real actions on 2B units and Lovense toys.",
        },
        { name: "theme-color", content: "#0B0A0F" },
    ];
}

export default function Homepage() {
    return (
        <div
            className="pes-landing min-h-screen overflow-x-hidden bg-[var(--pes-bg)] text-[var(--pes-text)] antialiased"
            style={themeStyle}
        >
            <NavBar />
            <main>
                <Hero />
                <IntegrationStrip />
                <StatsStrip />
                <EngineSection />
                <ControlsSection />
                <EcosystemSection />
                <SafetySection />
                <CtaSection />
            </main>
            <SiteFooter />
        </div>
    );
}
