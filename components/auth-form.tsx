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
        const result = await authClient.signUp.email({ email, password, name, callbackURL: "/upload" });
        if (result.error) { setError(result.error.message ?? "Registration failed"); return; }
      } else {
        const result = await authClient.signIn.email({ email, password, callbackURL: "/upload" });
        if (result.error) { setError(result.error.message ?? "Login failed"); return; }
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
          <div className="logo-mark w-12 h-12 mb-4">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="white" opacity="0.9" />
              <circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="1" opacity="0.5" />
              <line x1="8" y1="1.5" x2="8" y2="3" stroke="white" strokeWidth="1.4" opacity="0.7" />
              <line x1="8" y1="13" x2="8" y2="14.5" stroke="white" strokeWidth="1.4" opacity="0.7" />
              <line x1="1.5" y1="8" x2="3" y2="8" stroke="white" strokeWidth="1.4" opacity="0.7" />
              <line x1="13" y1="8" x2="14.5" y2="8" stroke="white" strokeWidth="1.4" opacity="0.7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight gradient-text">Meridian</h1>
          <p className="mt-2 text-base text-slate-400">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Full name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-glass px-4 py-3 text-base"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-glass px-4 py-3 text-base"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-glass px-4 py-3 text-base"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="status-error rounded-xl px-4 py-3 text-sm font-medium">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-1">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait…
                </span>
              ) : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>No account?{" "}
                <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  Sign up free
                </Link>
              </>
            ) : (
              <>Already have an account?{" "}
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Modality chips */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {[{ icon: "🎙️", label: "Speech" }, { icon: "📄", label: "OCR" }, { icon: "👁️", label: "Visual" }].map(({ icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-sm text-slate-400">
              {icon} {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
