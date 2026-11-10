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
  bloqueada como "ya leída". Ahora `extract.ts` corta a los 100 s (la ruta tiene `maxDuration = 120`; ese plazo también se manda a Gemini, que responde 504
  DEADLINE_EXCEEDED si lo supera), registra tamaño, tipo y tiempo cuando falla, usa `thinkingLevel: LOW` (más rápido para leer letra a mano),
  responde con mensajes claros (cuota agotada, tardó demasiado, respuesta inválida; en otros fallos el mensaje incluye el
  código y motivo de Gemini, p. ej. "Gemini 404: NOT_FOUND …"), registra el error real en la consola del
  servidor y la ruta devuelve la lectura. **Hojas que ya quedaron bloqueadas** (SQL a correr a mano, ver la respuesta de la sesión):
  `update cap_hojas set origen = origen - 'leidaIa' where origen->>'leidaIa' = 'true' and coalesce(campos->>'folio','') = ''
  and coalesce(campos->>'nombre','') = '' and coalesce(campos->>'correo','') = '';`
- **Captura de datos** (27 oct, lectura adelantada): al pulsar "Leer con IA" el servidor lee esa hoja y, ya con la respuesta
  enviada (`after()` de Next), lee las **2 siguientes hojas libres**; al **confirmar** una hoja leída con IA completa hasta
  **3** hojas libres por delante (la que sigue y las 2 posteriores). Orden = el de `tomar_hoja_libre` (Completo, Apartado,
  Interesado, por id). Solo toca hojas `pendiente` sin datos, no las bloquea y no pisa lo que alguien ya esté escribiendo
  (`guardarLecturaAdelantada`). Si la IA falla se detiene. Código nuevo en `src/lib/captura-datos/lectura-ia.ts`. Marca de
  "lectura en curso" (`origen.leidaIaDesde`): si pasa de 3 min sin terminar (la función murió a medias) se considera
  abandonada y la hoja se puede volver a leer. Las rutas `extract` y `hojas/[id]` tienen `maxDuration = 120`. Sin probar
  contra Supabase/Gemini reales todavía. Sin SQL nuevo (todo vive en el jsonb `origen`).
- **Captura de datos** (27 oct, "alta demanda"): ese mensaje es un 503 UNAVAILABLE de Gemini (modelo saturado en Google, no
  cuota ni error de la app). `extract.ts` ahora reintenta: modelo principal, otra vez el principal y, al tercer intento, el
  modelo de respaldo (`CAPTURA_DATOS_GEMINI_MODEL_RESPALDO`, por defecto `gemini-3.5-flash`), con plazo de 35 s por intento.
  Si los 3 fallan, el mensaje dice "Gemini tiene alta demanda… intenta en un minuto".
- **Captura de datos** (27 oct, borrar eventos): el borrado ya no usa la tabla `cap_solicitudes_borrado` (no hay solicitud ni
  historial; se borra directo): se quitó del código, de los tests y de `schema.sql`/`captura-datos-borrado.sql`. Era lo que
  hacía fallar el borrado cuando la tabla no existía en Supabase. Un evento que se reabrió chocaba con la FK de reaperturas
  (sin ON DELETE CASCADE): `eliminarEvento` ahora limpia sus reaperturas y reintenta, así que no depende de ningún SQL
  (`captura-datos-borrado.sql` se eliminó después por redundante). El motivo del borrado se sigue pidiendo en pantalla, pero
  ya no se guarda en ningún lado. Si la tabla existe en tu base, se puede ignorar o borrar.
- **Captura de datos** (28 oct, SQL consolidado): `schema.sql` ya trae la columna `cap_eventos.fecha` y la versión actual de
  `tomar_hoja_libre` (orden Completo/Apartado/Interesado, devuelve la hoja vigente, `revoke`/`grant`); antes estaba
  desactualizado. `captura-datos-ajustes.sql` quedó solo con 4 índices opcionales (antes también redefinía la función con el
  orden viejo, que pisaba a `fecha-orden` si se corría después).
- **Captura de datos** (28 oct, historial de movimientos): nueva tabla `cap_auditoria` (SQL: `supabase/captura-datos-auditoria.sql`,
  también en `schema.sql`; sin llaves foráneas para que el rastro sobreviva al borrado). Se registra solo lo importante: crear,
  guardar en Drive, cerrar (manual y automático), reabrir y **borrar** eventos (con el motivo y cuántas hojas tenía; antes
  se perdía) y confirmar / corregir hojas (en la primera confirmación solo el folio; en una corrección, los campos que
  cambiaron). NO se registran lecturas con IA, autoguardados, asignaciones ni quién tomó una hoja. Registrar nunca frena la
  acción (`registrarAuditoria` no lanza; si falla, queda en los logs del servidor). Lo ve solo un admin: botón "Historial" en la
  lista de eventos (todo, incluso eventos borrados) y en cada evento (solo ese), ruta `GET /api/captura-datos/historial`.
  Purga: `RETENCION_AUDITORIA_DIAS = 365` (`auditoria.ts`), cron semanal `/api/cron/purgar-auditoria` (lunes 09:00 UTC,
  `vercel.json`; público en `middleware.ts` y protegido con `CRON_SECRET`). Código: `auditoria.ts` (servidor),
  `historial.ts` (textos y diferencias, compartido con el navegador), `HistorialModal.tsx`. Sin probar contra Supabase real.
