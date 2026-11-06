"use client";

import { useEffect, useId, useState } from "react";
import type { Status, StoredStatus } from "@/lib/constants";

export function StatusSwitch({
  value,
  disabled,
  busy,
  onChange,
}: {
  value: StoredStatus;
  disabled?: boolean;
  busy?: boolean;
  onChange: (status: Status) => void;
}) {
  const labelId = useId();
  const stateId = useId();
  const on = value === "Ativo";
  const word = busy ? "Salvando…" : value;

  return (
    <div className="status-toggle">
      <span id={labelId} className="status-toggle-label">
        Mudar status
      </span>
      <div className="status-toggle-row">
        <button
          type="button"
          role="switch"
          className="status-switch"
          data-on={on ? "true" : "false"}
          aria-checked={on}
          aria-labelledby={labelId}
          aria-describedby={stateId}
          aria-busy={busy || undefined}
          disabled={disabled || busy}
          onClick={() => onChange(on ? "Restrito" : "Ativo")}
        >
          <span className="status-switch-thumb" aria-hidden="true" />
        </button>
        <span id={stateId} className="status-toggle-state">
          {word}
        </span>
      </div>
    </div>
  );
}

export function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: StoredStatus;
  disabled?: boolean;
  onChange: (status: Status) => Promise<void>;
}) {
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  return (
    <StatusSwitch
      value={current}
      disabled={disabled}
      busy={busy}
      onChange={async (next) => {
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
    />
  );
}
