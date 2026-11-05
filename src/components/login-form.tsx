"use client";

import { useState } from "react";

export function LoginForm({ configured }: { configured: boolean }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ passphrase }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message || "Não foi possível entrar.");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Não foi possível entrar. A frase continua neste campo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="shell flex min-h-screen items-center py-10">
      <section className="panel w-full max-w-md p-6 sm:p-8">
        <p className="text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
          FSA Mercado Digital
        </p>
        <h1 className="mt-2 text-4xl">Lootea</h1>
        <p className="hint mt-2">Inventário interno de perfis e Business Managers.</p>
        {configured ? (
          <form className="mt-6 grid gap-4" onSubmit={submit} noValidate>
            <label className="field">
              <span>Frase de acesso</span>
              <input
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                required
              />
            </label>
            {error ? (
              <p className="alert" role="alert">
                {error}
              </p>
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>
        ) : (
          <p className="alert mt-6" role="alert">
            O acesso ainda não foi configurado neste servidor.
          </p>
        )}
        <p className="hint mt-6">O status dos ativos é manual. Este painel não consulta a Meta.</p>
      </section>
    </main>
  );
}