- **Captura de datos** (28 oct, interfaz): (1) el historial pasó a la **barra lateral** (ítem "Historial" bajo Captura de Datos →
  página `/captura-datos/historial`, `HistorialPagina.tsx`; se quitó el botón de la lista de eventos y se dejó el de cada
  evento, que abre solo el historial de ese evento). (2) La fecha de un evento nuevo **no puede ser anterior al 2023-01-01**:
  `FECHA_MINIMA_EVENTO` en `modelo.ts`; se valida en el servidor (`crearEvento` de `validacion.ts`, que además rechaza fechas
  que no existen como 2026-02-30) y en el modal (atributo `min`, aviso y botón desactivado). (3) Los avisos (`AvisoTemporal`)
  ahora son **notificaciones emergentes arriba de la ventana** (portal fijo, por encima de los modales) en vez de ir al fondo
  del panel, y el aviso de "folio duplicado / Confirmar de todos modos" del editor pasó a ser una **ventana emergente**.
  Sin probar en el navegador.
- **Captura de datos** (28 oct, interfaz 2): la fecha de un evento también tiene **tope: hoy** (hora de México,
  `fechaDeHoy()` en `modelo.ts`; servidor y modal), o sea, rango 2023-01-01 a hoy. Los diálogos de confirmación ahora son
  **ventanas emergentes de la app** (`ConfirmarModal.tsx`) y ya no hay `window.confirm`/`window.prompt` en Captura de Datos:
  cancelar el registro de un evento (antes un recuadro rojo al fondo del modal), cerrar el evento, guardar en Drive, "falta la
  subcarpeta de fotos, ¿crearla?" y reabrir (que ahora pide el motivo en un campo del diálogo). Sin probar en el navegador.
- **Captura de datos** (27 oct): el botón "Voucher" del visor ya no está deshabilitado sin recuadro; apunta por defecto a la
  mitad superior derecha de la hoja (`CAJA_VOUCHER_PREDETERMINADA` en `visor.ts`). Si la IA o la persona marcan el voucher,
  el botón usa ese recuadro exacto.
- Sin SQL pendiente nuevo.

- **Captura de Datos** (30 oct): (1) los SQL sueltos se integraron en `supabase/schema.sql` (columna `fecha`, `cap_auditoria`,
  `tomar_hoja_libre` ya estaban; se añadieron un `alter table cap_eventos add column if not exists fecha` y los 4 índices de
  rendimiento) y se borraron `captura-datos-ajustes.sql`, `-auditoria.sql` y `-fecha-orden.sql`. (2) Nuevo evento con subida local:
  menú Completos / Apartados / Interesados (con contador), zona "Subir o arrastrar" (`ZonaArchivos.tsx`, también en
  "Subir fotos o PDF" del evento) con quitar archivo / quitar selección; los archivos se guardan por categoría y se suben al darle
  "Crear evento" (`subirHojas` en `cliente.ts`; si falla a medias, el reintento no repite lo ya subido). (3) Historial con código de
  color por acción y caché en memoria por persona: al reabrirlo solo pide lo posterior al último movimiento visto (`desde` en
  `GET /api/captura-datos/historial`). Sin probar en el navegador.
- Sin SQL pendiente nuevo.

## Supabase

Todo el SQL de Captura de Datos vive ahora en `supabase/schema.sql` (idempotente). Ya se ejecutó en la base actual.

## Ajustes de revisión de hojas
- Visor: zoom automático a "Datos" al abrir una hoja.
- Insignias de color por estatus (Completo / Apartado / Interesado) en secciones del evento y en el editor.
- Interesados: se muestran y guardan método de pago, cantidad, membresía y tarjeta (opcionales, se validan solo si se llenan).
- Al confirmar la última hoja: aviso verde "Se completaron todas las hojas" (ya no el rojo).
- Botón IA: "Leyendo con IA…" mientras carga y "Hoja ya leída con IA" al terminar.
- Ventana de Drive: pasa de "Subiendo" a "Drive subido".
- SQL pendiente: ninguno.

- **Captura de Datos** (30 oct): (1) editar una hoja desde la tira de progreso ya no saca a la vista del evento (solo si se abrió desde el evento). (2) Un evento reabierto ya no se cierra solo al confirmar todas las hojas: solo con el botón "Cerrar evento" (`eventoFueReabierto` en `db.ts`). (3) "Ver" en una hoja abre una ventana con la imagen y los datos del cliente (`VerHojaModal.tsx`). (4) Si el método de pago no usa tarjeta, Marca y Últimos 4 dígitos se vacían al guardar (`normalizeTodo` en `fields.ts`), así tampoco quedan en Drive. Sin probar en el navegador. Sin SQL pendiente.

