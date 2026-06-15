export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6">
      <p className="mb-3 text-sm font-medium uppercase tracking-wide text-emerald-700">
        TicketBox
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
        Concert ticketing for high-demand Vietnamese events.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
        This web app will host the audience and organizer experiences. Backend
        API traffic is available through the Nginx proxy at /api.
      </p>
    </main>
  );
}
