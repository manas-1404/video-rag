"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

type Props = { mode: "login" | "register" };

export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const result = await authClient.signUp.email({
          email,
          password,
          name,
          callbackURL: "/upload",
        });
        if (result.error) {
          setError(result.error.message ?? "Registration failed");
          return;
        }
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/upload",
        });
        if (result.error) {
          setError(result.error.message ?? "Login failed");
          return;
        }
      }
      router.push("/upload");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="logo-mark w-11 h-11 mb-4">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="white" opacity="0.9" />
              <circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="1" opacity="0.4" />
              <line x1="8" y1="1.5" x2="8" y2="3" stroke="white" strokeWidth="1.2" opacity="0.6" />
              <line x1="8" y1="13" x2="8" y2="14.5" stroke="white" strokeWidth="1.2" opacity="0.6" />
              <line x1="1.5" y1="8" x2="3" y2="8" stroke="white" strokeWidth="1.2" opacity="0.6" />
              <line x1="13" y1="8" x2="14.5" y2="8" stroke="white" strokeWidth="1.2" opacity="0.6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Meridian</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        <div className="glass-card p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-glass w-full px-3.5 py-2.5 text-sm"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-glass w-full px-3.5 py-2.5 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-glass w-full px-3.5 py-2.5 text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="status-error rounded-lg px-3.5 py-2.5 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-sm mt-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait…
                </span>
              ) : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link href="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  Sign up free
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Modality chips below */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {[
            { icon: "🎙️", label: "Speech" },
            { icon: "📄", label: "OCR" },
            { icon: "👁️", label: "Visual" },
          ].map(({ icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs glass"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
              {icon} {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
