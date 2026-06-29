import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import MeridianMark from "@/components/meridian-mark";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/videos");

  return (
    <main className="flex-1 flex flex-col overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-16 pb-14 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }} />

        <div className="fade-up fade-up-1 flex items-center gap-3 mb-8">
          <MeridianMark size={40} />
          <span className="text-2xl font-bold tracking-tight gradient-text">Meridian</span>
        </div>

        <h1 className="fade-up fade-up-2 text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-5 max-w-4xl">
          <span className="text-slate-100">Search inside your</span>
          <br />
          <span className="gradient-text">lectures and podcasts.</span>
        </h1>

        <p className="fade-up fade-up-3 text-lg text-slate-400 max-w-xl leading-relaxed mb-5">
          Upload a lecture, podcast, or conference talk. Ask it a question in plain English.
          Get the exact moment — timestamped, and ready to jump to.
        </p>

        <div className="fade-up fade-up-3 flex items-center justify-center gap-2 flex-wrap mb-10">
          <span className="text-sm text-slate-600">Works best with</span>
          {["Lectures", "Podcasts", "Conference talks", "Interviews", "Tutorials"].map((t) => (
            <span key={t}
              className="text-sm px-2.5 py-1 rounded-full text-slate-400"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
              {t}
            </span>
          ))}
        </div>

        <div className="fade-up fade-up-4 flex items-center gap-3 mb-12">
          <Link href="/register" className="btn-primary text-base px-7 py-3">
            Get started free
          </Link>
          <Link href="/login" className="btn-ghost text-base px-7 py-3">
            Sign in
          </Link>
        </div>

        {/* UI Mockup */}
        <div className="fade-up fade-up-4 w-full max-w-3xl rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.12)" }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.3)" }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,80,70,0.55)" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,190,50,0.55)" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(50,210,80,0.55)" }} />
            <span className="ml-3 text-sm text-slate-600 font-mono">meridian · mit-ocw-6.006-lecture.mp4</span>
          </div>

          <div className="flex" style={{ minHeight: "260px" }}>
            {/* Video side */}
            <div className="w-[52%] p-4 flex flex-col gap-3" style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="rounded-xl flex-1 flex items-center justify-center relative overflow-hidden"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.07)", minHeight: "140px" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.4)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 2l9 5-9 5V2z" fill="#a5b4fc" />
                  </svg>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="h-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-0.5 rounded-full w-[62%]" style={{ background: "linear-gradient(90deg, #6366f1, #22d3ee)" }} />
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.22)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-mono text-cyan-400">▶ 38:12</span>
                  <span className="signal-transcript text-sm font-semibold px-2 py-0.5 rounded-full">Speech</span>
                </div>
                <p className="text-sm text-slate-400 italic">&ldquo;…gradient updates move the model toward a local minimum on the loss surface…&rdquo;</p>
              </div>
            </div>

            {/* Chat side */}
            <div className="flex-1 flex flex-col justify-between p-4 gap-3">
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="bubble-user text-sm px-3 py-2 max-w-[85%]">
                    When does she explain gradient descent?
                  </div>
                </div>
                <div className="bubble-ai text-sm px-3 py-2.5 leading-relaxed text-slate-300">
                  She covers it at <span className="text-slate-100 font-medium">38:12</span> — explaining how gradient updates drive the model toward a local minimum, with the loss surface drawn on the whiteboard.
                </div>
                <span className="timestamp-badge text-sm">▶ Jump to 38:12</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <span className="text-sm text-slate-600 flex-1">Ask anything about the lecture…</span>
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#5b5fef,#7c3aed)" }}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M8 4.5H1M4.5 1l3.5 3.5-3.5 3.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── EXAMPLE QUERIES ──────────────────────────────────── */}
      <section className="px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-slate-600 text-center mb-5 uppercase tracking-widest font-bold">Things people actually ask</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { q: "When did the speaker first mention the Doppler effect?", tag: "Lecture" },
              { q: "Summarize the main argument from the second half", tag: "Podcast" },
              { q: "What frameworks were shown on the slides at 14:30?", tag: "Conference talk" },
              { q: "Find every time the host brings up interest rates", tag: "Interview" },
            ].map(({ q, tag }) => (
              <div key={q} className="glass-card px-4 py-3.5 flex items-start gap-3 text-left">
                <span className="text-slate-600 mt-0.5 shrink-0 text-sm">↗</span>
                <div>
                  <p className="text-base text-slate-300 leading-snug">{q}</p>
                  <span className="text-sm text-slate-500 mt-1.5 block">{tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THREE CHANNELS ───────────────────────────────────── */}
      <section className="px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-600 text-center mb-3">How Meridian sees your video</p>
          <p className="text-2xl font-semibold text-slate-100 text-center mb-8">Three layers. One answer.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                icon: "🎙️",
                label: "Speech",
                color: "rgba(96,165,250,0.12)",
                border: "rgba(96,165,250,0.25)",
                glow: "rgba(96,165,250,0.08)",
                accent: "#93c5fd",
                lines: ["Word-level timestamps", "Verbatim accuracy", "No hallucination"],
              },
              {
                icon: "📄",
                label: "On-screen Text",
                color: "rgba(251,191,36,0.1)",
                border: "rgba(251,191,36,0.25)",
                glow: "rgba(251,191,36,0.07)",
                accent: "#fcd34d",
                lines: ["Slides & whiteboards", "Captions & overlays", "Code & diagrams"],
              },
              {
                icon: "👁️",
                label: "Visual Context",
                color: "rgba(52,211,153,0.1)",
                border: "rgba(52,211,153,0.25)",
                glow: "rgba(52,211,153,0.07)",
                accent: "#6ee7b7",
                lines: ["Scene understanding", "Gestures & actions", "Objects & people"],
              },
            ].map(({ icon, label, color, border, glow, accent, lines }) => (
              <div key={label} className="rounded-2xl p-6 flex flex-col gap-4"
                style={{ background: color, border: `1px solid ${border}`, boxShadow: `0 8px 32px ${glow}` }}>
                <div className="text-4xl">{icon}</div>
                <p className="text-lg font-bold text-slate-100">{label}</p>
                <ul className="space-y-2">
                  {lines.map((l) => (
                    <li key={l} className="flex items-center gap-2 text-sm text-slate-400">
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: accent }} />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-600 text-center mb-3">Simple by design</p>
          <p className="text-2xl font-semibold text-slate-100 text-center mb-8">Up and running in minutes</p>

          <div className="space-y-3">
            {[
              {
                step: "01",
                icon: "⬆️",
                title: "Upload your lecture or podcast",
                body: "Drop any MP4, MOV, or WebM — up to 20 minutes. Meridian starts indexing automatically in the background.",
              },
              {
                step: "02",
                icon: "⚡",
                title: "Everything gets indexed",
                body: "Speech, on-screen text, and visual scenes are processed in parallel. Every second of the video becomes searchable.",
              },
              {
                step: "03",
                icon: "💬",
                title: "Ask it anything",
                body: "Type a question in plain English. Get a precise answer with a timestamp you can jump to instantly.",
              },
            ].map(({ step, icon, title, body }) => (
              <div key={step} className="glass-card p-6 flex gap-5 items-start">
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.22)" }}>
                  {icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm font-bold text-indigo-500">{step}</span>
                    <p className="font-semibold text-base text-slate-100">{title}</p>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ───────────────────────────────────────── */}
      <section className="px-6 py-12 text-center">
        <div className="max-w-lg mx-auto">
          <p className="text-3xl font-bold text-slate-100 mb-4">
            Stop scrubbing.<br />
            <span className="gradient-text">Start asking.</span>
          </p>
          <p className="text-slate-500 mb-8">Free to get started. No credit card required.</p>
          <Link href="/register" className="btn-primary text-base px-10 py-3.5">
            Try Meridian free
          </Link>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="text-center py-8 text-sm text-slate-700" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        © 2025 Meridian · Built for lectures, podcasts, and long-form talks
      </footer>

    </main>
  );
}
