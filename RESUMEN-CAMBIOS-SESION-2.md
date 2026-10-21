# Resumen — Captura de Datos (integración de "Escáner de hojas")

Se está integrando una app aparte ("Escáner de hojas", lee con IA fotos/PDF de hojas de inscripción en papel y las
guarda en Excel + Google Drive) como nueva subplataforma del CRM, **"Captura de Datos"**, rediseñada para que varias
personas trabajen el mismo evento en paralelo (antes era de un solo operador, todo en el disco de esa computadora).

Todo el código ya viaja con `git pull` (está en `main`). Lo que **no** viaja solo son las variables de entorno nuevas
(`.env.local` nunca se sube) y hay que correr `npm install` por las dependencias nuevas. Ver abajo.

---

## Qué hacer en la otra máquina

```
git pull
npm install
```

Agrega esto a tu `.env.local` (los valores reales, ya configurados en Vercel/Supabase — pégalos tal cual):

```
ANTHROPIC_API_KEY=
CAPTURA_DATOS_CLAUDE_MODEL=claude-sonnet-5-5
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbzpH00pglfmbucCq43GMaV0cNPjJCrdb3D1Z_koGNaF3wxRvG2Cp1YA7vYMAodZlb40/exec
APPS_SCRIPT_SECRET=KOri7S2BQF-TG0Ool9eCYS55TvFNk5ri
AXIS_TELEFONO_URL=
```

`ANTHROPIC_API_KEY` sigue vacío — todavía no se consiguió. Sin ella, la lectura con IA de las hojas no funciona
(tira "Falta configurar ANTHROPIC_API_KEY"), pero el resto de la sección sí.

**No hace falta tocar Supabase**: las tablas nuevas (`cap_eventos`, `cap_hojas`, etc.) y los buckets de Storage
(`cap-fotos`, `cap-excel`) ya están creados en la base de datos compartida — se ven solos desde cualquier máquina.

La carpeta `Escaner de hojas/` (el proyecto original, usado como material de referencia para portar el código) **no
está en git a propósito** — ya no hace falta: todo lo útil ya se copió/adaptó dentro de `src/`. Si la tienes en esta
PC y quieres conservarla de respaldo, es tuya; no afecta nada seguir trabajando sin ella en la otra máquina.

---

## En qué va el avance (7 fases, ver el plan completo más abajo)

- ✅ **Fase 1** — Esquema de Supabase (tablas `cap_*` + función `tomar_hoja_libre`, ya corridas), dependencias nuevas
  (`@anthropic-ai/sdk`, `exceljs`, `pdfjs-dist`, `react-zoom-pan-pinch`, `zod`), plantilla de Excel.
- ✅ **Fase 2** — Toda la librería portada: `src/lib/captura-datos/` (modelo, validación, `db.ts` con el CRUD real,
  Google Drive, Axis por teléfono, lectura con IA, generación de Excel). Probada de punta a punta contra Supabase.
- ✅ **Fase 3** — Las 13 rutas API bajo `src/app/api/captura-datos/*` (eventos, hojas, tomar/liberar, confirmar,
  Drive, Axis). Probadas de punta a punta (crear evento → hojas → tomar → confirmar → folio duplicado → eliminar).
- ⏳ **Fase 4** — Probar Google Drive de verdad (ya con las credenciales reales). Falta que Samuel pase el enlace de
  una carpeta de Drive de prueba para completarla.
- ⏳ **Fase 5** — Probar la lectura con IA de verdad (falta `ANTHROPIC_API_KEY`).
- ✅ **Fase 6** — UI escrita (sin probar en navegador todavía): lista de eventos, detalle de evento y editor de hojas. Ver
  "Cambios de la sesión 3" abajo.
- ⏳ **Fase 7** — Borrar la carpeta `Escaner de hojas/` cuando ya no haga falta de referencia (con tu visto bueno).

Acceso: **solo admin** por ahora (`verCapturaDatos` en `permisos.ts`) — coordinador/abeja ven "en construcción".

### Decisiones de diseño ya tomadas (para no repreguntarlas)
- Rediseño multiusuario completo (no "un operador a la vez"): varias personas toman hojas libres del mismo evento en
  paralelo, con bloqueo automático (`tomar_hoja_libre`, `for update skip locked`, expira solo a los 10 min).
- Sin tabla de "borradores" aparte — el autoguardado es un `PATCH` directo a la fila de la hoja (`cap_hojas.campos`).
- Sin Supabase Realtime — el CRM no lo usa en ningún lado; el avance del evento se refresca con polling
  (`setInterval`), igual que el resto del proyecto.
- `lib/axis.ts` de Captura de Datos (busca por teléfono) es un archivo aparte del `src/lib/axis.ts` del Club (busca
  por correo, otro endpoint) — no se fusionan.
- Se quitó el modo "Claude Code local" del lector de IA original (no sirve en Vercel) — solo queda el modo API real.

