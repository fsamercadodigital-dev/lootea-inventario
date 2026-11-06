"use client";

import Link from "next/link";
import { useState } from "react";
import type { Status } from "@/lib/constants";
import { formatDateTime, profileLabel } from "@/lib/format";
import type { BmPublic, ProfileDetail, ProfilePublic } from "@/lib/types";
import { parseProfileInput } from "@/lib/validators";
import { AccessSection } from "./access-section";
import { ApiError, apiJson, setCsrf } from "./api";
import { StatusSelect } from "./status-select";
import { useTimedMessage } from "./use-timed-message";

export function ProfileEditor({
  detail,
  bms,
  csrfToken,
}: {
  detail: ProfileDetail;
  bms: BmPublic[];
  csrfToken: string;
}) {
  setCsrf(csrfToken);
  const [profile, setProfile] = useState(detail);
  const [displayName, setDisplayName] = useState(detail.displayName ?? "");
  const [metaProfileId, setMetaProfileId] = useState(detail.metaProfileId ?? "");
  const [profileUrl, setProfileUrl] = useState(detail.profileUrl ?? "");
  const [notes, setNotes] = useState(detail.notes ?? "");
  const [bmIds, setBmIds] = useState(detail.bmIds);
  const [message, setMessage] = useTimedMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function changeStatus(status: Status) {
    try {
      const body = await apiJson<{ profile: ProfilePublic }>(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        json: { status },
      });
      setProfile((current) => ({ ...current, ...body.profile }));
      setMessage("Status salvo.");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o status.");
      throw caught;
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = parseProfileInput({
      displayName,
      metaProfileId,
      profileUrl,
      status: profile.status,
      responsible: null,
      notes,
      bmIds,
    });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setPending(true);
    try {
      const body = await apiJson<{ profile: ProfilePublic }>(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        json: parsed.value,
      });
      setProfile((current) => ({ ...current, ...body.profile }));
      setDisplayName(body.profile.displayName ?? "");
      setMetaProfileId(body.profile.metaProfileId ?? "");
      setProfileUrl(body.profile.profileUrl ?? "");
      setNotes(body.profile.notes ?? "");
      setBmIds(body.profile.bmIds);
      setMessage("Dados salvos.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível salvar. Os dados continuam neste formulário.");
    } finally {
      setPending(false);
    }
  }

  const label = profileLabel(profile);

  return (
    <main className="shell grid gap-4 py-6 sm:py-8">
      <Link className="text-sm font-bold underline-offset-4 hover:underline" href="/">
        Voltar aos perfis
      </Link>
      <header className="panel grid gap-4 p-5 sm:grid-cols-[1fr_16rem] sm:items-end">
        <div>
          <h1 className="text-4xl">{label}</h1>
          {profile.emailUsername ? <p className="hint mt-2">{profile.emailUsername}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!profile.displayName?.trim() ? <span className="badge">Dados incompletos</span> : null}
            <p className="hint">Status manual, sem consulta à Meta. Atualizado {formatDateTime(profile.updatedAt)}</p>
          </div>
          <p className="hint mt-2">Abrir este cadastro não cria conta na Meta nem no e-mail.</p>
        </div>
        <StatusSelect value={profile.status} onChange={changeStatus} />
      </header>
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
      <form className="panel grid gap-4 p-5" onSubmit={saveProfile} noValidate>
        <h2 className="text-2xl">Dados do perfil</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Nome</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className="field">
            <span>ID do perfil na Meta</span>
            <input value={metaProfileId} inputMode="numeric" onChange={(event) => setMetaProfileId(event.target.value)} />
          </label>
          <label className="field">
            <span>Link do perfil</span>
            <input value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder="https://" />
          </label>
        </div>
        <label className="field">
          <span>Notas</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <fieldset>
          <legend className="legend mb-2">BMs vinculadas</legend>
          {bms.length === 0 ? (
            <p className="hint">Nenhuma BM cadastrada.</p>
          ) : (
            <div className="check-list">
              {bms.map((bm) => (
                <label key={bm.id}>
                  <input
                    type="checkbox"
                    checked={bmIds.includes(bm.id)}
                    onChange={() =>
                      setBmIds((current) => (current.includes(bm.id) ? current.filter((id) => id !== bm.id) : [...current, bm.id]))
                    }
                  />
                  <span>
                    {bm.name}
                    <span className="hint block">{bm.metaBmId}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar dados do perfil"}
        </button>
      </form>
      <AccessSection
        profileId={profile.id}
        service="meta"
        title="Acesso Meta"
        description="Login, senha e 2FA da conta Meta. Ficam criptografados e ocultos até você revelar."
        presence={profile.meta}
        vault={profile.vault}
        onSaved={(next) => setProfile((current) => ({ ...current, ...next, meta: next.meta, email: next.email }))}
      />
      <AccessSection
        profileId={profile.id}
        service="email"
        title="Acesso do e-mail"
        description="Informe o provedor real da conta. Pode ser Hotmail, Outlook, Gmail ou outro."
        presence={profile.email}
        email={profile.email}
        vault={profile.vault}
        onSaved={(next) => setProfile((current) => ({ ...current, ...next, meta: next.meta, email: next.email }))}
      />
    </main>
  );
}
