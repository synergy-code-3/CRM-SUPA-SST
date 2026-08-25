import { Sidebar } from "@/components/Sidebar";
import { FiltrosMovilProvider } from "@/lib/filtros-movil-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FiltrosMovilProvider>
      <div className="flex min-h-screen flex-col bg-background bg-mesh md:flex-row">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </FiltrosMovilProvider>
  );
}