- **Captura de Datos** (30 oct, 2): (1) Tarjeta de evento con menú de 3 puntos (`MenuEvento.tsx`): Guardar en Drive, Excel, Historial, Borrar evento; se quitó el enlace suelto de Excel. (2) `VerHojaModal`: spinner "Cargando hoja…" mientras llega la foto/PDF. (3) `VerHojaModal` más grande (hasta 96vw × 98vh, hoja a 84vh) con datos en filas "Etiqueta: valor"; `Modal` acepta prop `tamano`. Sin probar en el navegador. Sin SQL pendiente.

- **Captura de Datos** (30 oct, 3): (1) `VerHojaModal` más pequeño (mismas proporciones: 72vw × 80vh, hoja a 60vh) y, con el evento abierto y la hoja no inválida, botón "Editar" dentro del cuadro (cierra el cuadro y abre el editor). (2) Nuevo `captura-datos/layout.tsx`: solo quien tenga `verCapturaDatos` (admin) ve la sección, también por URL directa; la API ya exigía el permiso. (3) Historial general con filtros (`FiltrosHistorial.tsx`): búsqueda libre (evento, admin, folio, motivo, nombre del cliente en correcciones), lugar (texto dentro del nombre del evento, no hay campo "lugar"), chips por acción y rango de fechas del movimiento; filtrado en servidor (`listarAuditoria`, `GET /api/captura-datos/historial`). Sin probar en el navegador. Sin SQL pendiente.

- **Captura de Datos** (30 oct, 4): (1) Historial por páginas (Anterior / Siguiente): cada página se pide solo al navegar a ella; se quitó la caché y el "Ver más". (2) Título de cada movimiento con el nombre del evento ("Creado Synergy GDL") en el historial general; ya no hay línea "Evento:" aparte. (3) La búsqueda ahora también encuentra por nombre del cliente en confirmaciones (busca en `cap_hojas.campos->>nombre` y trae los movimientos de esas hojas). (4) Lentitud al buscar: era `ilike '%texto%'` sobre 6 columnas sin índice (recorre toda `cap_auditoria` en cada consulta) más 350 ms de pausa; ahora 250 ms, indicador de carga y índices trigram. **SQL pendiente:** ejecutar en Supabase los índices `idx_cap_auditoria_busq_*` y `idx_cap_hojas_busq_nombre` (están al final del bloque `cap_auditoria` en `supabase/schema.sql`). Sin probar en el navegador.

- **Captura de Datos** (2 nov): (1) El historial de un evento (ventana de la tarjeta/detalle) ahora es más grande (`sm:max-w-3xl`, 85vh) y lleva búsqueda, fechas y chips por acción (sin el campo "Lugar", que ahí no aplica). (2) Páginas del historial más cortas: 25 movimientos por página (antes 50; `LIMITE_POR_DEFECTO` en `auditoria.ts`). (3) Al buscar por nombre en el historial, las hojas confirmadas encontradas muestran "Nombre: …" debajo del folio (`clienteNombre` en `RegistroAuditoria`). Sin probar en el navegador. Sin SQL pendiente nuevo.

- **Captura de Datos** (2 nov, 2): (1) El historial (general y del evento) guarda en memoria lo último visto (páginas, página actual y filtros, por usuario) y al volver lo muestra al instante sin recargar; solo hace una consulta mínima (`limite=1`) y recarga si hay un movimiento más nuevo (`HistorialModal.tsx`). (2) Lista de eventos con búsqueda por nombre/carpeta de destino (sin acentos), chips Abiertos / Confirmados / Con hojas por revisar y rango de fechas del evento, filtrado en el navegador (`FiltrosEventos.tsx`, `ListaEventos.tsx`). Sin probar en el navegador. Sin SQL pendiente.

- **Captura de Datos** (2 nov, 3): la búsqueda y filtros de la lista de eventos van dentro de la misma tarjeta (`rounded-2xl border bg-surface p-4`) que usa el historial (`ListaEventos.tsx`). Sin probar en el navegador. Sin SQL pendiente.

