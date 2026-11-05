"use client";

import { useEffect, useId, useRef } from "react";

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-2xl">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="hint mt-1">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
