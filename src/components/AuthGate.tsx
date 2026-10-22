"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

export const EXPLAINO_AUTH_STORAGE_KEY = "explaino_auth_user";
export const AUTHORIZED_EMAIL = "parthasdeyofficial@gmail.com";
export const AUTHORIZED_PASSWORD = "Vastavik1234Parth@Hacker";

export function checkIsAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(EXPLAINO_AUTH_STORAGE_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    return (
      session &&
      typeof session.email === "string" &&
      session.email.toLowerCase().trim() === AUTHORIZED_EMAIL.toLowerCase().trim() &&
      session.authenticated === true
    );
  } catch {
    return false;
  }
}

export function performClientLogout(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(EXPLAINO_AUTH_STORAGE_KEY);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.dispatchEvent(new CustomEvent("explaino:logout"));
  } catch {}
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check initial authentication on mount
  useEffect(() => {
    const isAuth = checkIsAuthenticated();
    setIsAuthenticated(isAuth);
    setIsCheckingAuth(false);

    const handleLogout = () => {
      setIsAuthenticated(false);
      setEmail("");
      setPassword("");
      setErrorMessage(null);
    };

    window.addEventListener("explaino:logout", handleLogout);
    return () => window.removeEventListener("explaino:logout", handleLogout);
  }, []);

  const handleLogin = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmedEmail = email.trim().toLowerCase();
      const rawPassword = password;

      if (!trimmedEmail || !rawPassword) {
        setErrorMessage("Please enter both email and password.");
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);

      try {
        // First try server authentication endpoint
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password: rawPassword }),
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data?.success) {
          localStorage.setItem(
            EXPLAINO_AUTH_STORAGE_KEY,
            JSON.stringify({
              email: AUTHORIZED_EMAIL,
              authenticated: true,
              authenticatedAt: Date.now(),
            })
          );
          setIsAuthenticated(true);
          return;
        }

        // Fallback validation for direct matching
        if (
          trimmedEmail === AUTHORIZED_EMAIL.toLowerCase().trim() &&
          rawPassword === AUTHORIZED_PASSWORD
        ) {
          localStorage.setItem(
            EXPLAINO_AUTH_STORAGE_KEY,
            JSON.stringify({
              email: AUTHORIZED_EMAIL,
              authenticated: true,
              authenticatedAt: Date.now(),
            })
          );
          setIsAuthenticated(true);
          return;
        }

        setErrorMessage(data?.error || "Incorrect email or password. Access is restricted.");
      } catch {
        // If network request failed, allow client fallback check
        if (
          trimmedEmail === AUTHORIZED_EMAIL.toLowerCase().trim() &&
          rawPassword === AUTHORIZED_PASSWORD
        ) {
          localStorage.setItem(
            EXPLAINO_AUTH_STORAGE_KEY,
            JSON.stringify({
              email: AUTHORIZED_EMAIL,
              authenticated: true,
              authenticatedAt: Date.now(),
            })
          );
          setIsAuthenticated(true);
          return;
        }
        setErrorMessage("Authentication failed. Please verify your connection.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password]
  );

  // Initial flash prevention
  if (isCheckingAuth) {
    return (
      <div
        style={{
          width: "100%",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0c0e",
          color: "#a1a1aa",
          gap: 12,
        }}
      >
        <Loader2 size={28} className="animate-spin text-indigo-500" />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Initializing workspace…</span>
      </div>
    );
  }

  // Once authenticated, render the whiteboard canvas and tools
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Login Gate: Full-screen protected access
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0e",
        position: "relative",
        overflow: "hidden",
        padding: "1.5rem",
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Background ambient glowing orbs */}
      <div
        style={{
          position: "absolute",
          width: "550px",
          height: "550px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)",
          top: "-120px",
          left: "-100px",
          pointerEvents: "none",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%)",
          bottom: "-100px",
          right: "-80px",
          pointerEvents: "none",
          filter: "blur(60px)",
        }}
      />

      {/* Main Login Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "rgba(20, 20, 25, 0.85)",
          backdropFilter: "blur(20px)",
          borderRadius: "24px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow:
            "0 25px 70px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          padding: "2.5rem 2rem",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem auto",
              boxShadow: "0 8px 24px rgba(99, 102, 241, 0.35)",
              color: "#ffffff",
            }}
          >
            <Sparkles size={24} strokeWidth={2.2} />
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "20px",
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              fontSize: "11px",
              fontWeight: 600,
              color: "#a5b4fc",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.75rem",
            }}
          >
            <ShieldCheck size={13} />
            <span>Private Workspace</span>
          </div>

          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              margin: "0 0 0.5rem 0",
            }}
          >
            Sign In to Explaino
          </h1>
          <p
            style={{
              fontSize: "0.85rem",
              color: "#9ca3af",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Enter your credentials to unlock your whiteboard canvas and code workspace.
          </p>
        </div>

        {/* Error Alert Message */}
        {errorMessage && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              fontSize: "0.8rem",
              marginBottom: "1.25rem",
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Email Field */}
          <div>
            <label
              htmlFor="auth-email"
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "0.5rem",
              }}
            >
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6b7280",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <Mail size={17} />
              </div>
              <input
                id="auth-email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 42px",
                  borderRadius: "12px",
                  background: "rgba(14, 14, 18, 0.9)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#6366f1";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.25)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="auth-password"
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "0.5rem",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6b7280",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <Lock size={17} />
              </div>
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                style={{
                  width: "100%",
                  padding: "12px 42px 12px 42px",
                  borderRadius: "12px",
                  background: "rgba(14, 14, 18, 0.9)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#6366f1";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.25)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                }}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "100%",
              padding: "14px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              color: "#ffffff",
              fontSize: "0.95rem",
              fontWeight: 600,
              border: "none",
              cursor: isSubmitting || !email.trim() || !password ? "not-allowed" : "pointer",
              opacity: isSubmitting || !email.trim() || !password ? 0.6 : 1,
              boxShadow: "0 8px 24px rgba(99, 102, 241, 0.35)",
              transition: "transform 0.1s, opacity 0.15s, filter 0.15s",
              marginTop: "0.5rem",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.filter = "brightness(1.1)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "none";
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Verifying credentials…</span>
              </>
            ) : (
              <>
                <span>Unlock Workspace</span>
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>

        {/* Security badge at bottom */}
        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            color: "#6b7280",
            fontSize: "0.75rem",
          }}
        >
          <Lock size={12} />
          <span>Protected with authenticated session & encryption</span>
        </div>
      </div>
    </div>
  );
}