- **Captura de Datos** (2 nov, 4) — **capturar un evento entre dos personas (admins) en paralelo.** El bloqueo de 10 min por hoja ya
  impedía que dos personas tomaran la misma; ahora además se ve y se coordina:
  1. **Quién tiene cada hoja:** en la lista del evento dice "Marco · en edición" (o "Tú · en edición") y en la tira de miniaturas del
     editor aparecen sus iniciales (con el nombre al pasar el mouse). `GET /api/captura-datos/eventos/[id]/hojas` devuelve también
     `usuarios` (id → nombre, solo de quien bloqueó o confirmó hojas de ese evento; `nombresDeUsuarios` en `db.ts`).
  2. **Ver sin editar:** una hoja que tiene otra persona muestra "Ver" (no "Abrir") y el cuadro de la hoja no ofrece "Editar".
  3. **Avance por persona:** chips "Tú N · Marco N · Pendientes N" arriba de las hojas (`BarraColaboracion.tsx`,
     `progresoPorPersona` en el nuevo `colaboracion.ts`).
  4. **Capturar desde el final:** casilla junto al avance; quien la marca toma las hojas desde la última Interesada hacia la primera
     Completa, así cada persona va hacia la otra en vez de pelear por las mismas. Se recuerda por evento en este navegador
     (`localStorage`). Viaja como `?inverso=1` a `tomar-hoja`, a "Leer con IA" y al confirmar, para que la lectura adelantada de la
     IA también siga ese orden (`tomarHojaLibre`/`siguientesHojasLibres`/`adelantarLecturas` con `inverso`).
  5. **Botón "Liberar mis hojas (N)":** aparece solo si tienes hojas tomadas en el evento (p. ej. se te cerró la pestaña) y las
     suelta para que la otra persona las tome sin esperar los 10 min. Solo suelta las tuyas, nunca las de otra persona
     (`POST /api/captura-datos/eventos/[id]/liberar-mis-hojas`, `liberarHojasDeUsuario`).
  6. **Cierre automático seguro:** si dos personas confirman la última hoja a la vez, solo una cierra el evento (`cerrarEventoAbierto`,
     update con `estado = 'abierto'`); ya no se duplican el Excel, el renombrado de fotos ni el registro del historial.
  7. Por pedido, **no** hay aviso cuando otra persona confirma una hoja.
  Pruebas nuevas: `colaboracion.test.ts`, `db-colaboracion.test.ts`, `cierre-concurrencia.test.ts`, `api.test.ts` y un caso en
  `lectura-ia.test.ts` (173 pruebas en verde, `tsc` y `next build` sin errores). Revisado por agentes de código, SQL y seguridad
  (sin hallazgos críticos ni altos). Sin probar en el navegador.
  **SQL pendiente:** volver a ejecutar `supabase/schema.sql` en el SQL Editor de Supabase (cambia `tomar_hoja_libre`: agrega
  `p_inverso`, borra la versión de 2 parámetros y recarga PostgREST). Mientras no se ejecute, todo funciona igual que antes salvo
  "Capturar desde el final", que responde "Falta actualizar la base de datos…".

**Búsquedas rápidas** (2 nov, 5) — índices trigram faltantes (clientes: teléfono/notas/notas_soporte; eventos_timeline: detalle/autor; otras_ofertas: teléfono; certificaciones: teléfono/telefono_busqueda/notas/nota) al final de `supabase/schema.sql`, más `analyze`. En `db.ts`, `resolverOpcionesClientes` corre en paralelo los tres resolvedores de filtros de Clientes.
- **SQL pendiente:** ejecutar `supabase/schema.sql` completo (incluye también los índices del historial del 30 oct y `tomar_hoja_libre`).

**Captura de Datos: sentido automático y máximo dos personas** (2 nov, 6) — reemplaza la casilla "Capturar desde el final".
- SQL: tabla `cap_evento_capturistas` y función `registrar_capturista(evento, usuario)` → 'normal' | 'inverso' | 'lleno'. La primera persona activa (actividad <15 min o hoja tomada vigente) va desde el inicio, la segunda desde el final, una tercera recibe 'lleno'. `tomar_hoja_libre(evento, usuario)` ya no recibe `p_inverso` (lo decide la base) y lanza `evento_lleno`. Un evento cerrado no limita a nadie.
- Servidor: `registrarCapturista` en `db.ts`; lo llaman abrir una hoja por id, autoguardar/confirmar (PATCH) y la lectura con IA, así una tercera persona no puede confirmar ni leer hojas (409). La lectura anticipada sigue el sentido de quien la pide. "Liberar mis hojas" también deja libre su cupo.
- Interfaz: se quitó la casilla, el localStorage y `?inverso=1`. Se conservan los chips de avance y "Liberar mis hojas".
- Antes de correr el SQL todo sigue como antes (sin límite ni sentido automático).
- **SQL pendiente:** ejecutar `supabase/schema.sql` completo.

