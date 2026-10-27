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
GEMINI_API_KEY=
CAPTURA_DATOS_GEMINI_MODEL=gemini-3.6-flash
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbzpH00pglfmbucCq43GMaV0cNPjJCrdb3D1Z_koGNaF3wxRvG2Cp1YA7vYMAodZlb40/exec
APPS_SCRIPT_SECRET=<pídeselo a Samuel; no vive en el repo>
AXIS_TELEFONO_URL=
```

`GEMINI_API_KEY` se saca de https://aistudio.google.com/apikey. Sin ella, la lectura con IA de las hojas no funciona
(tira "Falta configurar GEMINI_API_KEY"), pero el resto de la sección sí.

**No hace falta tocar Supabase**: las tablas nuevas (`cap_eventos`, `cap_hojas`, etc.) y los buckets de Storage
(`cap-fotos`, `cap-excel`) ya están creados en la base de datos compartida — se ven solos desde cualquier máquina.

La carpeta `Escaner de hojas/` (el proyecto original, usado como material de referencia para portar el código) **no
está en git a propósito** — ya no hace falta: todo lo útil ya se copió/adaptó dentro de `src/`. Si la tienes en esta
PC y quieres conservarla de respaldo, es tuya; no afecta nada seguir trabajando sin ella en la otra máquina.

---

## En qué va el avance (7 fases, ver el plan completo más abajo)

- ✅ **Fase 1** — Esquema de Supabase (tablas `cap_*` + función `tomar_hoja_libre`, ya corridas), dependencias nuevas
  (`@google/genai`, `exceljs`, `pdfjs-dist`, `react-zoom-pan-pinch`, `zod`), plantilla de Excel.
- ✅ **Fase 2** — Toda la librería portada: `src/lib/captura-datos/` (modelo, validación, `db.ts` con el CRUD real,
  Google Drive, Axis por teléfono, lectura con IA, generación de Excel). Probada de punta a punta contra Supabase.
- ✅ **Fase 3** — Las 13 rutas API bajo `src/app/api/captura-datos/*` (eventos, hojas, tomar/liberar, confirmar,
  Drive, Axis). Probadas de punta a punta (crear evento → hojas → tomar → confirmar → folio duplicado → eliminar).
- ⏳ **Fase 4** — Probar Google Drive de verdad (ya con las credenciales reales). Falta que Samuel pase el enlace de
  una carpeta de Drive de prueba para completarla.
- ⏳ **Fase 5** — Probar la lectura con IA de verdad (falta `GEMINI_API_KEY`).
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
- Se quitó el modo "local" (CLI en la máquina del operador) del lector de IA original (no sirve en Vercel) — solo queda el modo API real, con Gemini.

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

**Fase 4 (parcial, solo lectura de Drive):** con la carpeta de prueba "Test" funcionan `infoCarpeta`, `listarArchivos` y
`descargarArchivo` (subcarpetas Interesados: 3 fotos JPEG, Apartados: 4). Falta probar lo que escribe en Drive
(`guardarEventoEnDrive`) y todo lo que depende de Supabase.

**Prueba de la interfaz con API simulada** (sin Supabase ni Drive): `next dev` con una sesión admin falsa y Chromium
(Playwright) interceptando `/api/**` con datos de ejemplo. Recorrido OK en escritorio y móvil (390 px, sin scroll
horizontal): lista de eventos, modal de nuevo evento, detalle, "Personas", tomar hoja, validación al confirmar vacío,
autoguardado, comparación con Axis, error de "Leer con IA" sin API key, folio duplicado + "Confirmar de todos modos".
Único hallazgo: en móvil el teléfono quedaba cortado → `EditorHoja.tsx` apila Folio/Teléfono por debajo de `sm`.
No prueba nada de Supabase, Drive (escritura) ni la IA real.

**Revisión con agentes ecc (security, database, react) y lo que se corrigió:**
- *Seguridad:* `/foto` solo sirve `image/jpeg|png|webp` y `application/pdf` (415 si no) y manda `nosniff` +
  `CSP: sandbox` (un html/svg subido a Drive ya no corre en el origen del CRM); `subcarpetaId` se valida como id de
  Drive; el redirect de Apps Script solo se sigue si es https a `*.google.com`/`*.googleusercontent.com`; la subida
  se rechaza por `Content-Length` > 100 MB antes de leerla; `notas` que empiezan con `= + - @` se neutralizan al
  escribirlas en la Hoja (`neutralizarFormula`); mensaje de error genérico sin "revisa la consola".
  **El `APPS_SCRIPT_SECRET` se quitó de este archivo pero sigue en el historial de git (commits `aad2f7c`, `2b3189f`):
  hay que ROTARLO en Apps Script, Vercel y `.env.local`.**
- *Base de datos (código):* el UPDATE de guardar/confirmar ahora incluye la condición de bloqueo; confirmar valida la
  `version` que vio el editor y el estado (no confirma `no_valida` ni invalida una confirmada); el historial se escribe
  después del update; `liberarHoja` solo libera el bloqueo propio; listados paginados (PostgREST corta en 1000 filas).
- *Base de datos (SQL, sin ejecutar):* `supabase/captura-datos-ajustes.sql` (índices, cascada de reaperturas,
  `tomar_hoja_libre` que devuelve la hoja vigente, revocar EXECUTE público). Revisar antes de correrlo.
- *React:* un solo estado `trabajando` bloquea botones y formulario durante IA/confirmar/salir; guardados en cola de
  promesas (sin sondeo); confirmar manda `version` y lo último escrito; salir no suelta la hoja si no se pudo guardar;
  tras un 409 hay "Recargar hoja" / "Salir sin guardar"; modal con `role=dialog`, Esc, foco y sin cierre por arrastre;
  reintentar tras fallar la importación ya no crea un evento duplicado; Axis no muestra el resultado del teléfono anterior.
- *No corregido (pendiente de decidir):* polling sin pausa con la pestaña oculta ni `memo`; subida por tandas sin
  progreso ni reintento parcial; `mensajeSeguro` sigue siendo lista negra (los mensajes de Supabase/Google pueden
  llegar al navegador, hoy solo ven admins); acotar IDOR por evento/asignación si algún día entra otro rol;
  índice único de folio sigue siendo por evento.

**Pendiente:** probar en vivo (Fase 4 con la carpeta de Drive de prueba; Fase 5 sin API key), tests de db/rutas, borrar `Escaner de hojas/` en la otra PC.

---

# Cambios posteriores (21 → 26 oct 2026)

Registro de lo que entró a `main` después del último commit de este resumen (`86893d5`, 21/10).

## Captura de Datos

**22 oct** — el flujo pasó de "tomar una hoja" a captura hoja tras hoja:
- Visor con zoom, avisos temporales, abrir hoja desde su tarjeta y marca de voucher (`VisorHoja.tsx`, `AvisoTemporal.tsx`).
- Comparación con Axis por teléfono (botones por campo, tarjeta solo cuando aplica; `AXIS_TELEFONO_URL` opcional).
- Secciones separadas Completos / Apartados / Interesados, edición de hojas ya confirmadas, paso directo a la siguiente
  hoja al confirmar, tira de hojas clickeable (`TiraHojas.tsx`), asteriscos en obligatorios y límites de texto/número.
- Cerrar evento aparte de "Guardar en Drive", con confirmación de subida.

**23 oct** — ajustes de diseño y permisos:
- Visor: botones dentro del visor, miniaturas verticales con hoja completa, altura ajustada para quitar el scroll
  vertical; sin abeja flotante en Captura de Datos; scroll pegado al borde.
- Editor más compacto, pago a meses aproximado, hover azul en "Leer con IA".
- Control de acceso por evento (`acceso.ts`, `requerirEvento` / `requerirHoja`) y polling pausado con la pestaña oculta.
- **Borrado de eventos con solicitud y aprobación** (tabla `cap_solicitudes_borrado`, `supabase/captura-datos-borrado.sql`),
  tarjeta de evento clickeable.

**26 oct** — `7f38fd5` / `51ff104`: permisos por rol, lectura con IA **una sola vez por hoja** (marca `leidaIa` en `origen`),
botones de Axis siempre visibles, caché en memoria de eventos (`cache.ts`).

**26 oct** — `5207eb9` (esta sesión):
- **Captura de Datos solo para admins** (`verCapturaDatos: ["admin"]`), con todos los eventos y todos los permisos.
- **Fecha del evento** obligatoria al crear (columna `cap_eventos.fecha`); se muestra en la tarjeta y en el detalle.
- **Recientes** en la barra lateral: título y, debajo, los 3 últimos eventos.
- **Subir fotos o PDF**: al pulsarlo salen los botones Completos / Apartados / Interesados (reemplazan el selector).
- **Se eliminó** el botón "Personas" (`AsignacionesModal`, ruta `/asignaciones`) y **todo lo de solicitudes de borrado**
  (rutas `/solicitudes-borrado`, `SolicitudBorradoModal`, listas y funciones de `db.ts`/`borrado.ts`).
- **Borrar evento**: cualquier admin, con doble confirmación (motivo + escribir el nombre del evento); queda en el
  historial (`cap_solicitudes_borrado`, como aprobada por quien borró) (`BorrarEventoModal.tsx`).
- **"Empezar a Capturar" / "Seguir capturando"** en lugar de "Tomar siguiente hoja". Orden de la siguiente hoja:
  Completos, Apartados, Interesados; dentro de cada uno, por id. Cambia `tomar_hoja_libre` en SQL.
- Secciones de hojas **colapsables**.
- Tests actualizados (borrado, validación, rutas de acceso). 79 tests pasan.

**26 oct** — sin commit aún:
- Botón **Excel** solo con el evento cerrado; "Guardar en Drive" sigue disponible con el evento abierto.
- **Cierre automático**: al confirmar una hoja, si no queda ninguna pendiente/leída (las no válidas no cuentan) el evento
  pasa a confirmado y se genera el Excel (`cierre.ts`, `cerrarEventoSiCompleto`). No sube a Drive; eso sigue siendo manual.
- **Voucher**: si la IA detecta voucher sin recuadro válido se usa la esquina superior derecha por defecto
  (`VOUCHER_ESQUINA_DERECHA` en `extract.ts`); si la IA dice que no hay voucher, queda sin marca.
- **Subir fotos o PDF** abre un cuadro (`SubirFotosModal.tsx`) con Completo/Apartado/Interesado, selector de archivos
  locales y Cancelar/Subir.
- **Fotos locales directo a Drive**: `hojas/subir` ya no usa el bucket `cap-fotos`; sube cada archivo a la subcarpeta
  del estatus en Drive (se crea si falta, `carpetaDeFotos` / `subirArchivoADrive` en `google.ts`) y en `cap_hojas.origen`
  solo guarda el `driveId`. Las hojas viejas con `rutaStorage` siguen funcionando (y "Guardar en Drive" las sigue pasando).
  Se suben con el nombre original y `origen.nombreDrive`; luego `renombrarFotosDeEvento` (google.ts) las renombra a
  `folio_nombre.jpg|pdf` al "Guardar en Drive" y al cierre automático (best-effort; solo las que subió la app, no las
  importadas de una carpeta). **Requiere pegar y publicar de nuevo** `/home/trabajo/project/google-apps-script/Codigo-para-pegar.gs`
  (acción nueva `renombrar` y `subirFoto` con `mime` para PDF). Sin eso el renombrado falla en silencio (solo log) y los
  PDF quedarían guardados como JPEG. `Codigo.gs` de esa carpeta no se tocó.
- Sin SQL pendiente nuevo.

## Otras áreas (no son Captura de Datos)

- **Coordinación** (21 oct): botón de descargar CSV por carpeta/tipo de mentoría; botones para enviar flyer + copy a
  Telegram (`telegram.ts`), hoy ocultos (pausado).
- **Certificaciones** (21 oct): "Revocar acceso" con motivo, lista de Revocados y "Reactivar"
  (columnas `revocado`, `fecha_revocacion`, `motivo_revocacion` en `certificaciones_clientes`).
- **Clientes** (23 oct): filtro de Estado "Inactivos".
- **Integración con el CRM de Renovaciones** (23 oct, `ae1ae92`): `GET /api/externo/renovaciones/inactivos` y
  `POST /api/externo/renovaciones/solicitud-acceso` (bearer token propio, `RENOVACIONES_API_TOKEN`, ruta pública en
  `middleware.ts`). La solicitud queda pendiente en `solicitudes_renovacion_externa` hasta que un admin la aprueba en
  Solicitudes (`/api/solicitudes-renovacion/...`); al aprobar corre el mismo flujo que el botón "Renovar".

- **Captura de datos** (26 oct): en el detalle del evento, "Cerrar evento" ocupa el lugar de "Borrar evento" y este va a la derecha (hover rojo con texto blanco); el aviso de borrado ya no menciona el historial.

- **Lectura de hojas con Gemini** (27 oct): `src/lib/captura-datos/extract.ts` lee las hojas con Gemini
  (`@google/genai`, modelo `gemini-3.6-flash`, cambiable con `CAPTURA_DATOS_GEMINI_MODEL`) y pide `GEMINI_API_KEY`.
  Es el único proveedor de IA de las hojas: se quitó todo lo de Claude (código, scripts `evaluar-lectura-ia.ts` y
  `probar-claude-vertex.ts`, paquetes de Anthropic y variables). Variables en `.env.example`. Sin probar contra la API todavía.
- **Captura de datos** (27 oct, fix de "Leer con IA"): la llamada a Gemini no tenía límite de tiempo y, si pasaba de los 60 s
  de la ruta, Vercel cortaba la función (el navegador solo veía "Algo salió mal") sin devolver la lectura, y la hoja quedaba
  bloqueada como "ya leída". Ahora `extract.ts` corta a los 45 s, usa `thinkingLevel: LOW` (más rápido para leer letra a mano),
  responde con mensajes claros (cuota agotada, tardó demasiado, respuesta inválida; en otros fallos el mensaje incluye el
  código y motivo de Gemini, p. ej. "Gemini 404: NOT_FOUND …"), registra el error real en la consola del
  servidor y la ruta devuelve la lectura. **Hojas que ya quedaron bloqueadas** (SQL a correr a mano, ver la respuesta de la sesión):
  `update cap_hojas set origen = origen - 'leidaIa' where origen->>'leidaIa' = 'true' and coalesce(campos->>'folio','') = ''
  and coalesce(campos->>'nombre','') = '' and coalesce(campos->>'correo','') = '';`
- **Captura de datos** (27 oct): el botón "Voucher" del visor ya no está deshabilitado sin recuadro; apunta por defecto a la
  mitad superior derecha de la hoja (`CAJA_VOUCHER_PREDETERMINADA` en `visor.ts`). Si la IA o la persona marcan el voucher,
  el botón usa ese recuadro exacto.
- Sin SQL pendiente nuevo.

## Pendiente en Supabase (SQL a correr a mano)

Ver la respuesta de la sesión del 26/10; en resumen, en este orden:
1. `supabase/captura-datos-borrado.sql` (tabla del historial de borrados + cascada de reaperturas).
2. `supabase/captura-datos-fecha-orden.sql` (columna `fecha` y orden de `tomar_hoja_libre`).
3. Del `schema.sql`: columnas de revocación en `certificaciones_clientes` y tabla `solicitudes_renovacion_externa`.
4. Opcional: `supabase/captura-datos-ajustes.sql` (índices y revocar EXECUTE; la función ya la reemplaza el paso 2).
