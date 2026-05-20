"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

interface InviteInfo {
  email: string;
  firstName: string;
}

export default function StaffSetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/staff-setup?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(data.error ?? "Unable to load invite");
        setInvite(data.data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/staff-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to set password");
      router.push(
        `/login?email=${encodeURIComponent(data.email)}&staffSetup=ok`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-200">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading invite…</span>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Can't open this invite
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      <form
        onSubmit={onSubmit}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full"
      >
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-[#ee0000] dark:text-[#ff4444]" />
          <span className="text-xs font-semibold uppercase tracking-wide text-[#ee0000] dark:text-[#ff4444]">
            Admin invitation
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome, {invite?.firstName}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1 mb-6 text-sm">
          Set a password for <strong className="text-gray-900 dark:text-gray-100">{invite?.email}</strong> to finish
          setting up your admin account.
        </p>

        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
          </span>
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </label>

        <label className="block mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Confirm password
          </span>
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
          />
        </label>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Use at least 8 characters. Mix letters, numbers, and symbols.
        </p>

        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm mb-3" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-[#ee0000] to-[#ff4444] hover:shadow-lg text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
        >
          {submitting ? "Setting up…" : "Set password & continue"}
        </button>
      </form>
    </div>
  );
}
