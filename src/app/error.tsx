"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell py-16">
      <h1 className="text-4xl">Não foi possível abrir o inventário.</h1>
      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        Tentar de novo
      </button>
    </main>
  );
}
