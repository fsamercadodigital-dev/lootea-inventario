"use client";

import { useEffect, useState } from "react";
import {
  FIELD_LABELS,
  PROVIDER_LABELS,
  SECRET_FIELDS,
  type AccessService,
  type EmailProvider,
  type SecretField,
} from "@/lib/constants";
import type { EmailAccessState, SecretPresence, VaultState } from "@/lib/types";
import { parseSecretPatch } from "@/lib/validators";
import { ApiError, apiJson } from "./api";

type SavedAccess = {
  profile: {
    updatedAt: string;
    hasAccess: boolean;
    meta: SecretPresence;
    email: EmailAccessState;
    vault: VaultState;
  };
};

export function AccessSection({
  profileId,
  service,
  title,
  description,
  presence,
  email,
  vault,
  onSaved,
}: {
  profileId: string;
  service: AccessService;
  title: string;
  description: string;
  presence: SecretPresence;
  email?: EmailAccessState;
  vault: VaultState;
  onSaved: (next: SavedAccess["profile"]) => void;
}) {
  const [drafts, setDrafts] = useState<Record<SecretField, string>>({
    username: "",
    password: "",
    totp: "",
    recovery: "",
  });
  const [clearing, setClearing] = useState<Record<SecretField, boolean>>({
    username: false,
    password: false,
    totp: false,
    recovery: false,
  });
  const [shown, setShown] = useState<Partial<Record<SecretField, string>>>({});
  const [provider, setProvider] = useState(email?.provider ?? "");
  const [otherLabel, setOtherLabel] = useState(email?.otherLabel ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [pendingField, setPendingField] = useState<SecretField | null>(null);
  const ready = vault === "ready";

  useEffect(() => {
    if (!Object.keys(shown).length) return;
    const timer = window.setTimeout(() => setShown({}), 45000);
    return () => window.clearTimeout(timer);
  }, [shown]);

  function setDraft(field: SecretField, value: string) {
    setDrafts((current) => ({ ...current, [field]: value }));
    setClearing((current) => ({ ...current, [field]: false }));
  }

  async function reveal(field: SecretField) {
    setError(null);
    try {
      const body = await apiJson<{ value: string }>(`/api/profiles/${profileId}/secrets/reveal`, {
        method: "POST",
        json: { service, field },
      });
      setShown((current) => ({ ...current, [field]: body.value }));
      setPendingField(null);
      setPhrase("");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "step_up_required") {
        setPendingField(field);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Não foi possível revelar.");
    }
  }

  async function confirmPhrase() {
    setError(null);
    setPending(true);
    try {
      await apiJson("/api/step-up", { method: "POST", json: { passphrase: phrase } });
      const field = pendingField;
      setPhrase("");
      if (field) await reveal(field);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível confirmar.");
    } finally {
      setPending(false);
    }
  }

  async function copy(field: SecretField) {
    const value = shown[field];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copiado.");
      setError(null);
    } catch {
      setError("Não foi possível copiar. O dado continua visível para copiar à mão.");
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const payload: Record<string, unknown> = { service };
    if (service === "email") {
      payload.provider = provider;
      payload.otherLabel = otherLabel;
    }
    for (const field of SECRET_FIELDS) {
      if (clearing[field]) payload[field] = null;
      else if (drafts[field]) payload[field] = drafts[field];
    }
    const parsed = parseSecretPatch(payload);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setPending(true);
    try {
      const body = await apiJson<SavedAccess>(`/api/profiles/${profileId}/secrets`, {
        method: "PUT",
        json: parsed.value,
      });
      setDrafts({ username: "", password: "", totp: "", recovery: "" });
      setClearing({ username: false, password: false, totp: false, recovery: false });
      setShown({});
      setMessage("Acesso salvo.");
      onSaved(body.profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar. Os dados continuam neste formulário.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-2xl">{title}</h2>
      <p className="hint mt-1">{description}</p>
      {!ready ? (
        <p className="alert mt-4" role="alert">
          O cofre de acesso não está configurado neste servidor. Estes campos ficam bloqueados.
        </p>
      ) : (
        <form className="mt-4 grid gap-4" onSubmit={save} autoComplete="off" noValidate>
          {service === "email" ? (
            <>
              <label className="field">
                <span>Provedor</span>
                <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                  <option value="">Selecione</option>
                  {(Object.entries(PROVIDER_LABELS) as [EmailProvider, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {provider === "other" ? (
                <label className="field">
                  <span>Qual provedor</span>
                  <input value={otherLabel} onChange={(event) => setOtherLabel(event.target.value)} />
                </label>
              ) : null}
            </>
          ) : null}
          {SECRET_FIELDS.map((field) => {
            const filled = presence[field];
            const visible = shown[field];
            return (
              <div key={field} className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold">{FIELD_LABELS[field]}</span>
                  <span className="hint">{filled ? "Gravado e oculto" : "Não informado"}</span>
                </div>
                {filled ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary" onClick={() => reveal(field)}>
                      Revelar
                    </button>
                    {visible ? (
                      <button type="button" className="btn btn-secondary" onClick={() => copy(field)}>
                        Copiar
                      </button>
                    ) : null}
                    {visible ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setShown((current) => ({ ...current, [field]: undefined }))}
                      >
                        Ocultar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setClearing((current) => ({ ...current, [field]: !current[field] }))}
                    >
                      {clearing[field] ? "Desfazer remoção" : "Remover"}
                    </button>
                  </div>
                ) : null}
                {visible ? (
                  <textarea className="control min-h-11" readOnly value={visible} aria-label={`${FIELD_LABELS[field]} revelado`} />
                ) : null}
                {field === "recovery" ? (
                  <textarea
                    value={drafts[field]}
                    autoComplete="off"
                    placeholder={filled ? "Substituir — em branco mantém o atual" : "Incluir"}
                    onChange={(event) => setDraft(field, event.target.value)}
                  />
                ) : (
                  <input
                    type={field === "username" ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={drafts[field]}
                    placeholder={filled ? "Substituir — em branco mantém o atual" : "Incluir"}
                    onChange={(event) => setDraft(field, event.target.value)}
                  />
                )}
              </div>
            );
          })}
          {pendingField ? (
            <div className="inset grid gap-3 p-3">
              <p className="text-sm font-bold">Confirme a frase de acesso para revelar este dado.</p>
              <label className="field">
                <span>Frase de acesso do painel</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void confirmPhrase();
                    }
                  }}
                />
              </label>
              <div className="flex gap-2">
                <button className="btn btn-primary" type="button" disabled={pending} onClick={() => void confirmPhrase()}>
                  {pending ? "Confirmando…" : "Confirmar"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setPendingField(null);
                    setPhrase("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
          {message ? (
            <p className="ok" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Salvando…" : service === "meta" ? "Salvar acesso Meta" : "Salvar acesso do e-mail"}
          </button>
        </form>
      )}
    </section>
  );
}
