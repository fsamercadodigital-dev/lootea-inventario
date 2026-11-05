"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROVIDER_LABELS, STATUSES, type EmailProvider } from "@/lib/constants";
import type { BmPublic, VaultState } from "@/lib/types";
import { parseCreateProfile } from "@/lib/validators";
import { ApiError, apiJson } from "./api";
import { Dialog } from "./dialog";

export function ProfileCreateDialog({
  open,
  suggestedNumber,
  bms,
  vault,
  onClose,
}: {
  open: boolean;
  suggestedNumber: number;
  bms: BmPublic[];
  vault: VaultState;
  onClose: () => void;
}) {
  const router = useRouter();
  const [recordNumber, setRecordNumber] = useState(String(suggestedNumber));
  const [displayName, setDisplayName] = useState("");
  const [metaProfileId, setMetaProfileId] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Ativo");
  const [responsible, setResponsible] = useState("");
  const [notes, setNotes] = useState("");
  const [bmIds, setBmIds] = useState<string[]>([]);
  const [metaUser, setMetaUser] = useState("");
  const [metaPassword, setMetaPassword] = useState("");
  const [metaTotp, setMetaTotp] = useState("");
  const [metaRecovery, setMetaRecovery] = useState("");
  const [provider, setProvider] = useState("");
  const [otherLabel, setOtherLabel] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailTotp, setEmailTotp] = useState("");
  const [emailRecovery, setEmailRecovery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const vaultReady = vault === "ready";

  function toggleBm(id: string) {
    setBmIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = parseCreateProfile({
      recordNumber,
      displayName,
      metaProfileId,
      profileUrl,
      status,
      responsible,
      notes,
      bmIds,
      meta: { username: metaUser, password: metaPassword, totp: metaTotp, recovery: metaRecovery },
      email: {
        provider,
        otherLabel,
        username: emailUser,
        password: emailPassword,
        totp: emailTotp,
        recovery: emailRecovery,
      },
    });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if ((parsed.value.meta || parsed.value.email) && !vaultReady) {
      setError("O cofre de acesso não está configurado. O perfil não foi salvo.");
      return;
    }
    setPending(true);
    try {
      const body = await apiJson<{ profile: { id: string } }>("/api/profiles", {
        method: "POST",
        json: parsed.value,
      });
      onClose();
      router.push(`/perfis/${body.profile.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível salvar. Os dados continuam neste formulário.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Novo perfil"
      description="Registra o perfil no inventário. Não cria conta na Meta nem no e-mail."
      onClose={onClose}
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Número do registro</span>
            <input inputMode="numeric" value={recordNumber} onChange={(event) => setRecordNumber(event.target.value)} />
          </label>
          <label className="field">
            <span>Nome</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            <p className="hint">Se ficar vazio, o painel mostra “Perfil” e o número.</p>
          </label>
          <label className="field">
            <span>ID do perfil na Meta</span>
            <input value={metaProfileId} onChange={(event) => setMetaProfileId(event.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span>Link do perfil</span>
            <input value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder="https://" />
          </label>
          <label className="field">
            <span>Status manual</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])}>
              {STATUSES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Responsável</span>
            <input value={responsible} onChange={(event) => setResponsible(event.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Notas</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <fieldset>
          <legend className="legend mb-2">BMs vinculadas</legend>
          {bms.length === 0 ? (
            <p className="hint">Nenhuma BM ainda. Dá para vincular depois.</p>
          ) : (
            <div className="check-list">
              {bms.map((bm) => (
                <label key={bm.id}>
                  <input type="checkbox" checked={bmIds.includes(bm.id)} onChange={() => toggleBm(bm.id)} />
                  <span>
                    {bm.name}
                    <span className="hint block">{bm.metaBmId}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <SecretFields
          title="Acesso Meta"
          ready={vaultReady}
          user={metaUser}
          password={metaPassword}
          totp={metaTotp}
          recovery={metaRecovery}
          onUser={setMetaUser}
          onPassword={setMetaPassword}
          onTotp={setMetaTotp}
          onRecovery={setMetaRecovery}
        />
        <fieldset className="grid gap-3 rounded-2xl border border-[var(--line)] p-3">
          <legend className="legend px-1">Acesso do e-mail</legend>
          <p className="hint">Escolha o provedor real: Gmail, Outlook, Hotmail ou outro.</p>
          <label className="field">
            <span>Provedor</span>
            <select value={provider} disabled={!vaultReady} onChange={(event) => setProvider(event.target.value)}>
              <option value="">Selecione</option>
              {(Object.keys(PROVIDER_LABELS) as EmailProvider[]).map((item) => (
                <option key={item} value={item}>
                  {PROVIDER_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          {provider === "other" ? (
            <label className="field">
              <span>Qual provedor</span>
              <input value={otherLabel} disabled={!vaultReady} onChange={(event) => setOtherLabel(event.target.value)} />
            </label>
          ) : null}
          <SecretFields
            title=""
            ready={vaultReady}
            user={emailUser}
            password={emailPassword}
            totp={emailTotp}
            recovery={emailRecovery}
            onUser={setEmailUser}
            onPassword={setEmailPassword}
            onTotp={setEmailTotp}
            onRecovery={setEmailRecovery}
          />
        </fieldset>
        {!vaultReady ? (
          <p className="alert" role="alert">
            O cofre de senhas não está configurado. Dá para cadastrar o perfil, mas login e 2FA ficam bloqueados.
          </p>
        ) : null}
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar perfil"}
        </button>
      </form>
    </Dialog>
  );
}

function SecretFields({
  title,
  ready,
  user,
  password,
  totp,
  recovery,
  onUser,
  onPassword,
  onTotp,
  onRecovery,
}: {
  title: string;
  ready: boolean;
  user: string;
  password: string;
  totp: string;
  recovery: string;
  onUser: (value: string) => void;
  onPassword: (value: string) => void;
  onTotp: (value: string) => void;
  onRecovery: (value: string) => void;
}) {
  return (
    <fieldset className="grid gap-3" disabled={!ready}>
      {title ? <legend className="legend">{title}</legend> : null}
      <label className="field">
        <span>Usuário</span>
        <input autoComplete="off" value={user} onChange={(event) => onUser(event.target.value)} />
      </label>
      <label className="field">
        <span>Senha</span>
        <input type="password" autoComplete="off" value={password} onChange={(event) => onPassword(event.target.value)} />
      </label>
      <label className="field">
        <span>Segredo 2FA</span>
        <input type="password" autoComplete="off" spellCheck={false} value={totp} onChange={(event) => onTotp(event.target.value)} />
      </label>
      <label className="field">
        <span>Códigos de recuperação</span>
        <textarea autoComplete="off" value={recovery} onChange={(event) => onRecovery(event.target.value)} />
      </label>
    </fieldset>
  );
}
