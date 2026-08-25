"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useSesion } from "@/lib/session-context";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Modo = "iniciar" | "crear";

const BULLETS = [
  "Seguimiento de membresías en tiempo real",
  "Control de acceso por roles (admin / coordinador / abeja)",
  "Registro de quién entra y cuándo",
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usuario, cargando, refrescar } = useSesion();
  const [modo, setModo] = useState<Modo>("iniciar");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuentaCreada, setCuentaCreada] = useState(false);

  const siguiente = searchParams.get("next") || "/";

  useEffect(() => {
    if (!cargando && usuario) router.replace(siguiente);
  }, [cargando, usuario, router, siguiente]);

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setError(null);
    setCuentaCreada(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (modo === "iniciar") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "No se pudo iniciar sesión");
          return;
        }
        await refrescar();
        router.replace(siguiente);
      } else {
        const res = await fetch("/api/auth/registro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre, email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "No se pudo crear la cuenta");
          return;
        }
        setCuentaCreada(true);
        setNombre("");
        setEmail("");
        setPassword("");
      }
    } catch {
      setError("Error de red");
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return null;

  const puedeEnviar =
    modo === "iniciar"
      ? !!email.trim() && !!password && !enviando
      : !!nombre.trim() && !!email.trim() && password.length >= 8 && !enviando;

  return (
    <div className="bg-brand bg-dots fixed inset-0 z-[100] overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center gap-10 px-6 py-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        {/* Panel de marca — solo en pantallas grandes, para no empujar el
            formulario debajo del fold en celular. */}
        <div className="hidden max-w-md flex-col gap-6 text-white lg:flex">
          <div className="relative h-36 w-36">
            {/* El logo es un círculo negro — sin este halo y el aro claro
                casi desaparece contra el fondo oscuro de la página. */}
            <div className="absolute inset-0 rounded-full bg-primary-glow/45 blur-xl" aria-hidden="true" />
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={144}
              height={144}
              className="relative h-36 w-36 rounded-full shadow-2xl ring-1 ring-white/25"
              priority
            />
          </div>

          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-glow" />
            Club Sinergético · Plataforma interna
          </span>

          <h1 className="text-3xl font-semibold leading-tight">
            La plataforma de gestión para el <span className="text-primary-glow">Club Sinergético.</span>
          </h1>
          <p className="text-sm text-white/70">
            Renovaciones, seguimiento y comunicación con tus miembros, todo en un solo lugar.
          </p>

          <ul className="space-y-2 text-sm text-white/80">
            {BULLETS.map((linea) => (
              <li key={linea} className="flex items-center gap-2">
                <span className="h-1 w-1 flex-none rounded-full bg-primary-glow" />
                {linea}
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={onSubmit} className="shell w-full max-w-sm rounded-[2rem] p-2 diffused-lg animate-fade-in">
          <div className="core rounded-[calc(2rem-0.5rem)] p-8">
            <Image
              src="/icons/icon-192.png"
              alt="CRM CS"
              width={44}
              height={44}
              className="mb-4 h-11 w-11 rounded-xl lg:hidden"
              priority
            />

            <h2 className="text-lg font-semibold text-foreground">
              {modo === "iniciar" ? "Iniciar sesión" : "Crear cuenta"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {modo === "iniciar"
                ? "Bienvenido de vuelta"
                : "Un administrador debe aprobarla antes de que puedas entrar"}
            </p>

            {cuentaCreada ? (
              <div className="mt-6 space-y-4">
                <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                  Cuenta creada. Un administrador la revisará y la activará — mientras tanto no vas a poder entrar.
                </p>
                <button
                  type="button"
                  onClick={() => cambiarModo("iniciar")}
                  className="ease-spring w-full rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
                >
                  Volver a iniciar sesión
                </button>
              </div>
            ) : (
              <>
                {modo === "crear" && (
                  <input
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Nombre completo"
                    autoComplete="name"
                    className="mt-6 w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                  />
                )}
                <input
                  autoFocus={modo === "iniciar"}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Correo"
                  autoComplete="username"
                  className={`w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2 ${
                    modo === "crear" ? "mt-3" : "mt-6"
                  }`}
                />
                <div className="relative mt-3">
                  <input
                    type={mostrarPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={modo === "iniciar" ? "Contraseña" : "Contraseña (mín. 8 caracteres)"}
                    autoComplete={modo === "iniciar" ? "current-password" : "new-password"}
                    className="w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 pr-10 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="ease-spring absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-foreground"
                  >
                    {mostrarPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                {error && <p className="mt-3 text-xs text-danger">{error}</p>}

                <button
                  type="submit"
                  disabled={!puedeEnviar}
                  className="ease-spring mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enviando
                    ? modo === "iniciar"
                      ? "Entrando…"
                      : "Creando…"
                    : modo === "iniciar"
                      ? "Entrar"
                      : "Crear cuenta"}
                  {!enviando && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
                </button>

                <button
                  type="button"
                  onClick={() => cambiarModo(modo === "iniciar" ? "crear" : "iniciar")}
                  className="ease-spring mt-4 w-full text-center text-xs font-medium text-primary transition hover:text-primary-deep"
                >
                  {modo === "iniciar" ? "¿Nuevo aquí? Crear cuenta" : "¿Ya tienes cuenta? Iniciar sesión"}
                </button>
              </>
            )}

            <p className="mt-6 text-center text-[11px] text-muted">
              CRM · Club Sinergético · {new Date().getFullYear()}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