**Hoja del cliente en su perfil** (2 nov, 7) — en Clientes > perfil > "Seguimiento y soporte", junto al título: ícono para ver la hoja escaneada (cajón a la izquierda con la imagen/PDF y botón "Descargar") e ícono para descargarla. Solo se muestran si el cliente tiene hojas **confirmadas**; la ven todos los roles que ven Clientes (`verClientes`).
- Cruce cliente → hoja: por correo (actual y original) o últimos 10 dígitos del teléfono (`cliente-hojas.ts`, `listarHojasDeCliente` en `db.ts`).
- Endpoints nuevos: `GET /api/clientes/[id]/hojas` (lista) y `GET /api/clientes/[id]/hojas/[hojaId]/archivo[?descargar=1]` (verifica que la hoja sea del cliente; 404 si no). El servido del archivo vive en `archivo-hoja.ts`; los endpoints de `captura-datos` no se tocaron.
- UI: `HojaClienteAcciones.tsx`; `Tarjeta` en `ClientePanel.tsx` acepta `acciones`. Con varias hojas, el ícono de descargar abre el cajón para elegir.
- Pruebas nuevas: `cliente-hojas`, `db-cliente-hojas`, `archivo-hoja` (194 en verde, `tsc` y `next build` sin errores). Sin probar en el navegador.
- **SQL pendiente:** ejecutar `supabase/schema.sql` completo (3 nov: integró los dos índices parciales de `cap_hojas` —el archivo `indices-hojas-cliente.sql` se eliminó— y agrega los buckets privados `comprobantes-pago`, `cap-fotos` y `cap-excel`, que antes se creaban a mano). Sin esto todo funciona, solo más lento al crecer la tabla.
- Revisión (código y seguridad) aplicada: correos con coma/comillas/paréntesis se descartan del filtro `in` y la lista se revalida contra el cliente; respuestas con `Cache-Control: private, no-store`; `%` mal formado en la URL da 404; `.PDF` en mayúsculas; un PDF de varias hojas (`paginas > 1`) no se entrega (403) porque traería hojas de otras personas. **Decisión del dueño:** las hojas las ve cualquier rol con `verClientes` (antes solo admin); no se limitan por evento ni hay registro de descargas. 200 pruebas en verde.

- **BD en producción al día** (3 nov): se ejecutó `supabase/schema.sql` completo y quedó verificado (tabla `cap_evento_capturistas`, `registrar_capturista`, nueva `tomar_hoja_libre`, índices de búsqueda y de hojas de cliente), más 4 índices nuevos (Etiquetas de Clientes, apartados vencidos, etiqueta y tags de Otras Ofertas). Se corrigió un fallo de `schema.sql` en bases con filas `motivo_cm` (constraints de `catalogo_opciones` en un solo bloque condicional, al final del archivo). Al probar `schema.sql` en local hay que incluir filas de `catalogo_opciones` de todos los tipos. Sin SQL pendiente.

**Ajustes de hoja del cliente y Captura de Datos** (3 nov) — sin SQL pendiente.
- Hoja del cliente (`HojaClienteAcciones.tsx`): el cajón ya no tiene fondo oscuro ni desenfoque (la ficha del cliente se ve nítida al lado y se puede usar), y la imagen tiene zoom (rueda, doble clic, botones Acercar/Alejar/Restablecer; el PDF usa el zoom del visor). Los íconos usan caché de 60 s por cliente y un marcador mientras consulta, para que no aparezcan tarde.
- Captura de Datos: la barra de búsqueda de eventos queda fija y solo cargan las tarjetas (`ListaEventos.tsx`).
- Nuevo evento: "Importar fotos de Drive" se deshabilita si la carpeta no tiene subcarpetas Completos / Apartados / Interesados (`NuevoEventoModal.tsx`).
- Hoja del cliente: mientras busca por correo/teléfono se ve una lupa que parpadea suave, y el espacio de los íconos queda reservado (24 px de alto, 56 de ancho) para que el texto de la tarjeta no se mueva al aparecer o no aparecer.
- Hoja del cliente más rápida: al pasar el mouse o enfocar el ícono "ver hoja" se precarga la imagen (PDF no), y la vista (no la descarga) de `GET /api/clientes/[id]/hojas/[hojaId]/archivo` lleva `Cache-Control: private, max-age=300` (menor que los 10 min de la URL firmada). Sin SQL pendiente.

