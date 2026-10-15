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
const TAMANO_BOTON = 80; // h-20 w-20
const MARGEN_PANTALLA = 8;
const UMBRAL_ARRASTRE_PX = 6; // menos que esto se trata como clic, no arrastre
const LLAVE_POSICION = "abeja_posicion";
const ANCHO_PANEL_MAX = 352; // 22rem — mismo tope que min(88vw,22rem) de abajo
const GAP_PANEL_BOTON = 12;

type PosicionPanel = { left: number; top: number; maxHeight: number };

// Antes el panel era hijo del mismo contenedor flex que la abejita
// (items-end + flex-col), así que su posición dependía por completo de
// dónde hubiera quedado la abejita arrastrada — si estaba cerca de una
// orilla, el panel se salía de la pantalla. Esto calcula su posición en
// píxeles reales cada vez que se abre, igual que un tooltip, pero AL LADO
// del botón (derecha si hay espacio, si no izquierda) en vez de arriba —
// pedido explícito, para no taparle la cara a la abejita con el panel.
// Verticalmente se alinea con la parte de arriba del botón, y se recorta
// (o se ancla por abajo) si no cabe hasta el fondo de la pantalla.
function calcularPosicionPanel(botonEl: HTMLElement | null): PosicionPanel {
  const rect = botonEl?.getBoundingClientRect() ?? {
    left: window.innerWidth - TAMANO_BOTON - MARGEN_PANTALLA,
    right: window.innerWidth - MARGEN_PANTALLA,
    top: window.innerHeight - TAMANO_BOTON - MARGEN_PANTALLA,
    bottom: window.innerHeight - MARGEN_PANTALLA,
  };

  const anchoPanel = Math.min(window.innerWidth * 0.88, ANCHO_PANEL_MAX);
  const espacioDerecha = window.innerWidth - rect.right - GAP_PANEL_BOTON - MARGEN_PANTALLA;
  const espacioIzquierda = rect.left - GAP_PANEL_BOTON - MARGEN_PANTALLA;
  const abrirALaDerecha = espacioDerecha >= anchoPanel || espacioDerecha >= espacioIzquierda;
  let left = abrirALaDerecha ? rect.right + GAP_PANEL_BOTON : rect.left - GAP_PANEL_BOTON - anchoPanel;
  left = Math.max(MARGEN_PANTALLA, Math.min(left, window.innerWidth - anchoPanel - MARGEN_PANTALLA));

  const alturaMax = window.innerHeight * 0.7;
  const espacioDesdeArriba = window.innerHeight - rect.top - MARGEN_PANTALLA;
  let top: number;
  let maxHeight: number;
  if (espacioDesdeArriba >= Math.min(200, alturaMax)) {
    maxHeight = Math.min(espacioDesdeArriba, alturaMax);
    top = rect.top;
  } else {
    maxHeight = Math.min(rect.bottom - MARGEN_PANTALLA, alturaMax);
    top = Math.max(MARGEN_PANTALLA, rect.bottom - maxHeight);
  }

  return { left, top, maxHeight };
}

type Mensaje = { autor: "usuario" | "abeja"; texto: string };