El plan completo y detallado (con el esquema SQL exacto, el mapeo de cada archivo portado, y el diseño de cada ruta)
está guardado en esta sesión de Claude Code — si se retoma en la otra máquina desde una sesión nueva, dile a Claude
que lea este resumen primero y que continúe con la Fase 4 en adelante.


---

## Cambios de la sesión 3 (documentar aquí cada cambio nuevo)

**UI (Fase 6)** — `src/components/captura-datos/` + `src/app/(app)/captura-datos/`:
- `ListaEventos.tsx` (página `/captura-datos`): eventos con barra de avance, polling cada 15 s, descarga de Excel.
- `NuevoEventoModal.tsx`: pega el enlace de Drive → crea el evento; origen "Drive" (importa las subcarpetas
  Completos/Apartados/Interesados) o "computadora" (se suben fotos después).
- `EventoDetalle.tsx` (`/captura-datos/[id]`): tomar siguiente hoja, subir fotos (solo imágenes, se pasan a JPEG en el
  navegador), guardar en Drive, reabrir (admin), Excel.
- `EditorHoja.tsx`: foto con zoom + formulario, autoguardado (1.5 s, un PATCH a la vez), "Leer con IA", comparación con
  Axis, folio duplicado con "confirmar de todos modos", "Guardar y salir" (guarda y libera).
- `Modal.tsx`, `src/lib/captura-datos/cliente.ts` (wrapper `api()` y `imagenAJpeg`).

**Servidor** (a raíz de la revisión de código):
- `db.ts`: `actualizarCamposHoja` y `confirmarHoja` ahora son atómicos (`.eq("version")`), el autoguardado renueva el
  bloqueo de 10 min y rechaza si otra persona tiene la hoja; `confirmarHoja` sube `version` y respeta el bloqueo.
- `hojas/[id]` y `extract`: responden 409 si la hoja cambió u otra persona la tiene.
- `hojas/subir`: valida evento abierto, metadatos (zod), máx. 10 MB y JPEG real, todo antes de crear filas.

**Después (misma sesión):**
- **PDF tal cual** (sin partir en páginas): `hojas/subir` acepta JPEG o PDF (se detecta por los primeros bytes, máx. 15 MB);
  se guarda como `<id>.pdf`; `hojas/[id]/foto` lo sirve inline desde el mismo origen; el editor lo muestra en un
  `<iframe>`; `extract` lo manda a la IA como bloque `document` (`extractFromImage(base64, mime)`).
- **Asignación de personas por evento:** botón "Personas" (solo admin) en el detalle del evento →
  `AsignacionesModal.tsx`; nuevo `GET .../asignaciones` y `listarAsignaciones` en `db.ts`. Hoy es informativo: ninguna
  ruta restringe por asignación.
- **Tests (vitest 3, `npm test` / `npm run test:coverage`):** 36 tests sobre `fields`, `conciliacion`, `enlaces`,
  `validacion`/`modelo` y `cliente` (cobertura 81 % de esos archivos). **No** cubren `db.ts`, `google.ts`, `extract.ts`,
  rutas ni componentes (necesitan Supabase/Drive/IA; se prueban en vivo).
- **`scripts/evaluar-lectura-ia.ts`** (comparar modelos con poco gasto): por defecto solo cuenta tokens (gratis);
  `--ejecutar` procesa máx. `--max` archivos (por defecto 2, tope duro 5). Los precios se pasan por flag. Uso:
  `npx tsx scripts/evaluar-lectura-ia.ts <carpeta> --modelo=claude-sonnet-5-5`.

**Fase 4 (parcial, solo lectura de Drive):** con la carpeta de prueba "Test" funcionan `infoCarpeta`, `listarArchivos` y
`descargarArchivo` (subcarpetas Interesados: 3 fotos JPEG, Apartados: 4). Falta probar lo que escribe en Drive
(`guardarEventoEnDrive`) y todo lo que depende de Supabase.

**Prueba de la interfaz con API simulada** (sin Supabase ni Drive): `next dev` con una sesión admin falsa y Chromium
(Playwright) interceptando `/api/**` con datos de ejemplo. Recorrido OK en escritorio y móvil (390 px, sin scroll
horizontal): lista de eventos, modal de nuevo evento, detalle, "Personas", tomar hoja, validación al confirmar vacío,
autoguardado, comparación con Axis, error de "Leer con IA" sin API key, folio duplicado + "Confirmar de todos modos".
Único hallazgo: en móvil el teléfono quedaba cortado → `EditorHoja.tsx` apila Folio/Teléfono por debajo de `sm`.
No prueba nada de Supabase, Drive (escritura) ni la IA real.

**Pendiente:** probar en vivo (Fase 4 con la carpeta de Drive de prueba; Fase 5 sin API key), tests de db/rutas, borrar `Escaner de hojas/` en la otra PC.
