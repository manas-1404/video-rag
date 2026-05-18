import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/videos");

  return (
    <main className="flex-1 flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-20 text-center relative">
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
          }}
        />

        {/* Badge */}
        <div className="fade-up fade-up-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border text-xs font-medium mb-8"
          style={{ borderColor: "rgba(99,102,241,0.3)", color: "var(--text-secondary)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
          Multimodal Video Intelligence
        </div>

        {/* Headline */}
        <h1 className="fade-up fade-up-2 text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-tight mb-6 max-w-3xl">
          <span className="gradient-text">Ask anything.</span>
          <br />
          <span style={{ color: "var(--text-primary)" }}>Find the exact moment.</span>
        </h1>

        {/* Sub */}
        <p className="fade-up fade-up-3 text-lg max-w-xl leading-relaxed mb-10"
          style={{ color: "var(--text-secondary)" }}>
          Meridian searches your video across three intelligence layers simultaneously —
          speech, on-screen text, and visual context — and pins the precise timestamp.
        </p>

        {/* CTA */}
        <div className="fade-up fade-up-4 flex flex-col sm:flex-row items-center gap-3 mb-20">
          <Link href="/register" className="btn-primary px-7 py-3 text-sm">
            Start for free
          </Link>
          <Link href="/login" className="btn-ghost px-7 py-3 text-sm">
            Sign in
          </Link>
        </div>

        {/* Three pillars */}
        <div className="fade-up fade-up-4 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
          <ModalityCard
            icon="🎙️"
            label="Speech"
            description="Full transcript search with word-level timestamps from whisper ASR"
            color="rgba(96,165,250,0.15)"
            border="rgba(96,165,250,0.25)"
          />
          <ModalityCard
            icon="📄"
            label="On-screen Text"
            description="Every frame scanned for text — slides, captions, signs, code"
            color="rgba(251,191,36,0.12)"
            border="rgba(251,191,36,0.22)"
          />
          <ModalityCard
            icon="👁️"
            label="Visual Context"
            description="Scene-level understanding of what's happening on screen"
            color="rgba(52,211,153,0.12)"
            border="rgba(52,211,153,0.22)"
          />
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 max-w-3xl mx-auto w-full">
        <p className="text-xs font-semibold uppercase tracking-widest mb-8 text-center"
          style={{ color: "var(--text-muted)" }}>How it works</p>
        <ol className="space-y-6">
          {[
            { step: "01", title: "Upload your video", body: "Drop any MP4, MOV, or WebM up to 500 MB. Meridian starts processing immediately." },
            { step: "02", title: "Parallel indexing", body: "Speech is transcribed, frames are OCR'd, and scenes are described — all stored as vector embeddings." },
            { step: "03", title: "Ask in plain language", body: "Type any question. The agent cross-searches all three channels and returns the best matching timestamp." },
          ].map(({ step, title, body }) => (
            <li key={step} className="glass-card p-6 flex gap-5 items-start">
              <span className="font-mono text-xs font-bold shrink-0 mt-0.5"
                style={{ color: "var(--accent-indigo)" }}>{step}</span>
              <div>
                <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{title}</p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 text-xs" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}>
        Meridian — Multimodal Video Intelligence
      </footer>
    </main>
  );
}

function ModalityCard({
  icon, label, description, color, border,
}: {
  icon: string; label: string; description: string; color: string; border: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 text-left"
      style={{ background: color, border: `1px solid ${border}` }}
    >
      <div className="text-2xl mb-3">{icon}</div>
      <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>{label}</p>
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{description}</p>
    </div>
  );
}
