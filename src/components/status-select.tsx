"use client";

import { useEffect, useState } from "react";
import { STATUSES, type Status } from "@/lib/constants";

export function StatusSelect({
  value,
  label,
  disabled,
  onChange,
}: {
  value: Status;
  label: string;
  disabled?: boolean;
  onChange: (status: Status) => Promise<void>;
}) {
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <select
        className="status-select"
        data-status={current}
        aria-label={label}
        value={current}
        disabled={disabled || busy}
        aria-busy={busy}
        onChange={async (event) => {
          const next = event.target.value as Status;
          const previous = current;
          setCurrent(next);
          setBusy(true);
          try {
            await onChange(next);
          } catch {
            setCurrent(previous);
          } finally {
            setBusy(false);
          }
        }}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {busy && status === current ? "Salvando…" : status}
          </option>
        ))}
      </select>
    </label>
  );
}
