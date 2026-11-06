export default function ProfileLoading() {
  return (
    <main className="shell grid gap-4 py-6 sm:py-8" aria-busy="true" aria-label="Abrindo perfil">
      <div className="h-4 w-32 rounded-[8px] bg-[var(--line)]" />
      <div className="panel h-36 animate-pulse" />
      <div className="panel h-64 animate-pulse" />
      <div className="panel h-40 animate-pulse" />
    </main>
  );
}
