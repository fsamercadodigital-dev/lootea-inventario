"use client";

import { useState } from "react";
import { type Status, type StoredStatus } from "@/lib/constants";
import { profileLabel } from "@/lib/format";
import type { BmPublic, ProfilePublic } from "@/lib/types";
import { parseBmInput } from "@/lib/validators";
import { ApiError, apiJson } from "./api";
import { Dialog } from "./dialog";
import { StatusSwitch } from "./status-select";

const emptyBm: BmPublic = {
  id: "",
  name: "",
  metaBmId: "",
  status: "Ativo",
  responsible: null,
  notes: null,
  createdAt: "",
  updatedAt: "",
  profileIds: [],
};

export function BmDialog({
  open,
  bm,
  profiles,
  onClose,
  onSaved,
}: {
  open: boolean;
  bm: BmPublic | null;
  profiles: ProfilePublic[];
  onClose: () => void;
  onSaved: (bm: BmPublic) => void;
}) {
  const initial = bm ?? emptyBm;
  const [name, setName] = useState(initial.name);
  const [metaBmId, setMetaBmId] = useState(initial.metaBmId);
  const [status, setStatus] = useState<StoredStatus>(initial.status);
  const [responsible, setResponsible] = useState(initial.responsible ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [profileIds, setProfileIds] = useState<string[]>(initial.profileIds);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(id: string) {
    setProfileIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = bm
      ? parseBmInput({ name, metaBmId, status, responsible, notes, profileIds }, "update")
      : parseBmInput({ name, metaBmId, status: status as Status, responsible, notes, profileIds });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setPending(true);
    try {
      const path = bm ? `/api/bms/${bm.id}` : "/api/bms";
      const body = await apiJson<{ bm: BmPublic }>(path, {
        method: bm ? "PATCH" : "POST",
        json: parsed.value,
      });
      onSaved(body.bm);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível salvar. Os dados continuam neste formulário.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={bm ? "Editar BM" : "Nova BM"}
      description="Cadastro manual da Business Manager, com status e perfis vinculados."
      onClose={onClose}
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>ID da BM na Meta</span>
          <input value={metaBmId} onChange={(event) => setMetaBmId(event.target.value)} inputMode="numeric" spellCheck={false} />
          <p className="hint">O ID fica em texto, inclusive se tiver muitos dígitos.</p>
        </label>
        <StatusSwitch value={status} onChange={setStatus} />
        <label className="field">
          <span>Responsável</span>
          <input value={responsible} onChange={(event) => setResponsible(event.target.value)} />
        </label>
        <label className="field">
          <span>Notas</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <fieldset>
          <legend className="legend mb-2">Perfis vinculados</legend>
          {profiles.length === 0 ? (
            <p className="hint">Nenhum perfil ainda.</p>
          ) : (
            <div className="check-list">
              {profiles.map((profile) => (
                <label key={profile.id}>
                  <input type="checkbox" checked={profileIds.includes(profile.id)} onChange={() => toggle(profile.id)} />
                  <span>{profileLabel(profile)}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar BM"}
        </button>
      </form>
    </Dialog>
  );
}
