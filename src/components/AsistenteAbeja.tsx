"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, Send, MessageCircle } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import {
  buscarTema,
  preguntasInicialesParaRol,
  respuestaAleatoria,
  respuestaSinResultado,
  urlWhatsappPropietario,
  type TemaAsistente,
} from "@/lib/asistente-abeja-datos";

const DURACION_GESTO_MS = 2200;
const INTERVALO_GESTO_MS = 30_000;

// preguntaOriginal solo se llena cuando no hubo match (tema null) — es lo
// que la persona escribió, para precargarlo en el mensaje de WhatsApp.
type Resultado = { tema: TemaAsistente | null; respuesta: string; preguntaOriginal?: string };

// Mascota flotante + mini-asistente de ayuda por palabras clave (no es un
// modelo de lenguaje: respuestas fijas en asistente-abeja-datos.ts, con
// variantes y temas filtrados según el rol de la sesión). Vive en
// (app)/layout.tsx, fuera del Sidebar/CertificacionesShell, para flotar
// igual en cualquier workspace.
export function AsistenteAbeja() {
  const { usuario } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [pose, setPose] = useState<1 | 2>(1);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [texto, setTexto] = useState("");

  const timeoutGestoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarGestoTemporal() {
    setPose(2);
    if (timeoutGestoRef.current) clearTimeout(timeoutGestoRef.current);
    timeoutGestoRef.current = setTimeout(() => setPose(1), DURACION_GESTO_MS);
  }

  // Gesto automático cada 30s, sin importar si el chat está abierto o
  // cerrado — independiente del gesto manual de "Entendido" (ver abajo).
  useEffect(() => {
    const intervalo = setInterval(mostrarGestoTemporal, INTERVALO_GESTO_MS);
    return () => {
      clearInterval(intervalo);
      if (timeoutGestoRef.current) clearTimeout(timeoutGestoRef.current);
    };
  }, []);

  function abrirORecerrar() {
    setAbierto((a) => {
      const siguiente = !a;
      if (siguiente) {
        setResultado(null);
        setTexto("");
      }
      return siguiente;
    });
  }

  function mostrarTema(tema: TemaAsistente) {
    if (!usuario) return;
    const respuesta = respuestaAleatoria(tema, usuario.rol);
    if (!respuesta) return; // no debería pasar — los chips ya vienen filtrados por rol
    setResultado({ tema, respuesta });
  }

  function preguntar(texto: string) {
    if (!texto.trim() || !usuario) return;
    const tema = buscarTema(texto, usuario.rol);
    setResultado(
      tema
        ? { tema, respuesta: respuestaAleatoria(tema, usuario.rol)! }
        : { tema: null, respuesta: respuestaSinResultado(), preguntaOriginal: texto }
    );
  }

  function entendido() {
    setAbierto(false);
    setResultado(null);
    setTexto("");
    mostrarGestoTemporal();
  }

  if (!usuario) return null;
  const preguntasIniciales = preguntasInicialesParaRol(usuario.rol);

  return (
    <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-3">
      {abierto && (
        <div className="animate-abeja-pop shell w-[min(88vw,22rem)] rounded-[1.5rem] p-2 diffused-lg">
          <div className="core flex max-h-[70vh] flex-col overflow-hidden rounded-[calc(1.5rem-0.5rem)]">
            <div className="flex items-center justify-between border-b border-silver px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Abejita · Asistente</p>
              <button
                onClick={() => setAbierto(false)}
                className="ease-spring rounded-full p-1 text-muted transition hover:bg-surface-2"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {resultado ? (
                <div className="space-y-3">
                  {resultado.tema?.pregunta && (
                    <p className="text-xs font-medium text-muted">{resultado.tema.pregunta}</p>
                  )}
                  <p className="text-sm leading-relaxed text-foreground">{resultado.respuesta}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted">¿Cómo te ayudo? Elige una pregunta o escribe la tuya.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preguntasIniciales.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => mostrarTema(t)}
                        className="ease-spring rounded-full border border-silver bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        {t.pregunta}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-silver p-3">
              {resultado ? (
                <>
                  {!resultado.tema && (
                    <a
                      href={urlWhatsappPropietario(resultado.preguntaOriginal ?? "")}
                      target="_blank"
                      rel="noreferrer"
                      className="ease-spring flex w-full items-center justify-center gap-1.5 rounded-xl bg-success/15 px-4 py-2 text-sm font-medium text-success transition hover:bg-success/25"
                    >
                      <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                      Contactar al propietario
                    </a>
                  )}
                  <button
                    onClick={entendido}
                    className="ease-spring w-full rounded-xl brand-plate px-4 py-2 text-sm font-medium text-white transition"
                  >
                    Entendido
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    preguntar(texto);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Dime qué necesitas…"
                    className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                  />
                  <button
                    type="submit"
                    disabled={!texto.trim()}
                    className="ease-spring flex-none rounded-lg bg-primary/10 p-2 text-primary transition hover:bg-primary/20 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={abrirORecerrar}
        aria-label="Abrir asistente"
        className="ease-spring relative h-20 w-20 transition hover:scale-105"
      >
        {/* Solo son 2 fotos fijas (no una serie de frames todavía) — el
            "movimiento" entre pose 1 y 2 es un crossfade + un pequeño pop de
            escala, no una animación cuadro por cuadro. Si en algún momento
            hay frames intermedios de verdad, aquí es donde se agregarían. */}
        <span className={`relative block h-full w-full ${abierto ? "" : "animate-flotar"}`}>
          <Image
            src="/abeja/pose-1.png"
            alt="Asistente"
            fill
            sizes="80px"
            className={`object-contain drop-shadow-lg transition-all duration-500 ease-out ${
              pose === 1 ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
            priority
          />
          <Image
            src="/abeja/pose-2.png"
            alt=""
            fill
            sizes="80px"
            className={`object-contain drop-shadow-lg transition-all duration-500 ease-out ${
              pose === 2 ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
