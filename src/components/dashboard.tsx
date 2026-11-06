"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, type Status } from "@/lib/constants";
import { formatDateTime, profileLabel } from "@/lib/format";
import { summarize } from "@/lib/summary";
import type { BmPublic, Inventory, ProfilePublic } from "@/lib/types";
import { apiJson, setCsrf } from "./api";
import { BmDialog } from "./bm-dialog";
import { ProfileCreateDialog } from "./profile-create-dialog";
import { Spark } from "./spark";
import { StatusSelect } from "./status-select";

export function Dashboard({ initial, csrfToken }: { initial: Inventory; csrfToken: string }) {
  setCsrf(csrfToken);
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"perfis" | "bms">("perfis");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "todos">("todos");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bmOpen, setBmOpen] = useState(false);
  const [editingBm, setEditingBm] = useState<BmPublic | null>(null);
  const summary = useMemo(() => summarize(data.profiles, data.bms), [data]);
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const bmsById = useMemo(() => new Map(data.bms.map((bm) => [bm.id, bm])), [data.bms]);
  const profilesById = useMemo(() => new Map(data.profiles.map((profile) => [profile.id, profile])), [data.profiles]);

  const profiles = data.profiles.filter((profile) => {
    if (status !== "todos" && profile.status !== status) return false;
    if (!needle) return true;
    const linked = profile.bmIds.map((id) => bmsById.get(id)?.name ?? "").join(" ");
    const hay = [profileLabel(profile), profile.metaProfileId, profile.responsible, profile.notes, linked]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return hay.includes(needle);
  });
  const bms = data.bms.filter((bm) => {
    if (status !== "todos" && bm.status !== status) return false;
    if (!needle) return true;
    const linked = bm.profileIds.map((id) => profilesById.get(id)).filter(Boolean).map((profile) => profileLabel(profile!)).join(" ");
    const hay = [bm.name, bm.metaBmId, bm.responsible, bm.notes, linked].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return hay.includes(needle);
  });
  async function changeProfileStatus(id: string, next: Status) {
    try {
      const body = await apiJson<{ profile: ProfilePublic }>(`/api/profiles/${id}`, {
        method: "PATCH",
        json: { status: next },
      });
      setData((current) => ({
        ...current,
        profiles: current.profiles.map((profile) => (profile.id === id ? body.profile : profile)),
      }));
      setMessage("Status salvo.");
      setError(null);
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o status.");
      throw caught;
    }
  }

  async function changeBmStatus(id: string, next: Status) {
    try {
      const body = await apiJson<{ bm: BmPublic }>(`/api/bms/${id}`, { method: "PATCH", json: { status: next } });
      setData((current) => ({ ...current, bms: current.bms.map((bm) => (bm.id === id ? body.bm : bm)) }));
      setMessage("Status salvo.");
      setError(null);
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o status.");
      throw caught;
    }
  }

  function saveBm(next: BmPublic) {
    setData((current) => {
      const exists = current.bms.some((bm) => bm.id === next.id);
      const bms = exists ? current.bms.map((bm) => (bm.id === next.id ? next : bm)) : [...current.bms, next].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      const profiles = current.profiles.map((profile) => ({
        ...profile,
        bmIds: next.profileIds.includes(profile.id)
          ? Array.from(new Set([...profile.bmIds, next.id]))
          : profile.bmIds.filter((id) => id !== next.id),
      }));
      return { ...current, bms, profiles };
    });
    setMessage(editingBm ? "BM atualizada." : "BM cadastrada.");
    setError(null);
  }

  async function logout() {
    await apiJson("/api/logout", { method: "POST", json: {} });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="shell py-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-4xl">
            Lootea Contingência
            <Spark />
          </h1>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Sair
        </button>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Resumo">
        <article className="panel p-4">
          <h2 className="text-lg">Perfis</h2>
          <p className="mt-2 text-sm leading-6">
            {summary.profiles.total} no total · {summary.profiles.Ativo} ativos · {summary.profiles.Restrito} restritos
          </p>
        </article>
        <article className="panel p-4">
          <h2 className="text-lg">BMs</h2>
          <p className="mt-2 text-sm leading-6">
            {summary.bms.total} no total · {summary.bms.Ativo} ativas · {summary.bms.Restrito} restritas
          </p>
        </article>
      </section>

      {data.vault !== "ready" ? (
        <p className="alert mt-4" role="alert">
          O cofre de senhas não está configurado. Dá para cadastrar perfis e BMs, mas login e 2FA ficam bloqueados.
        </p>
      ) : null}
      {message ? (
        <p className="ok mt-4" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="alert mt-4" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="tabs" role="tablist" aria-label="Inventário">
          <button type="button" role="tab" aria-selected={tab === "perfis"} onClick={() => setTab("perfis")}>
            Perfis
          </button>
          <button type="button" role="tab" aria-selected={tab === "bms"} onClick={() => setTab("bms")}>
            BMs
          </button>
        </div>
        {tab === "perfis" ? (
          <button type="button" className="btn btn-primary" onClick={() => setProfileOpen(true)}>
            + Novo perfil
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditingBm(null);
              setBmOpen(true);
            }}
          >
            + Nova BM
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="field">
          <span>Buscar</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, ID ou responsável" />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as Status | "todos")}>
            <option value="todos">Todos</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tab === "perfis" ? (
        <section className="mt-4 grid gap-3" role="tabpanel">
          {data.profiles.length === 0 ? (
            <Empty
              title="Nenhum perfil cadastrado"
              text="Quando um perfil existir, registre aqui. Isso não cria a conta na Meta."
              action="+ Novo perfil"
              onAction={() => setProfileOpen(true)}
            />
          ) : profiles.length === 0 ? (
            <Empty title="Nenhum perfil com esse filtro" text="Limpe a busca ou escolha outro status." action="Limpar filtros" onAction={() => { setQuery(""); setStatus("todos"); }} />
          ) : (
            profiles.map((profile) => (
              <article key={profile.id} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_16rem] sm:items-start">
                <div>
                  <h2 className="text-2xl">
                    <Link className="underline-offset-4 hover:underline" href={`/perfis/${profile.id}`}>
                      {profileLabel(profile)}
                    </Link>
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!profile.displayName?.trim() ? <span className="badge">Dados incompletos</span> : null}
                    <span className="hint">{profile.hasAccess ? "Acesso informado" : "Acesso pendente"}</span>
                  </div>
                  {profile.metaProfileId ? <p className="hint mt-2">ID Meta {profile.metaProfileId}</p> : null}
                  <p className="hint mt-2">Atualizado {formatDateTime(profile.updatedAt)}</p>
                </div>
                <StatusSelect value={profile.status} onChange={(next) => changeProfileStatus(profile.id, next)} />
              </article>
            ))
          )}
        </section>
      ) : (
        <section className="mt-4 grid gap-3" role="tabpanel">
          {data.bms.length === 0 ? (
            <Empty
              title="Nenhuma BM cadastrada"
              text="Cadastre a Business Manager, o status e os perfis vinculados."
              action="+ Nova BM"
              onAction={() => {
                setEditingBm(null);
                setBmOpen(true);
              }}
            />
          ) : bms.length === 0 ? (
            <Empty title="Nenhuma BM com esse filtro" text="Limpe a busca ou escolha outro status." action="Limpar filtros" onAction={() => { setQuery(""); setStatus("todos"); }} />
          ) : (
            bms.map((bm) => (
              <article key={bm.id} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_16rem] sm:items-start">
                <div>
                  <h2 className="text-2xl">{bm.name}</h2>
                  <p className="mt-1 break-all text-sm">ID Meta {bm.metaBmId}</p>
                  <p className="hint mt-2">
                    {bm.profileIds.length
                      ? bm.profileIds.map((id) => profilesById.get(id)).filter(Boolean).map((profile) => profileLabel(profile!)).join(", ")
                      : "Sem perfis vinculados"}
                  </p>
                  <p className="hint mt-2">Atualizado {formatDateTime(bm.updatedAt)}</p>
                  <button
                    type="button"
                    className="btn btn-secondary mt-3"
                    onClick={() => {
                      setEditingBm(bm);
                      setBmOpen(true);
                    }}
                  >
                    Editar
                  </button>
                </div>
                <StatusSelect value={bm.status} onChange={(next) => changeBmStatus(bm.id, next)} />
              </article>
            ))
          )}
        </section>
      )}

      {profileOpen ? (
        <ProfileCreateDialog
          open
          bms={data.bms}
          vault={data.vault}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}
      {bmOpen ? (
        <BmDialog
          key={editingBm?.id ?? "nova"}
          open
          bm={editingBm}
          profiles={data.profiles}
          onClose={() => setBmOpen(false)}
          onSaved={saveBm}
        />
      ) : null}
    </main>
  );
}

function Empty({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="empty px-6 py-14 text-center">
      <h2 className="text-3xl">{title}</h2>
      <p className="hint mx-auto mt-2 max-w-md">{text}</p>
      <button type="button" className="btn btn-primary mt-5" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