**Reporte de captura en el Historial** (4 nov) — para detectar a quien confirma sin leer.
- Cada hoja guarda cuándo la tomó la persona (`cap_hojas.tomada_en`) y cuántos autoguardados lleva (`guardados_toma`, vuelve a 0 en cada toma nueva; `tomar_hoja_libre` y `tomarHojaPorId` los fijan). Al confirmar, el movimiento `hoja_confirmada`/`hoja_corregida` guarda `inicio`, `segundos` y `guardados`.
- Historial: cada confirmación muestra "Inició … · terminó …", duración (⚠ si < 15 s, `SEGUNDOS_CAPTURA_RAPIDA`) y "sin cambios guardados".
- Pestaña nueva "Reporte de captura" (página Historial y modal por evento, filtro de fechas): por persona y evento, primer inicio, último fin, hojas, promedio, "muy rápidas" y "sin cambios". Endpoint `GET /api/captura-datos/historial/reporte` (solo admin).
- Las hojas confirmadas antes de este cambio salen "sin medición".
- **SQL pendiente:** ejecutar `supabase/schema.sql` ANTES de desplegar (agrega las 2 columnas y reemplaza `tomar_hoja_libre`); sin las columnas, abrir y autoguardar hojas falla.
- **Detalle del reporte de captura** (4 nov): en cada fila del reporte, un ícono abre el detalle hoja por hoja de esa persona (foto, folio, inicio, fin, duración, guardados, tiempo desde la anterior, alertas, filtros y "Ver hoja"). "Descargar PDF" abre un informe imprimible (`pdf-captura.ts`) para guardarlo como PDF desde el navegador. `GET /api/captura-datos/historial/reporte` acepta `usuarioId` + `eventoId` para el detalle. Sin SQL pendiente.
- **Ajustes del reporte de captura** (4 nov): botón "Ver PDF" junto a "Descargar PDF" (`abrirInforme(datos, imprimir)`); `VerHojaModal` usa `VisorHoja` en modo `soloLectura` (zoom y animación de carga; también aplica al abrir hojas desde el evento) y el ojo del detalle gira mientras baja la hoja; filas del reporte alineadas al centro y columna Alertas en una sola línea ("Varias alertas" si hay de los dos tipos). Sin SQL pendiente.
- **Nombres de foto y caché del reporte** (4 nov): el reporte y su detalle/PDF muestran la foto como `folio_Nombre.jpg` (`imageFileName`, igual que en Drive; sin folio y nombre, el nombre original). El Reporte de Captura y cada "Detalle de …" se guardan en la caché de la pestaña (`useDatosEnCache`) y tienen botón "Actualizar". Sin SQL pendiente.
- **Reporte de captura sin filtros de fecha** (4 nov): se quitaron "Desde/Hasta" (queda un título y separador; cubre todo el historial) y se alinearon las celdas de la tabla del detalle por persona. Sin SQL pendiente.
- **Paginación del reporte de captura** (4 nov): el detalle por persona y el resumen general paginan de 15 en 15 (`Paginador`, `paginar` en `paginacion.ts`); el PDF repite el encabezado en cada hoja impresa; `nombresDeFotos` consulta en tandas de 100. Sin SQL pendiente.
- **Correcciones, borrado de hojas y "Otros movimientos"** (4 nov): el detalle de captura por persona incluye las correcciones (`hoja_corregida`) y los borrados (`hoja_borrada`) como filas sin tiempos ni alertas, y el filtro "Otros movimientos" lista lo del evento (crear, Drive, cerrar, reabrir, borrar). Cada tarjeta de hoja tiene un menú de tres puntos (`MenuHoja.tsx`) con Ver, Editar y Borrar (confirmación); `DELETE /api/captura-datos/hojas/[id]` solo admin, evento abierto y hoja no tomada por otra persona; queda en el historial. No borra la foto de Drive. Sin SQL pendiente.
- **Historial: hojas agregadas** (4 nov): nueva acción `hojas_agregadas` ("Agregó hojas al evento", filtro "Hojas agregadas") que se registra al importar desde Drive (`POST .../hojas`) y al subir desde la computadora (`.../hojas/subir`), con cantidad y origen; aparece también en "Otros movimientos". Sin SQL pendiente (`accion` es texto libre).
- **Detalle de captura: colores y "Modificado"** (4 nov): "Otros movimientos" usa el mismo código de colores del historial (`COLOR_ACCION`); "Corregida/Corrigió" pasó a "Modificado/Modificó" y las modificaciones y borrados de una hoja se muestran justo debajo de su confirmación (`agruparBajoSuHoja`, fila resaltada). Sin SQL pendiente.
- **PDF del detalle con modificaciones** (4 nov): el informe imprimible incluye las hojas modificadas y borradas (fila azul con "Modificado"/"Borrada" y los cambios), justo debajo de su hoja; las estadísticas siguen contando solo las confirmadas. Sin SQL pendiente.

**Historial a 6 meses con CSV, filtros en listas y filtros del reporte** (4 nov)
- Retención del historial: 365 → 180 días (`RETENCION_AUDITORIA_DIAS`). El cron semanal `purgar-auditoria` ahora guarda primero un CSV (`historial_AAAA-MM-DD_a_AAAA-MM-DD.csv`) de lo que va a borrar en el bucket privado `cap-historial`; si no se pudo guardar, no borra. La página Historial muestra "Historial anterior (CSV)" con descarga (`GET /api/captura-datos/historial/archivos`, solo admin).
- Filtros del historial (general y por evento): el campo "Lugar" pasó a una lista de eventos existentes (solo en el general) y los botones Creado/Guardado en Drive/etc. a la lista desplegable "Movimientos" con casillas. Endpoint `GET /api/captura-datos/historial/opciones` (eventos y admins).
- Reporte de captura: filtro por admin (en qué eventos confirmó hojas) y, en el general, el mismo filtro de eventos (`admin` en `GET .../historial/reporte`).
- **BD:** `supabase/schema.sql` ejecutado (4 nov): incluye el bucket `cap-historial`. Sin SQL pendiente.

