"use client";

import { useEffect, useState } from "react";

const FLASH_MS = 10_000;

export function useTimedMessage() {
  const [message, setMessageState] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  function setMessage(next: string | null) {
    setMessageState(next);
    setGeneration((current) => current + 1);
  }

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessageState(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [message, generation]);

  return [message, setMessage] as const;
}
