"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Oswald } from "next/font/google";
import { ImagePlus, Download, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { TIPOS_MENTORIA, TIPOS_MENTORIA_VALIDOS, type TipoMentoria } from "@/lib/coordinacion";

// Fuente propia solo para el flyer de Lunes Sinergético — su fondo ya trae
// la cinta roja "LUNES SINERGÉTICO" con una tipografía condensada/bold
// distinta a la del resto de fondos (que usan Arial normal); el tema/nombre/
// fecha que dibuja el canvas encima debe hacer juego con eso, no con el
// resto de tipos.
const oswald = Oswald({ subsets: ["latin"], weight: ["600", "700"] });

// Porte de un generador de flyers que ya funcionaba como herramienta local
// aparte (canvas 2D, sin API de imagen/IA) — ver el HTML original que el
// usuario compartió. Cambios principales al traerlo aquí: los fondos/fotos
// se guardan en Supabase Storage (compartidos entre compus, antes vivían en
// localStorage de un solo navegador) y la lista de mentores sale en vivo de
// Mentores de Coordinación (antes una lista fija escrita a mano).

type CategoriaAsset = "fondo" | "foto";

type FlyerAsset = {
  id: string;
  categoria: CategoriaAsset;
  etiqueta: string;
  archivoNombre: string;
  url: string;
  creadoEn: string;
};

type AlineacionTexto = "left" | "center" | "right";

type LayoutFlyer = {
  px: number; py: number; pw: number; ph: number; pz: number;
  tx: number; ty: number; tw: number; ts: number;
  nx: number; ny: number; ns: number;
  opacidadFondo: number; // 0-100 — opacidad del rectángulo oscuro detrás del tema y del nombre
  alineacionTema: AlineacionTexto;
  fotoBlur: number; // px — difuminado del contorno de la foto del mentor
  sombraTamano: number; // px — shadowBlur de la sombra detrás de la foto
  sombraOpacidad: number; // 0-100
  fx: number; fy: number; // posición de la fecha (solo Lunes Sinergético) — independiente de nx/ny
};

type MentorLigero = { id: string; nombre: string };

type Sesion = { tipo: TipoMentoria; mentor: string; tema: string };

type PendienteSubida = {
  archivo: File;
  previewUrl: string;
  categoria: CategoriaAsset;
  etiqueta: string;
};

const DEFAULT_CFG: LayoutFlyer = {
  px: 64, py: 8, pw: 34, ph: 91, pz: 133,
  tx: 10, ty: 49, tw: 53, ts: 43,
  nx: 44, ny: 91, ns: 42,
  opacidadFondo: 60,
  alineacionTema: "left",
  fotoBlur: 4,
  sombraTamano: 28,
  sombraOpacidad: 45,
  fx: 10,
  fy: 65,
};

// Mismas frases "ancla" que el prototipo original para reconocer cada tipo
// de mentoría dentro de la planeación pegada (texto libre, sin estructura).
const TYPE_ALIASES: Record<TipoMentoria, string[]> = {
  "lunes-prin": ["lunes de principiante", "lunes de principiantes", "mentoria de lunes de principiante"],
  "lunes-sin": ["lunes sinergetico"],
  martes: ["martes de estrategia digital", "estrategia digital"],
  miercoles: ["miercoles de creacion de contenido", "creacion de contenido"],
  jueves: ["jueves de estrategia de venta", "jueves de ventas", "estrategia de ventas", "ventas"],
  viernes: ["viernes de caso de exito", "caso de exito"],
};

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp)$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function score(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  const aa = na.split(" ").filter((w) => w.length > 2);
  const bb = nb.split(" ").filter((w) => w.length > 2);
  const comunes = bb.filter((w) => aa.includes(w)).length;
  return (comunes / (Math.max(aa.length, bb.length) || 1)) * 60;
}

function tipoDesdeTexto(s: string): TipoMentoria | null {
  const n = norm(s);
  for (const tipo of TIPOS_MENTORIA_VALIDOS) {
    if (TYPE_ALIASES[tipo].some((alias) => n.includes(alias) || (alias.includes(n) && n.length > 8))) return tipo;
  }
  return null;
}

// Detecta de qué tipo de mentoría o de qué mentor es un archivo recién
// subido, por su nombre — igual criterio que el prototipo. Si no hay match
// razonable en ninguna de las dos categorías, se deja "sin detectar" para
// que el usuario lo asigne a mano (ver PendienteSubida).
function detectarDesdeNombre(nombreArchivo: string, mentores: MentorLigero[]): { categoria: CategoriaAsset; etiqueta: string } | null {
  const tipo = tipoDesdeTexto(nombreArchivo);
  if (tipo) return { categoria: "fondo", etiqueta: tipo };

  let mejor: { nombre: string; s: number } | null = null;
  for (const m of mentores) {
    const s = score(m.nombre, nombreArchivo);
    if (!mejor || s > mejor.s) mejor = { nombre: m.nombre, s };
  }
  if (mejor && mejor.s >= 55) return { categoria: "foto", etiqueta: mejor.nombre };
  return null;
}

function canonicalMentor(nombre: string, mentores: MentorLigero[]): string {
  const exacto = mentores.find((m) => norm(m.nombre) === norm(nombre));
  if (exacto) return exacto.nombre;
  let mejor: { nombre: string; s: number } | null = null;
  for (const m of mentores) {
    const s = score(m.nombre, nombre);
    if (!mejor || s > mejor.s) mejor = { nombre: m.nombre, s };
  }
  return mejor && mejor.s >= 80 ? mejor.nombre : nombre;
}