// Mascota flotante + mini-asistente de ayuda por palabras clave (no es un
// modelo de lenguaje: respuestas fijas en asistente-abeja-datos.ts, con
// variantes y temas filtrados según el rol de la sesión). Vive en
// (app)/layout.tsx, fuera del Sidebar/CertificacionesShell, para flotar
// igual en cualquier workspace.
export function AsistenteAbeja() {
  const { usuario } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [pose, setPose] = useState<1 | 2>(1);
  // Antes era un solo { tema, respuesta } (una pregunta, una respuesta, se
  // acabó — "Entendido" cerraba todo). Ahora es un hilo real: varias
  // preguntas seguidas sin que se resetee entre una y otra, con historial
  // mandado a la IA para que las respuestas tengan contexto de lo anterior.
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState("");
  const finMensajesRef = useRef<HTMLDivElement>(null);
  // null = posición por defecto (abajo a la derecha, vía clases CSS). Una
  // vez que se arrastra, se fija en coordenadas absolutas y se recuerda
  // por navegador (localStorage) — conveniencia de por-visitante, no datos
  // que haga falta sincronizar entre dispositivos.
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
  const [posicionPanel, setPosicionPanel] = useState<PosicionPanel | null>(null);

  const timeoutGestoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrastrandoRef = useRef(false);
  const seMovioRef = useRef(false);
  const origenPunteroRef = useRef<{ x: number; y: number } | null>(null);
  const origenPosicionRef = useRef<{ x: number; y: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const guardada = localStorage.getItem(LLAVE_POSICION);
      if (guardada) setPosicion(JSON.parse(guardada));
    } catch {
      // localStorage no disponible — se queda en la posición por defecto.
    }
  }, []);

  // Recalcula la posición del panel al abrirlo y si cambia el tamaño de
  // pantalla mientras está abierto (ej. girar el celular).
  useEffect(() => {
    if (!abierto) return;
    const recalcular = () => setPosicionPanel(calcularPosicionPanel(botonRef.current));
    recalcular();
    window.addEventListener("resize", recalcular);
    return () => window.removeEventListener("resize", recalcular);
  }, [abierto]);

  function alPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== undefined && e.button !== 0) return; // solo clic izquierdo en mouse
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = botonRef.current!.getBoundingClientRect();
    origenPunteroRef.current = { x: e.clientX, y: e.clientY };
    origenPosicionRef.current = { x: rect.left, y: rect.top };
    seMovioRef.current = false;
    arrastrandoRef.current = true;
  }

  function alPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!arrastrandoRef.current || !origenPunteroRef.current || !origenPosicionRef.current) return;
    const dx = e.clientX - origenPunteroRef.current.x;
    const dy = e.clientY - origenPunteroRef.current.y;
    if (!seMovioRef.current && Math.hypot(dx, dy) < UMBRAL_ARRASTRE_PX) return;
    seMovioRef.current = true;
    const x = Math.min(Math.max(origenPosicionRef.current.x + dx, MARGEN_PANTALLA), window.innerWidth - TAMANO_BOTON - MARGEN_PANTALLA);
    const y = Math.min(Math.max(origenPosicionRef.current.y + dy, MARGEN_PANTALLA), window.innerHeight - TAMANO_BOTON - MARGEN_PANTALLA);
    setPosicion({ x, y });
  }

  function alPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    arrastrandoRef.current = false;
    if (seMovioRef.current) {
      setPosicion((actual) => {
        try {
          if (actual) localStorage.setItem(LLAVE_POSICION, JSON.stringify(actual));
        } catch {
          // ignorar — no es crítico que persista
        }
        return actual;
      });
    } else {
      abrirORecerrar();
    }
    origenPunteroRef.current = null;
    origenPosicionRef.current = null;
  }

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

  useEffect(() => {
    finMensajesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, enviando]);

  function abrirORecerrar() {
    setAbierto((a) => {
      const siguiente = !a;
      if (siguiente) {
        setMensajes([]);
        setTexto("");
      }
      return siguiente;
    });
  }

  // Chip de pregunta fija: respuesta ya escrita a mano, no pasa por la IA —
  // se agrega al hilo igual que cualquier otro intercambio, para que se
  // pueda seguir la conversación desde ahí con una pregunta libre.
  function elegirTema(tema: TemaAsistente) {
    if (!usuario) return;
    const respuesta = respuestaAleatoria(tema, usuario.rol);
    if (!respuesta) return; // no debería pasar — los chips ya vienen filtrados por rol
    setMensajes((m) => [...m, { autor: "usuario", texto: tema.pregunta }, { autor: "abeja", texto: respuesta }]);
  }

  // Los temas fijos (uso del CRM) se quedan instantáneos y gratis, por
  // palabra clave. Lo que no calza con ninguno se manda a la IA —con el
  // historial de la conversación, no solo la última pregunta— con la base
  // de conocimiento de soporte (BASE_CONOCIMIENTO_SINERGETICOS_BOT.md) de
  // contexto. Si la IA falla (sin API key, sin internet, etc.) el propio
  // servidor cae a buscar por palabras clave dentro de esa misma base antes
  // de rendirse del todo (ver /api/asistente-abeja/preguntar).
  async function enviarMensaje(textoPregunta: string) {
    const pregunta = textoPregunta.trim();
    if (!pregunta || !usuario || enviando) return;
    setTexto("");

    const tema = buscarTema(pregunta, usuario.rol);
    if (tema) {
      elegirTema(tema);
      return;
    }

    const historial = mensajes
      .slice(-12)
      .map((m) => ({ role: m.autor === "usuario" ? ("user" as const) : ("assistant" as const), content: m.texto }));
    setMensajes((m) => [...m, { autor: "usuario", texto: pregunta }]);
    setEnviando(true);
    try {
      const res = await fetch("/api/asistente-abeja/preguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, historial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo generar la respuesta");
      setMensajes((m) => [...m, { autor: "abeja", texto: data.respuesta }]);
    } catch {
      setMensajes((m) => [...m, { autor: "abeja", texto: respuestaSinResultado() }]);
    } finally {
      setEnviando(false);
    }
  }

  function entendido() {
    setAbierto(false);
    setMensajes([]);
    setTexto("");
    mostrarGestoTemporal();
  }

  const ultimaPreguntaUsuario = [...mensajes].reverse().find((m) => m.autor === "usuario")?.texto ?? "";

  if (!usuario || !usuario.abejaActiva) return null;
  const preguntasIniciales = preguntasInicialesParaRol(usuario.rol);

  return (
    <>
      {/* El panel ya no comparte contenedor con el botón (antes era
          flex-col+items-end, así que la posición del botón determinaba por
          completo dónde caía el panel — si la abejita estaba cerca de una
          orilla, el panel se salía de la pantalla). Ahora es un elemento
          aparte, posicionado en píxeles ya recortados al espacio disponible
          (ver calcularPosicionPanel). */}
      {abierto && posicionPanel && (
        <div
          className="animate-abeja-pop shell fixed z-[90] rounded-[1.5rem] p-2 diffused-lg"
          style={{ left: posicionPanel.left, top: posicionPanel.top, width: `min(88vw, ${ANCHO_PANEL_MAX}px)` }}
        >
          <div
            className="core flex flex-col overflow-hidden rounded-[calc(1.5rem-0.5rem)]"
            style={{ maxHeight: posicionPanel.maxHeight }}
          >
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
              {mensajes.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">¿Cómo te ayudo? Elige una pregunta o escribe la tuya.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preguntasIniciales.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => elegirTema(t)}
                        className="ease-spring rounded-full border border-silver bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        {t.pregunta}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {mensajes.map((m, i) => (
                    <div key={i} className={`flex ${m.autor === "usuario" ? "justify-end" : "justify-start"}`}>
                      <p
                        className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                          m.autor === "usuario" ? "bg-primary text-white" : "bg-surface-2 text-foreground"
                        }`}
                      >
                        {m.texto}
                      </p>
                    </div>
                  ))}
                  {enviando && (
                    <div className="flex justify-start">
                      <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Pensando…</p>
                    </div>
                  )}
                  <div ref={finMensajesRef} />
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-silver p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviarMensaje(texto);
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Dime qué necesitas…"
                  disabled={enviando}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!texto.trim() || enviando}
                  className="ease-spring flex-none rounded-lg bg-primary/10 p-2 text-primary transition hover:bg-primary/20 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>
              {mensajes.length > 0 && (
                <div className="flex items-center gap-2">
                  <a
                    href={urlWhatsappPropietario(ultimaPreguntaUsuario)}
                    target="_blank"
                    rel="noreferrer"
                    className="ease-spring flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success/15 px-3 py-2 text-xs font-medium text-success transition hover:bg-success/25"
                  >
                    <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Contactar al propietario
                  </a>
                  <button
                    onClick={entendido}
                    className="ease-spring flex-1 rounded-xl brand-plate px-3 py-2 text-xs font-medium text-white transition"
                  >
                    Terminar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={`fixed z-[90] ${posicion ? "" : "bottom-5 right-5"}`}
        style={posicion ? { left: posicion.x, top: posicion.y, right: "auto", bottom: "auto" } : undefined}
      >
        <button
          ref={botonRef}
          onPointerDown={alPointerDown}
          onPointerMove={alPointerMove}
          onPointerUp={alPointerUp}
          onDragStart={(e) => e.preventDefault()}
          aria-label="Abrir asistente (mantén presionado para arrastrar)"
          className="ease-spring relative h-20 w-20 touch-none select-none transition hover:scale-105"
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
    </>
  );
}