**Limpieza y endurecimiento de Captura de Datos** (5 nov) — sin SQL pendiente.
- Código muerto: borradas `listarAsignaciones`, `reemplazarAsignaciones`, `fromRecord`, `formatMXN`, `leerHoja`, `esHojaAusente`, `hojaEnDrive`, `usuarioActual`, `fotoRef`, `URL_PAPELERA_DRIVE` y `CAMPOS_COMPARABLES`; se quitó `export` a lo que solo se usa dentro de su archivo; `normalizeFields` ya no recibe el parámetro sin efecto `estatus`.
- Comentarios: eliminados cerca de 35 comentarios y cabeceras redundantes (incluidos los que contaban el origen del proyecto); se dejaron los de concurrencia, límites y Drive.
- Errores: nuevo `mensajeError.ts`; los componentes solo muestran el mensaje de la API (`ErrorApi`) y, para cualquier otro fallo (red, JSON, imagen), un aviso genérico. Las rutas ya usaban la lista blanca `ErrorPeticion`/`respuestaError`, sin cambios.
- Entradas: `maxLength` en búsquedas (100), enlace de Drive (500) y confirmación de borrado; en `EditorHoja` los campos filtrados (folio, teléfono, nombre, correo, tarjeta, cantidad, notas) ya no recortan en silencio: muestran un aviso ámbar de 2,5 s ("Solo números", "Máximo 10 dígitos", "Solo letras"…) con el hook nuevo `useAvisoLimite.ts`. Se quitó `maxLength` de esos campos porque el navegador recortaba lo pegado antes del aviso; el tope lo aplica `sanitizeInput`.
- Servidor: `requerirEvento`/`requerirHoja` responden 404 si el id no es uuid (antes salía un 500 por Postgres); test nuevo.
- Verificado: `tsc`, `eslint` (0 avisos; antes 1), `vitest` 224/224 (antes 223) y `next build`. Revisión con `code-reviewer`: sin CRITICAL/HIGH; se corrigió el falso aviso "Máximo N dígitos" con separadores y se quitó el tope de 200 en la confirmación de borrado.
- No se hizo: paginar `listarEventos` (volumen actual bajo), partir `db.ts` (751 líneas, bajo el techo de 800), sacar los colores de `HistorialModal.tsx`. Los avisos de límite no se probaron en el navegador.
- **Prueba en navegador de los avisos de límite** (5 nov): con Chromium y una página temporal (ya borrada) que montaba `EditorHoja`, se probaron folio, teléfono, nombre, correo y cantidad con letras, símbolos, separadores, pegados largos y mayúsculas: el campo filtra o recorta bien, el aviso sale con el texto correcto, desaparece a los 2,5 s y no hay falsos avisos (espacios dobles, mayúsculas del correo, `$` y comas de la cantidad). No se probó el guardado real (sin credenciales de Supabase).

**Cupo de 4 por estado, buscadores, zoom y hoja del cliente** (5 nov)
- Captura de Datos: el evento tiene un botón por estado ("Empezar/Seguir capturando Completos/Apartados/Interesados", con las hojas por capturar). Cada estado admite máximo 4 capturistas (2 desde arriba, 2 desde abajo); una quinta persona recibe aviso y puede capturar otro estado. Al confirmar sigue en el mismo estado y, al acabarse, vuelve al evento. Cambiar de estado suelta tus hojas tomadas del otro. `POST .../tomar-hoja` ahora recibe `{ estatus }`; `registrarCapturista`, `tomarHojaLibre`, `siguientesHojasLibres` y `adelantarLecturas` reciben el estado.
- Listas de Eventos, Admins y Movimientos (historial y reporte): con buscador (sin acentos ni mayúsculas, "GDL" filtra dentro de la lista).
- Visor: abre acercado ~2x a la esquina superior derecha (`CAJA_ESQUINA_SUPERIOR_DERECHA`).
- Hojas del cliente: busca por teléfono; si ese teléfono sale con correos distintos afina por correo (si ninguna coincide, muestra las del teléfono); sin hojas por teléfono usa el correo (`hojasDelCliente`).
- **SQL pendiente:** ejecutar `supabase/schema.sql` ANTES de desplegar (columna `cap_evento_capturistas.estatus` y funciones `registrar_capturista`/`tomar_hoja_libre` con 3 parámetros; borra las de 2). Sin esto, tomar hojas falla.
- Verificado: `tsc`, `eslint`, `vitest` 230/230. No probado en navegador ni contra la base real.
- Evento: un estado con todas sus hojas confirmadas (o no válidas) arranca colapsado con la insignia "Todo confirmado"; el encabezado sigue permitiendo abrirlo. Sin SQL pendiente.
- **Botones por estado y zoom** (5 nov): los botones de capturar pasaron de la barra superior al encabezado de cada estado ("Capturar"/"Seguir", discretos; solo si quedan hojas por capturar). El visor vuelve a abrir en la zona de datos (`CAJA_DATOS`, x 0–0.7, y 0–0.25) y el botón Voucher sin recuadro de IA acerca ≈3x a la esquina superior derecha (`CAJA_VOUCHER_PREDETERMINADA`: x 0.67, y 0, w 0.3, h 0.24), calibrado con una hoja real. Sin SQL pendiente.
- **Captura limitada al estado** (5 nov): al capturar un estado, la tira de hojas del editor solo muestra y deja abrir las de ese estado. Al terminar la última sale al evento con el aviso "Ya están confirmadas todas las hojas de Completos/Apartados/Interesados" (o "¡Listo!" si era lo último del evento). Sin SQL pendiente.

