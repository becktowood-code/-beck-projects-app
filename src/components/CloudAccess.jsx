import React, { useEffect, useMemo, useState } from "react";
import {
  supabase,
  cloudConfigured,
  configurationError,
} from "../storage/supabase.js";
import { CloudInvoiceRepository } from "../storage/cloudRepository.js";
import { repository as localRepository } from "../storage/repository.js";
import { Logo } from "./Preview.jsx";
export default function CloudAccess({ children }) {
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(Boolean(supabase)),
    [recovery, setRecovery] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let active = true,
      observed = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, value) => {
      observed = true;
      if (active) {
        setSession(value);
        setLoading(false);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        if (event === "SIGNED_OUT") setRecovery(false);
      }
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || observed) return;
        if (error) setError(error.message);
        else setSession(data.session);
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  const repository = useMemo(
    () =>
      session
        ? new CloudInvoiceRepository(supabase, session.user.id)
        : localRepository,
    [session?.user.id],
  );
  if (configurationError)
    return (
      <AccessFrame>
        <h1>Cloud connection needs setup</h1>
        <p role="alert">{configurationError}</p>
        <p>Your existing browser records have not been removed.</p>
      </AccessFrame>
    );
  if (!cloudConfigured)
    return children({ repository: localRepository, user: null, signOut: null });
  if (loading)
    return (
      <AccessFrame>
        <h1>Opening your account…</h1>
      </AccessFrame>
    );
  if (!session || recovery)
    return (
      <AccessFrame>
        <Login
          recovery={recovery}
          initialError={error}
          complete={() => setRecovery(false)}
        />
      </AccessFrame>
    );
  return children({
    repository,
    user: session.user,
    signOut: async () => {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
  });
}
function AccessFrame({ children }) {
  return (
    <>
      <header className="top">
        <Logo />
      </header>
      <main className="auth-card card">{children}</main>
    </>
  );
}
function Login({ recovery, initialError, complete }) {
  const [mode, setMode] = useState("signin"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    [message, setMessage] = useState("");
  const label = recovery
    ? "Set new password"
    : mode === "signup"
      ? "Create account"
      : mode === "reset"
        ? "Send reset link"
        : "Sign in";
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let result;
      if (recovery) result = await supabase.auth.updateUser({ password });
      else if (mode === "signup")
        result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        });
      else if (mode === "reset")
        result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin,
        });
      else result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (recovery) {
        setPassword("");
        complete();
      } else if (mode === "signup" && !result.data.session)
        setMessage(
          "Check your email to confirm your account, then sign in here.",
        );
      else if (mode === "reset")
        setMessage(
          "If this email has an account, a password reset link will be sent.",
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">Your invoices, on every device</p>
      <h1>{label}</h1>
      <p>
        Use the same invoice-app account on your computer and phone. Records and
        receipts stay private to your account.
      </p>
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="notice success">
          {message}
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {!recovery && (
            <label>
              Email
              <input
                aria-label="Email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {(recovery || mode !== "reset") && (
            <label>
              Password
              <input
                aria-label="Password"
                type="password"
                autoComplete={
                  recovery || mode === "signup"
                    ? "new-password"
                    : "current-password"
                }
                minLength={mode === "signup" || recovery ? 12 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mode === "signup" && (
            <p className="muted">
              Use at least 12 characters. Signing up creates a private invoice
              workspace.
            </p>
          )}
          <button type="submit">{busy ? "Please wait…" : label}</button>
        </fieldset>
      </form>
      {!recovery && (
        <div className="button-row auth-options">
          {[
            ["signin", "Sign in"],
            ["signup", "Create account"],
            ["reset", "Forgot password?"],
          ]
            .filter(([m]) => m !== mode)
            .map(([m, title]) => (
              <button
                key={m}
                className="quiet"
                disabled={busy}
                onClick={() => {
                  setMode(m);
                  setPassword("");
                  setError("");
                  setMessage("");
                }}
              >
                {title}
              </button>
            ))}
        </div>
      )}
      <p className="muted">
        Existing invoices on this browser can be copied into your account after
        signing in, under Backup & storage.
      </p>
    </>
  );
}
