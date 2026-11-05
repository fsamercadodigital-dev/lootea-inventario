import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell py-16">
      <h1 className="text-4xl">Não encontrado</h1>
      <p className="hint mt-2">Esse registro não está no inventário.</p>
      <Link className="btn btn-primary mt-6" href="/">
        Voltar ao painel
      </Link>
    </main>
  );
}