**Correcciones de la revisión colaborativa de Captura de Datos** (6 nov) — sin SQL pendiente.
- `extract`: si otra persona tiene la hoja responde 409 antes de gastar la IA; si al guardar la lectura falla (hoja tomada o cambiada) se devuelve la lectura, así la hoja ya no queda "leída" sin datos.
- Evento cerrado: el PATCH de confirmar y `tomar` exigen evento abierto para tocar una hoja ya confirmada (`exigirEventoAbiertoSiConfirmada`).
- Abrir una hoja ajena (`tomar`) ya no mueve a la persona de estado ni gasta su cupo: se comprueba el bloqueo ajeno antes de `registrarCapturista` (`bloqueadaPorOtra`), y al tomarla se sueltan sus hojas de otros estados (`liberarHojasDeOtroEstatus`).
- Folio repetido en carrera: el choque con el índice único (23505) ahora responde 409 en vez de 500; un duplicado del mismo evento ya no se ofrece forzar.
- Resto de la revisión (6 nov): la lectura adelantada ya no guarda en una hoja que alguien tomó mientras la IA leía (no sube su versión ni provoca el 409); `bloqueoVigente` cuenta también la hoja confirmada en corrección (se ve ocupada en la tira y la lista, y "liberar mis hojas" la incluye); el editor renueva solo el bloqueo cada 4 min mientras se corrige una hoja confirmada y no muestra el aviso de "haz un cambio"; `confirmarHoja` pone el bloqueo también en el UPDATE y se partió en `leerHojaPorConfirmar` y `registrarCorreccion` (<50 líneas); `registrarCapturista` ya no ignora la falta de la función SQL (error en vez de dejar sin límite); comentarios de "máximo dos" corregidos a cuatro por estado.
- Verificado: `vitest` 244/244 (14 pruebas nuevas), `eslint` y `tsc` limpios. No probado en navegador (la renovación de la reedición es solo código) ni contra la base real.
- Decidido no hacer: soltar el cupo en `liberarHoja` por id (`irA` usa ese endpoint al saltar de hoja y otra persona podría tomar el cupo en medio) y unificar relojes Node/Postgres (exige migración SQL por un riesgo mínimo). Queda: el botón de leer de una hoja con lectura adelantada en curso sigue deshabilitado hasta reabrirla, y no se liberan las hojas al cerrar la pestaña.
- Folio repetido en el mismo evento (6 nov): sigue saliendo el modal con el enlace a la hoja duplicada, pero sin el botón "Confirmar de todos modos" (`forzable: false` en el 409), porque el índice único lo rechazaría.

**PDF por página, evento sin crear a medias y hojas repetidas** (10 nov) — sin SQL pendiente.
- Nuevo evento: primero se preparan todas las fotos/PDF; si algo falla después de crear el evento (subida o importación de Drive), el evento se borra (`DELETE` con motivo, queda en el historial). Las fotos que alcanzaron a subir a Drive se quedan allá.
- PDF: en el navegador cada página se convierte en una hoja JPEG (`prepararHojas`/`paginasDePdf` con `pdfjs-dist`, `nombre_pN.jpg`, `pagina`/`paginas` en el origen). Aplica a "Nuevo evento" y "Subir fotos o PDF". La importación desde Drive sigue mandando el PDF entero.
- Hojas repetidas (mismo teléfono, mismo estado): `duplicadas.ts`. Al llegar a una, el editor avisa con "Borrar repetidas" o "Verlas". En la tira, ícono ámbar (repetida) o azul (vinculada); abre `DuplicadasModal` para elegir la principal y vincular, ver, borrar o desvincular. Solo se vinculan hojas repetidas (lo valida el servidor). La secundaria queda `no_valida` con `origen.principalId`: solo se ve, no se captura, no va a la Hoja de cálculo; su foto sí está en Drive. Ruta nueva `POST /api/captura-datos/hojas/[id]/duplicadas` (`vincular`/`desvincular`/`borrar`; borrar una confirmada solo admin).
- Lectura IA adelantada: si la última hoja leída repite el teléfono de la anterior, sigue leyendo hasta una distinta (máx. 20 extra) y se detiene.
- Verificado: `tsc`, `eslint`, `vitest` 250/250 (5 nuevas), `next build`. No probado en navegador ni contra la base real.