function parsePlan(texto: string, mentores: MentorLigero[]): Sesion[] {
  const lineas = texto.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const out: Sesion[] = [];
  let cur: { day: string; mentor: string; topic: string } | null = null;
  let field: "mentor" | "topic" | null = null;

  function finish() {
    if (cur && cur.mentor && cur.topic && !/legendaria/i.test(cur.day)) {
      const tipo = tipoDesdeTexto(cur.day);
      if (tipo) out.push({ tipo, mentor: canonicalMentor(cur.mentor, mentores), tema: cur.topic.trim() });
    }
  }

  for (const line of lineas) {
    const m = line.match(/^.*?((?:lunes|martes|miercoles|miércoles|jueves|viernes)\b[^:]*?)\s*$/iu);
    if (m && !/^semana\b/i.test(line)) {
      finish();
      // Ya no se exige la palabra clave del tipo aquí (antes excluía por
      // error líneas válidas de formatos distintos) — tipoDesdeTexto() en
      // finish() es quien de verdad decide si el tipo se reconoce o no,
      // así una línea rara (ej. "Sesión Especial Synergy Unlimited") se
      // descarta sola sin arruinar la sesión de al lado.
      //
      // "Tipo — Mentor" en la misma línea (formato numerado real: "4. Martes
      // de Estrategia Digital — Diego Hernández") — si viene así, el mentor
      // ya está listo y el tema es la(s) línea(s) siguiente(s) SIN etiqueta
      // (se reutiliza el acumulador de "topic" de abajo). Si no hay guion,
      // sigue el formato original (con "Especialista:"/"Tema:" aparte).
      const partes = m[1].split(/\s[—–-]\s/);
      const mentorInline = partes.length > 1 ? partes[partes.length - 1].trim() : "";
      cur = { day: m[1], mentor: mentorInline, topic: "" };
      field = mentorInline ? "topic" : null;
      continue;
    }
    if (!cur) continue;
    const sp = line.match(/^(?:especialista|mentor|ponente)\s*:\s*(.*)/i);
    const tp = line.match(/^tema\s*:\s*(.*)/i);
    if (sp) {
      cur.mentor = sp[1];
      field = "mentor";
    } else if (tp) {
      cur.topic = tp[1];
      field = "topic";
    } else if (/^contexto|^objetivo|^descubre|^aprende/i.test(line) || /^[🎯]/u.test(line)) {
      field = null;
    } else if (field === "topic" && line.length > 4) {
      cur.topic = cur.topic ? cur.topic + " " + line : line;
    }
  }
  finish();
  return out;
}

// Día de la semana (offset desde el lunes) de cada tipo — para calcular la
// fecha de cada mentoría a partir del lunes de la semana elegida. Las dos de
// lunes comparten offset 0 (mismo día, hora distinta).
const OFFSET_DIA: Record<TipoMentoria, number> = {
  "lunes-prin": 0,
  "lunes-sin": 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
};

function lunesDeEstaSemana(): string {
  const hoy = new Date();
  const dia = hoy.getDay(); // 0=domingo
  const offset = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + offset);
  return `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, "0")}-${String(lunes.getDate()).padStart(2, "0")}`;
}

// El formulario de Mentorías (PanelMentoria) espera "HH:MM" (sus presets de
// hora son "19:00"/"12:00"/"16:00") — TIPOS_MENTORIA.horario es texto para
// mostrar ("7pm", "12pm") y NO calza con eso, así que había que traducirlo o
// la mentoría creada aquí se veía con la hora vacía al abrirla.
const HORA_ISO_POR_TIPO: Record<TipoMentoria, string> = {
  "lunes-prin": "12:00",
  "lunes-sin": "19:00",
  martes: "19:00",
  miercoles: "19:00",
  jueves: "19:00",
  viernes: "16:00",
};

function fechaDeSesion(tipo: TipoMentoria, semanaInicioIso: string): string {
  const [y, m, d] = semanaInicioIso.split("-").map(Number);
  const base = new Date(y, m - 1, d + OFFSET_DIA[tipo]);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

// "2026-10-05" -> "05 OCTUBRE DEL 2026" — mismo formato que ya trae el fondo
// de Lunes Sinergético en su píldora de fecha.
function formatearFechaFlyer(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MESES[Number(m) - 1]} DEL ${y}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// Viernes de Caso de Éxito se excluye de la biblioteca de fondos: no tiene
// imagen propia (no hay tarjeta de marca equivalente en Skool, ver
// TIPOS_MENTORIA en coordinacion.ts) y se decidió no generarle flyer.
const TIPOS_FONDO_BIBLIOTECA = TIPOS_MENTORIA_VALIDOS.filter((t) => t !== "viernes");

const CAMPOS_SLIDER: { k: keyof LayoutFlyer; label: string; min: number; max: number }[] = [
  { k: "pz", label: "Zoom de fotografía (%)", min: 40, max: 220 },
  { k: "tw", label: "Ancho del tema (%)", min: 15, max: 95 },
  { k: "ts", label: "Tamaño del tema (px)", min: 18, max: 95 },
  { k: "ns", label: "Tamaño del nombre (px)", min: 18, max: 95 },
  { k: "opacidadFondo", label: "Opacidad del fondo oscuro (%)", min: 0, max: 100 },
  { k: "fotoBlur", label: "Difuminado del contorno de la foto (px)", min: 0, max: 20 },
  { k: "sombraTamano", label: "Tamaño de la sombra (px)", min: 0, max: 80 },
  { k: "sombraOpacidad", label: "Opacidad de la sombra (%)", min: 0, max: 100 },
];

const OPCIONES_ALINEACION: { valor: AlineacionTexto; label: string }[] = [
  { valor: "left", label: "Izquierda" },
  { valor: "center", label: "Centro" },
  { valor: "right", label: "Derecha" },
];

export function FlyersContenido() {
  const [assets, setAssets] = useState<FlyerAsset[]>([]);
  const [mentores, setMentores] = useState<MentorLigero[]>([]);
  const [layouts, setLayouts] = useState<Record<string, LayoutFlyer>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendientes, setPendientes] = useState<PendienteSubida[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const [plan, setPlan] = useState("");
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [seleccionada, setSeleccionada] = useState(0);
  const [semanaInicio, setSemanaInicio] = useState(lunesDeEstaSemana());
  const [creandoMentorias, setCreandoMentorias] = useState(false);
  const [resultadoCreacion, setResultadoCreacion] = useState<string | null>(null);

  const [tipoActivo, setTipoActivo] = useState<TipoMentoria>(TIPOS_MENTORIA_VALIDOS[0]);
  const [cfg, setCfg] = useState<LayoutFlyer>(DEFAULT_CFG);
  const [fondoId, setFondoId] = useState("");
  const [fotoId, setFotoId] = useState("");
  const [nombreMentor, setNombreMentor] = useState("");
  const [tema, setTema] = useState("");
  // Solo se dibuja/edita para Lunes Sinergético — el resto de fondos no
  // tienen píldora de fecha.
  const [fecha, setFecha] = useState("");
  const [fontListo, setFontListo] = useState(false);

  useEffect(() => {
    document.fonts
      .load(`700 40px ${oswald.style.fontFamily}`)
      .then(() => setFontListo(true))
      .catch(() => setFontListo(true));
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagenesRef = useRef<{ bg: HTMLImageElement | null; p: HTMLImageElement | null }>({ bg: null, p: null });
  const dragRef = useRef<{ target: "photo" | "topic" | "name" | "date"; x: number; y: number; cfg: LayoutFlyer } | null>(null);
  const peticionImagenRef = useRef(0);
  // Canvas auxiliar para componer sombra + foto aisladas entre sí antes de
  // pegarlas sobre el fondo — necesario porque "destination-over" no solo
  // reordena contra los drawImage anteriores de la foto, reordena contra
  // TODO lo ya pintado en el canvas principal (incluido el fondo, que es
  // opaco), así que ahí la sombra se veía invisible sin importar qué tan
  // fuerte fuera el slider.
  const offCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Filtro SVG erode+blur para el difuminado del contorno de la foto — a
  // diferencia de un blur plano (que agrega un halo hacia AFUERA del
  // recorte, sin tocar el delineado blanco que deja el borrado de fondo),
  // feMorphology "come" el canal alfa hacia ADENTRO desde el borde real de
  // la silueta (sin importar cuánto relleno transparente traiga la imagen
  // alrededor), y feGaussianBlur suaviza esa nueva orilla. radius/
  // stdDeviation se actualizan en cada dibujo según el slider.
  const erodeRef = useRef<SVGFEMorphologyElement>(null);
  const blurBordeRef = useRef<SVGFEGaussianBlurElement>(null);

  function cargarTodo() {
    setCargando(true);
    Promise.all([
      fetch("/api/coordinacion/flyers/assets").then((r) => r.json()),
      fetch("/api/coordinacion/mentores?activos=1").then((r) => r.json()),
      fetch("/api/coordinacion/flyers/layouts").then((r) => r.json()),
    ])
      .then(([a, m, l]) => {
        setAssets(a.assets ?? []);
        setMentores((m.mentores ?? []).map((x: { id: string; nombre: string }) => ({ id: x.id, nombre: x.nombre })));
        setLayouts(l.layouts ?? {});
      })
      .catch(() => setError("No se pudo cargar la información"))
      .finally(() => setCargando(false));
  }

  useEffect(cargarTodo, []);

  const fondos = useMemo(() => assets.filter((a) => a.categoria === "fondo"), [assets]);
  const fotos = useMemo(() => assets.filter((a) => a.categoria === "foto"), [assets]);

  function assetFondoDe(tipo: TipoMentoria): FlyerAsset | undefined {
    return fondos.find((a) => a.etiqueta === tipo);
  }

  function mejorFotoPara(mentor: string): FlyerAsset | null {
    let mejor: { asset: FlyerAsset; s: number } | null = null;
    for (const a of fotos) {
      const s = score(a.etiqueta, mentor);
      if (!mejor || s > mejor.s) mejor = { asset: a, s };
    }
    return mejor && mejor.s >= 55 ? mejor.asset : null;
  }

  // --- Subida de imágenes --------------------------------------------

  function alSeleccionarArchivos(lista: FileList | null) {
    if (!lista) return;
    const nuevos: PendienteSubida[] = Array.from(lista).map((archivo) => {
      const detectado = detectarDesdeNombre(archivo.name, mentores);
      return {
        archivo,
        previewUrl: URL.createObjectURL(archivo),
        categoria: detectado?.categoria ?? "fondo",
        etiqueta: detectado?.etiqueta ?? "",
      };
    });
    setPendientes((p) => [...p, ...nuevos]);
  }

  function actualizarPendiente(i: number, cambios: Partial<PendienteSubida>) {
    setPendientes((p) => p.map((item, idx) => (idx === i ? { ...item, ...cambios } : item)));
  }

  function quitarPendiente(i: number) {
    setPendientes((p) => p.filter((_, idx) => idx !== i));
  }

  async function confirmarSubidas() {
    const listos = pendientes.filter((p) => p.etiqueta);
    if (listos.length === 0) return;
    setSubiendo(true);
    try {
      for (const item of listos) {
        const form = new FormData();
        form.append("archivo", item.archivo);
        form.append("categoria", item.categoria);
        form.append("etiqueta", item.etiqueta);
        const r = await fetch("/api/coordinacion/flyers/assets", { method: "POST", body: form });
        if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo subir una imagen");
      }
      setPendientes((p) => p.filter((item) => !listos.includes(item)));
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron subir las imágenes");
    } finally {
      setSubiendo(false);
    }
  }

  async function eliminarAsset(id: string) {
    if (!window.confirm("¿Quitar esta imagen?")) return;
    await fetch(`/api/coordinacion/flyers/assets/${id}`, { method: "DELETE" });
    cargarTodo();
  }

  // Reemplazo directo de un solo fondo/foto de la biblioteca (a diferencia
  // de "Elegir imágenes", aquí ya se sabe la categoría/etiqueta exacta —
  // sin pasar por la fila de revisión de pendientes.
  const [subiendoDirecto, setSubiendoDirecto] = useState<string | null>(null);
  async function reemplazarAsset(categoria: CategoriaAsset, etiqueta: string, archivo: File) {
    setSubiendoDirecto(etiqueta);
    const form = new FormData();
    form.append("archivo", archivo);
    form.append("categoria", categoria);
    form.append("etiqueta", etiqueta);
    try {
      const r = await fetch("/api/coordinacion/flyers/assets", { method: "POST", body: form });
      if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo subir la imagen");
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setSubiendoDirecto(null);
    }
  }

  // --- Planeación -------------------------------------------------------

  function analizarPlan() {
    const detectadas = parsePlan(plan, mentores);
    setSesiones(detectadas);
    setSeleccionada(0);
    if (detectadas.length) elegirSesion(detectadas[0]);
  }

  function elegirSesion(s: Sesion) {
    setTipoActivo(s.tipo);
    const base = s.tipo === "lunes-sin" ? { ...DEFAULT_CFG, alineacionTema: "center" as const } : DEFAULT_CFG;
    setCfg({ ...base, ...(layouts[s.tipo] || {}) });
    setNombreMentor(s.mentor);
    setTema(s.tema);
    setFecha(formatearFechaFlyer(fechaDeSesion(s.tipo, semanaInicio)));
    setFondoId(assetFondoDe(s.tipo)?.id ?? "");
    setFotoId(mejorFotoPara(s.mentor)?.id ?? "");
  }

  // El horario de cada tipo ya es un default fijo (TIPOS_MENTORIA) — lo
  // único que de verdad aporta la planeación es mentor/tipo/tema, así que
  // con eso basta para crear la mentoría completa (fecha = lunes elegido +
  // el día de la semana de su tipo).
  async function crearMentoriasDeLaSemana() {
    if (sesiones.length === 0) return;
    setCreandoMentorias(true);
    setResultadoCreacion(null);
    try {
      const existentes = await fetch("/api/coordinacion/mentorias").then((r) => r.json());
      const yaExiste = (tipo: TipoMentoria, fecha: string) =>
        (existentes.mentorias ?? []).some((m: { tipoMentoria: TipoMentoria; fecha: string }) => m.tipoMentoria === tipo && m.fecha === fecha);

      let creadas = 0;
      let saltadas = 0;
      for (const s of sesiones) {
        const fecha = fechaDeSesion(s.tipo, semanaInicio);
        if (yaExiste(s.tipo, fecha)) {
          saltadas++;
          continue;
        }
        const mentorId = mentores.find((m) => norm(m.nombre) === norm(s.mentor))?.id ?? null;
        const r = await fetch("/api/coordinacion/mentorias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipoMentoria: s.tipo,
            tema: s.tema,
            fecha,
            hora: HORA_ISO_POR_TIPO[s.tipo],
            mentorId,
          }),
        });
        if (r.ok) {
          creadas++;
          // Plus: generar y guardar de una vez los copys de difusión (previa
          // y plataforma) — mismo cálculo que el botón "Generar" de la
          // pestaña Difusión, solo que automático al crear desde la semana.
          const { id } = await r.json();
          const copy = await fetch(`/api/coordinacion/mentorias/${id}`, { method: "POST" }).then((x) => x.json());
          await fetch(`/api/coordinacion/mentorias/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seccion: "difusion",
              copyPrevia: copy.copyPrevia ?? "",
              copyPlataforma: copy.copyPlataforma ?? "",
              checklist: { canva: false, telegram: false, whatsapp: false, marketing: false, skool: false },
            }),
          });
        }
      }
      setResultadoCreacion(`${creadas} mentoría(s) creada(s)${saltadas ? `, ${saltadas} ya existían para esa fecha` : ""}.`);
    } catch {
      setResultadoCreacion("No se pudieron crear las mentorías.");
    } finally {
      setCreandoMentorias(false);
    }
  }

  // --- Canvas -------------------------------------------------------

  useEffect(() => {
    const req = ++peticionImagenRef.current;
    const bgAsset = assets.find((a) => a.id === fondoId);
    const fotoAsset = assets.find((a) => a.id === fotoId);
    Promise.all([bgAsset ? loadImage(bgAsset.url) : null, fotoAsset ? loadImage(fotoAsset.url) : null])
      .then(([bg, p]) => {
        if (req !== peticionImagenRef.current) return;
        imagenesRef.current = { bg, p };
        dibujar();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fondoId, fotoId, assets]);

  function wrap(ctx: CanvasRenderingContext2D, texto: string, maxWidth: number, font: string): string[] {
    ctx.font = font;
    const lineas: string[] = [];
    for (const parrafo of texto.split("\n")) {
      let linea = "";
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = linea ? linea + " " + palabra : palabra;
        if (ctx.measureText(prueba).width > maxWidth && linea) {
          lineas.push(linea);
          linea = palabra;
        } else linea = prueba;
      }
      if (linea) lineas.push(linea);
    }
    return lineas;
  }

  function photoRect(c: LayoutFlyer) {
    const img = imagenesRef.current.p;
    if (!img) return { x: 0, y: 0, w: 0, h: 0 };
    const w = c.pw * 16;
    const h = c.ph * 9;
    const scale = Math.min(w / img.width, h / img.height) * ((c.pz || 100) / 100);
    const dw = img.width * scale;
    const dh = img.height * scale;
    return { x: c.px * 16 + (w - dw) / 2, y: c.py * 9 + (h - dh) / 2, w: dw, h: dh };
  }

  function dibujar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { bg, p } = imagenesRef.current;

    ctx.clearRect(0, 0, 1600, 900);
    if (bg) ctx.drawImage(bg, 0, 0, 1600, 900);
    else {
      ctx.fillStyle = "#1a2641";
      ctx.fillRect(0, 0, 1600, 900);
      ctx.fillStyle = "#7d90af";
      ctx.font = "32px Arial";
      ctx.fillText("Sube un fondo para este tipo de mentoría", 45, 70);
    }
    if (p) {
      const r = photoRect(cfg);
      if (!offCanvasRef.current) {
        offCanvasRef.current = document.createElement("canvas");
        offCanvasRef.current.width = 1600;
        offCanvasRef.current.height = 900;
      }
      const off = offCanvasRef.current;
      const octx = off.getContext("2d")!;
      octx.clearRect(0, 0, 1600, 900);

      // Sombra primero (detrás) — sigue la silueta completa, sin el erode de
      // abajo (la sombra debe seguir viéndose del tamaño real de la persona).
      if (cfg.sombraOpacidad > 0) {
        octx.save();
        octx.shadowColor = `rgba(0,0,0,${cfg.sombraOpacidad / 100})`;
        octx.shadowBlur = cfg.sombraTamano;
        octx.shadowOffsetY = cfg.sombraTamano / 2;
        octx.drawImage(p, r.x, r.y, r.w, r.h);
        octx.restore();
      }

      // Foto, con el borde erosionado+difuminado hacia ADENTRO si el slider
      // está arriba de 0 — erode "come" el canal alfa desde el contorno real
      // de la silueta (sin importar cuánto relleno transparente traiga la
      // imagen alrededor, a diferencia de encoger el rectángulo destino),
      // así sí tapa el delineado blanco que deja el borrado de fondo en vez
      // de solo agregarle un brillo por fuera.
      octx.save();
      if (cfg.fotoBlur > 0) {
        erodeRef.current?.setAttribute("radius", String(cfg.fotoBlur));
        blurBordeRef.current?.setAttribute("stdDeviation", String(cfg.fotoBlur * 0.6));
        octx.filter = "url(#flyer-borde-difuminado)";
      }
      octx.drawImage(p, r.x, r.y, r.w, r.h);
      octx.restore();

      ctx.drawImage(off, 0, 0);
    }

    const alpha = cfg.opacidadFondo / 100;
    // Lunes Sinergético usa un fondo distinto (ya trae la cinta roja "LUNES
    // SINERGÉTICO" y dos píldoras blancas vacías para fecha/nombre) — el
    // tema va directo sobre la foto sin caja oscura, y nombre/fecha se
    // escriben en rojo DENTRO de esas píldoras en vez de en una caja negra.
    const esLunesSin = tipoActivo === "lunes-sin";
    const rojoSinergetico = "#E2141C";
    const fuenteSinergetico = oswald.style.fontFamily;

    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,.65)";
    ctx.shadowBlur = esLunesSin ? 14 : 8;
    ctx.font = esLunesSin ? `700 ${cfg.ts}px ${fuenteSinergetico}` : `800 ${cfg.ts}px Arial`;
    const topic = tema || "Aquí aparecerá el tema de la mentoría";
    const ls = wrap(ctx, topic, cfg.tw * 16, ctx.font);
    const tx = cfg.tx * 16;
    const ty = cfg.ty * 9;
    const lh = cfg.ts * 1.17;
    const padX = 22;
    const padY = 15;
    const anchoContenedor = cfg.tw * 16;
    const anchoLinea = Math.max(80, ...ls.map((l) => ctx.measureText(l).width));
    // La caja se ajusta al ancho del texto (no al contenedor completo), pero
    // su posición dentro del contenedor sí depende de la alineación elegida.
    const cajaX =
      cfg.alineacionTema === "center"
        ? tx + (anchoContenedor - anchoLinea) / 2
        : cfg.alineacionTema === "right"
          ? tx + anchoContenedor - anchoLinea
          : tx;
    if (!esLunesSin) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(9,23,43,${alpha})`;
      ctx.beginPath();
      ctx.roundRect(cajaX - padX, ty - padY, anchoLinea + padX * 2, ls.length * lh + padY * 2, 18);
      ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = cfg.alineacionTema;
    const textoX = cfg.alineacionTema === "center" ? cajaX + anchoLinea / 2 : cfg.alineacionTema === "right" ? cajaX + anchoLinea : cajaX;
    if (esLunesSin) {
      // Sin caja detrás, el fondo (foto + viñeta) puede variar de contraste
      // — un contorno negro grueso mantiene el texto legible en cualquier
      // foto, no solo en la de prueba.
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineJoin = "round";
      ls.forEach((l, i) => ctx.strokeText(l, textoX, ty + i * lh));
    }
    ls.forEach((l, i) => ctx.fillText(l, textoX, ty + i * lh));
    ctx.textAlign = "left";
    ctx.shadowBlur = 0;

    if (esLunesSin) {
      // Nombre y fecha van DENTRO de las dos píldoras blancas que ya trae el
      // fondo — nx/ny se arrastran hasta el centro de la píldora de abajo
      // (nombre) una sola vez por tipo, y la fecha se calcula a una
      // distancia fija arriba de esa misma posición (las dos píldoras del
      // fondo están siempre a la misma distancia entre sí).
      ctx.font = `700 ${cfg.ns}px ${fuenteSinergetico}`;
      const mentorText = (nombreMentor || "Nombre del especialista").toUpperCase();
      const nameX = cfg.nx * 16;
      const nameY = cfg.ny * 9;
      ctx.save();
      ctx.translate(nameX, nameY);
      ctx.transform(1, 0, -0.18, 1, 0, 0);
      ctx.textAlign = "center";
      ctx.fillStyle = rojoSinergetico;
      ctx.fillText(mentorText, 0, 0);
      ctx.restore();

      if (fecha) {
        const fechaSize = cfg.ns * 0.55;
        ctx.font = `700 ${fechaSize}px ${fuenteSinergetico}`;
        ctx.save();
        ctx.translate(cfg.fx * 16, cfg.fy * 9);
        ctx.transform(1, 0, -0.18, 1, 0, 0);
        ctx.textAlign = "center";
        ctx.fillStyle = rojoSinergetico;
        ctx.fillText(fecha.toUpperCase(), 0, 0);
        ctx.restore();
      }
      ctx.textAlign = "left";
      return;
    }

    ctx.font = `bold ${cfg.ns}px Arial`;
    const mentorText = nombreMentor || "Nombre del especialista";
    const nameX = cfg.nx * 16;
    const nameY = cfg.ny * 9;
    const namePadX = 22;
    const namePadY = 10;
    const nameW = ctx.measureText(mentorText).width;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha + 0.1)})`;
    ctx.beginPath();
    ctx.roundRect(nameX - namePadX, nameY - namePadY, nameW + namePadX * 2, cfg.ns * 1.22 + namePadY * 2, 16);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.fillText(mentorText, nameX, nameY);
    ctx.shadowBlur = 0;
  }

  useEffect(dibujar, [cfg, tema, nombreMentor, fecha, tipoActivo, fontListo]);

  function actualizarCfg(parcial: Partial<LayoutFlyer>) {
    setCfg((c) => {
      const nuevo = { ...c, ...parcial };
      guardarLayoutDebounced(tipoActivo, nuevo);
      return nuevo;
    });
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function guardarLayoutDebounced(tipo: TipoMentoria, nuevo: LayoutFlyer) {
    setLayouts((l) => ({ ...l, [tipo]: nuevo }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch("/api/coordinacion/flyers/layouts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoMentoria: tipo, cfg: nuevo }),
      }).catch(() => {});
    }, 500);
  }

  function restablecer() {
    setCfg(DEFAULT_CFG);
    guardarLayoutDebounced(tipoActivo, DEFAULT_CFG);
  }

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * 1600) / r.width, y: ((e.clientY - r.top) * 900) / r.height };
  }

  function topicHeight(ctx: CanvasRenderingContext2D) {
    ctx.font = `800 ${cfg.ts}px Arial`;
    return wrap(ctx, tema || "Aquí aparecerá el tema de la mentoría", cfg.tw * 16, ctx.font).length * cfg.ts * 1.17;
  }

  function hitTest(x: number, y: number): "photo" | "topic" | "name" | "date" | null {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    const cajas: { target: "photo" | "topic" | "name" | "date"; x: number; y: number; w: number; h: number }[] = [
      { target: "name", x: cfg.nx * 16, y: cfg.ny * 9, w: Math.max(200, (nombreMentor || "Nombre").length * cfg.ns * 0.63), h: cfg.ns * 1.35 },
      { target: "topic", x: cfg.tx * 16, y: cfg.ty * 9, w: cfg.tw * 16, h: topicHeight(ctx) },
      { target: "photo", ...photoRect(cfg) },
    ];
    // La fecha solo se dibuja (y se puede arrastrar) en Lunes Sinergético.
    if (tipoActivo === "lunes-sin" && fecha) {
      cajas.push({ target: "date", x: cfg.fx * 16, y: cfg.fy * 9, w: Math.max(150, fecha.length * cfg.ns * 0.55 * 0.6), h: cfg.ns * 0.55 * 1.35 });
    }
    for (const b of cajas) {
      if (b.target === "photo" && !imagenesRef.current.p) continue;
      if (x >= b.x - 12 && x <= b.x + b.w + 12 && y >= b.y - 12 && y <= b.y + b.h + 12) return b.target;
    }
    return null;
  }

  function alPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = canvasPos(e);
    const target = hitTest(x, y);
    if (!target) return;
    dragRef.current = { target, x, y, cfg };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function alPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = canvasPos(e);
    if (!dragRef.current) return;
    const dx = (x - dragRef.current.x) / 16;
    const dy = (y - dragRef.current.y) / 9;
    const [kx, ky] =
      dragRef.current.target === "photo"
        ? (["px", "py"] as const)
        : dragRef.current.target === "topic"
          ? (["tx", "ty"] as const)
          : dragRef.current.target === "date"
            ? (["fx", "fy"] as const)
            : (["nx", "ny"] as const);
    const base = dragRef.current.cfg;
    actualizarCfg({
      [kx]: Math.max(0, Math.min(100, Math.round((base[kx] + dx) * 10) / 10)),
      [ky]: Math.max(0, Math.min(100, Math.round((base[ky] + dy) * 10) / 10)),
    } as Partial<LayoutFlyer>);
  }

  function alPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  function descargar() {
    dibujar();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `Flyer-${norm(TIPOS_MENTORIA[tipoActivo].label).replace(/ /g, "-")}.png`;
    a.click();
  }

  if (cargando) return <p className="py-12 text-center text-sm text-muted">Cargando…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Generador de Flyers</h1>
        <p className="text-sm text-muted">Sube tus fondos y fotos una vez, pega la planeación semanal y genera cada flyer.</p>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      {/* 1. Planeación semanal */}
      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core space-y-3 rounded-[calc(1.75rem-0.5rem)] p-6">
          <h3 className="text-sm font-semibold text-foreground">1. Planeación semanal</h3>
          <textarea
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder="Pega aquí toda la planeación semanal…"
            className="h-40 w-full rounded-lg border border-silver bg-surface-2 px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
          />
          <button onClick={analizarPlan} className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2 text-sm font-medium text-white transition">
            <Wand2 className="h-4 w-4" strokeWidth={1.75} />
            Analizar planeación
          </button>
          {sesiones.length > 0 && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">{sesiones.length} mentoría(s) detectada(s) — Legendaria excluida</label>
                <select
                  value={seleccionada}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setSeleccionada(i);
                    elegirSesion(sesiones[i]);
                  }}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none"
                >
                  {sesiones.map((s, i) => (
                    <option key={i} value={i}>
                      {TIPOS_MENTORIA[s.tipo].label} — {s.mentor}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-silver p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Semana del (lunes)</label>
                  <input
                    type="date"
                    value={semanaInicio}
                    onChange={(e) => setSemanaInicio(e.target.value)}
                    className="rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none"
                  />
                </div>
                <button
                  onClick={crearMentoriasDeLaSemana}
                  disabled={creandoMentorias}
                  className="ease-spring rounded-xl brand-plate px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
                >
                  {creandoMentorias ? "Creando…" : "Crear mentorías de la semana"}
                </button>
                {resultadoCreacion && <p className="text-xs text-muted">{resultadoCreacion}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Editar y descargar */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="shell rounded-[1.75rem] p-2 diffused">
          <div className="core rounded-[calc(1.75rem-0.5rem)] p-4">
            {/* Filtro invisible usado por dibujar() (octx.filter =
                "url(#flyer-borde-difuminado)") para el difuminado del
                contorno de la foto — radius/stdDeviation se actualizan en
                cada dibujo según el slider, no son fijos. */}
            <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
              <filter id="flyer-borde-difuminado">
                <feMorphology ref={erodeRef} operator="erode" radius="0" in="SourceGraphic" result="erosionado" />
                <feGaussianBlur ref={blurBordeRef} in="erosionado" stdDeviation="0" />
              </filter>
            </svg>
            <canvas
              ref={canvasRef}
              width={1600}
              height={900}
              className="w-full touch-none rounded-xl border border-silver"
              onPointerDown={alPointerDown}
              onPointerMove={alPointerMove}
              onPointerUp={alPointerUp}
              onPointerCancel={alPointerUp}
            />
            <p className="mt-2 text-xs text-muted">
              Arrastra la foto, el tema{tipoActivo === "lunes-sin" ? ", el nombre o la fecha" : " o el nombre"} directamente sobre la imagen para
              moverlos.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={descargar} className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2 text-sm font-medium text-white transition">
                <Download className="h-4 w-4" strokeWidth={1.75} />
                Descargar PNG
              </button>
              <button onClick={restablecer} className="ease-spring flex items-center gap-1.5 rounded-xl border border-silver px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2">
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                Restablecer posiciones
              </button>
            </div>
          </div>
        </div>

        <div className="shell rounded-[1.75rem] p-2 diffused">
          <div className="core space-y-4 rounded-[calc(1.75rem-0.5rem)] p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Fondo</label>
              <select value={fondoId} onChange={(e) => setFondoId(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none">
                <option value="">Sin seleccionar</option>
                {fondos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {TIPOS_MENTORIA[a.etiqueta as TipoMentoria]?.label ?? a.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Fotografía</label>
              <select value={fotoId} onChange={(e) => setFotoId(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none">
                <option value="">Sin seleccionar</option>
                {fotos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nombre del especialista</label>
              <input
                value={nombreMentor}
                onChange={(e) => {
                  setNombreMentor(e.target.value);
                  const m = mentores.find((m) => norm(m.nombre) === norm(e.target.value));
                  if (m) setFotoId(mejorFotoPara(m.nombre)?.id ?? "");
                }}
                list="catalogo-mentores"
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none"
              />
              <datalist id="catalogo-mentores">
                {mentores.map((m) => (
                  <option key={m.id} value={m.nombre} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Tema de la mentoría</label>
              <textarea
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                className="h-24 w-full rounded-lg border border-silver bg-surface-2 px-3 py-2 text-sm outline-none"
              />
            </div>
            {tipoActivo === "lunes-sin" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Fecha (solo este flyer la muestra)</label>
                <input
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  placeholder="05 OCTUBRE DEL 2026"
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none"
                />
              </div>
            )}

            <div className="space-y-3 border-t border-silver pt-3">
              <div>
                <span className="mb-1 block text-xs text-muted">Alineación del tema</span>
                <div className="flex gap-1.5 rounded-lg border border-silver bg-surface-2 p-1">
                  {OPCIONES_ALINEACION.map(({ valor, label }) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => actualizarCfg({ alineacionTema: valor })}
                      className={`ease-spring flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                        cfg.alineacionTema === valor ? "bg-surface text-primary-deep shadow-sm" : "text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {CAMPOS_SLIDER.map(({ k, label, min, max }) => (
                <label key={k} className="block text-xs text-muted">
                  {label}
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={cfg[k]}
                      onChange={(e) => actualizarCfg({ [k]: Number(e.target.value) } as Partial<LayoutFlyer>)}
                      className="w-full"
                    />
                    <span className="w-8 flex-none text-right text-foreground">{cfg[k]}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Biblioteca de imágenes */}
      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core space-y-4 rounded-[calc(1.75rem-0.5rem)] p-6">
          <h3 className="text-sm font-semibold text-foreground">3. Biblioteca de imágenes</h3>
          <p className="text-xs text-muted">
            Sube varias a la vez. El tipo de mentoría o el mentor se detecta por el nombre del archivo — revisa antes de
            guardar, por si alguna no se detectó o la planeación trae el nombre distinto.
          </p>
          <label className="ease-spring flex w-fit cursor-pointer items-center gap-1.5 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2">
            <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
            Elegir imágenes
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => alSeleccionarArchivos(e.target.files)} />
          </label>

          {pendientes.length > 0 && (
            <div className="space-y-2 rounded-xl border border-silver p-3">
              {pendientes.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 border-b border-silver/60 pb-2 last:border-0 last:pb-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.previewUrl} alt="" className="h-12 w-20 flex-none rounded-lg object-cover" />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{p.archivo.name}</span>
                  <select
                    value={p.categoria}
                    onChange={(e) => actualizarPendiente(i, { categoria: e.target.value as CategoriaAsset, etiqueta: "" })}
                    className="rounded-lg border border-silver bg-surface-2 px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="fondo">Fondo</option>
                    <option value="foto">Foto de mentor</option>
                  </select>
                  <select
                    value={p.etiqueta}
                    onChange={(e) => actualizarPendiente(i, { etiqueta: e.target.value })}
                    className={`rounded-lg border px-2 py-1.5 text-xs outline-none ${p.etiqueta ? "border-silver bg-surface-2" : "border-warning bg-warning/10"}`}
                  >
                    <option value="">Sin detectar — elige una</option>
                    {p.categoria === "fondo"
                      ? TIPOS_FONDO_BIBLIOTECA.map((t) => (
                          <option key={t} value={t}>
                            {TIPOS_MENTORIA[t].label}
                          </option>
                        ))
                      : mentores.map((m) => (
                          <option key={m.id} value={m.nombre}>
                            {m.nombre}
                          </option>
                        ))}
                  </select>
                  <button onClick={() => quitarPendiente(i)} className="ease-spring flex-none rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              <button
                onClick={confirmarSubidas}
                disabled={subiendo || pendientes.every((p) => !p.etiqueta)}
                className="ease-spring rounded-xl brand-plate px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
              >
                {subiendo ? "Subiendo…" : `Guardar ${pendientes.filter((p) => p.etiqueta).length} imagen(es)`}
              </button>
            </div>
          )}

          {/* Sin miniaturas a propósito — cargar 20 imágenes solo para esta
              lista es lo que hacía lenta la página; el nombre alcanza para
              saber qué ya está subido. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Fondos por tipo ({fondos.length}/{TIPOS_FONDO_BIBLIOTECA.length})</p>
              <ul className="divide-y divide-silver/60 rounded-xl border border-silver">
                {TIPOS_FONDO_BIBLIOTECA.map((tipo) => {
                  const a = assetFondoDe(tipo);
                  return (
                    <FilaBiblioteca
                      key={tipo}
                      etiqueta={TIPOS_MENTORIA[tipo].label}
                      subido={!!a}
                      cargando={subiendoDirecto === tipo}
                      onElegirArchivo={(archivo) => reemplazarAsset("fondo", tipo, archivo)}
                      onEliminar={a ? () => eliminarAsset(a.id) : undefined}
                    />
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Fotos por mentor ({fotos.length}/{mentores.length})</p>
              <ul className="max-h-80 divide-y divide-silver/60 overflow-y-auto rounded-xl border border-silver">
                {mentores.map((m) => {
                  const a = fotos.find((f) => f.etiqueta === m.nombre);
                  return (
                    <FilaBiblioteca
                      key={m.id}
                      etiqueta={m.nombre}
                      subido={!!a}
                      cargando={subiendoDirecto === m.nombre}
                      onElegirArchivo={(archivo) => reemplazarAsset("foto", m.nombre, archivo)}
                      onEliminar={a ? () => eliminarAsset(a.id) : undefined}
                    />
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilaBiblioteca({
  etiqueta,
  subido,
  cargando,
  onElegirArchivo,
  onEliminar,
}: {
  etiqueta: string;
  subido: boolean;
  cargando: boolean;
  onElegirArchivo: (archivo: File) => void;
  onEliminar?: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-foreground">{etiqueta}</span>
      <span className={`flex-none text-xs ${subido ? "text-success" : "text-muted"}`}>{subido ? "Subida" : "Sin imagen"}</span>
      <label className={`ease-spring flex-none cursor-pointer text-xs font-medium text-primary transition hover:underline ${cargando ? "pointer-events-none opacity-50" : ""}`}>
        {cargando ? "Subiendo…" : subido ? "Reemplazar" : "Subir"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) onElegirArchivo(archivo);
            e.target.value = "";
          }}
        />
      </label>
      {onEliminar && (
        <button onClick={onEliminar} className="ease-spring flex-none rounded-lg p-1 text-muted transition hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}
    </li>
  );
}
