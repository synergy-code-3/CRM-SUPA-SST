# Reglas para calcular cantidad y tipo de boletos Synergy por cliente

Este documento describe la lógica completa que usa el CRM del Club Sinergético para determinar cuántos boletos y de qué tipo (GENERAL / VIP / BLACK) le corresponden a cada cliente. Pensado para replicarse en otro CRM con datos equivalentes.

## 1. Fuentes de datos necesarias

1. **Hoja de clientes** (CRM principal) — por cada cliente necesitas: `correo`, `país`, `evento`, `tipo de membresía` (3/6/12 meses), `acceso a plataforma` (ej. "Renovación"), `fecha de inscripción`, `fecha de renovación` (si aplica). **No** se necesita ni se usa un campo de "fecha fin de acceso" guardado aparte — este CRM lo calcula siempre, nunca confía en un valor importado (ver sección 2).
2. **Hoja de inventario de boletos por evento** — una tabla donde cada fila es un evento y las columnas indican cuántos boletos GENERAL/VIP de 3, 6 y 12 meses (separado MX/US) y cuántos BLACK le corresponden a ese evento. Estructura real usada:
   - Fila 1: agrupador ("Boletos")
   - Fila 2: duración (3 Meses / 6 Meses / 12 Meses / BLACK)
   - Fila 3: categoría + país (GRAL MX / VIP MX / GRAL US / VIP US)
   - Fila 4 en adelante: una fila por evento, columna A = nombre del evento.

## 2. Regla de "activo para Synergy" (filtro previo)

Antes de calcular boletos, el cliente debe estar **activo hasta una fecha de corte fija** (en este CRM: 19-sep-2026). "Fin de acceso" **no es un campo guardado** — este CRM nunca confía en un valor importado/editado a mano para esto, siempre lo calcula:

```
ancla = fecha de renovación del cliente (si existe) ; si no, fecha de inscripción
fechaFin = ancla + 1 año   ← siempre exacto, sin importar el tipo de membresía (3/6/12 meses)

SI fechaFin < fecha de corte:
    cliente NO activo → no se le calculan boletos, se muestra "no activo"
SINO:
    continuar con el cálculo normal
```

**Por qué "fecha de renovación" y no "fecha de inscripción" siempre:** cuando un cliente renueva, la fecha de inscripción original **no se toca** — se guarda una fecha de renovación aparte, porque son dos datos distintos (cuándo entró vs. cuándo renovó por última vez). Para los clientes que ya existían antes de este mecanismo (fecha de renovación vacía), la fecha de inscripción hace las veces de ancla — en el flujo viejo (hoja de cálculo) esa fecha se sobrescribía en cada renovación en vez de llevarse aparte, así que sigue siendo la referencia correcta para ellos. Ver "casos extraordinarios" #1.

**Qué "ancla" se guarda al renovar (botón "Renovar" o recompra vía Hotmart):** si la membresía **todavía está activa** (su fin calculado sigue en el futuro), la nueva fecha de renovación no es "hoy" — es el **fin actual**, para que el nuevo fin quede en `fin actual + 1 año` y la persona no pierda el tiempo que ya había pagado. Si **ya venció**, sí se ancla en "hoy" (no hay nada que extender). Ejemplo: alguien con fin calculado dentro de 6 meses renueva hoy → nuevo fin = fin actual + 1 año (18 meses desde hoy), no hoy + 1 año (12 meses). Implementado en `anclaAlRenovar()` (`src/lib/fechas.ts`).

## 3. Regla base: evento + duración de membresía → boletos

```
evento = campo "Evento" del cliente (normalizado: trim + minúsculas)
fila = buscar `evento` en la tabla de inventario de boletos

SI no se encuentra el evento en la tabla:
    → "Sin información de boletos para este evento" (ver excepción de override, sección 5)

duración = "12" si la membresía incluye "12"
           "6"  si incluye "6"
           "3"  en cualquier otro caso (default)

boletos = para cada categoría (GRAL MX, VIP MX, GRAL US, VIP US):
    valor = columna [categoría]_[duración] de la fila del evento
    si valor > 0 → mostrar chip "{categoría} · {valor}"

si la fila tiene un valor en la columna BLACK → agregar chip "BLACK · {valor}"
```

Un cliente puede tener **más de un chip a la vez** (ej. GRAL MX y BLACK simultáneos si el evento así lo define).

## 3.1 Casos especiales de nombre de evento fijo

Algunos códigos de evento no representan un evento real con inventario propio, sino una categoría directa de boleto. Estos se resuelven por nombre exacto del evento, sin consultar la tabla de inventario, dando siempre **1 boleto, variante MX** — sin importar el país del cliente (el boleto es para ESE evento en México, no "el que le toque según dónde vive"):

- `VIP-SU` → 1 boleto VIP MX
- `GRAL-SU` → 1 boleto GENERAL MX

Es la misma idea que el caso "Renovación" de la sección 4, pero disparado por el nombre del evento en vez de por el campo de acceso.

Caso adicional, con cantidad y país fijos (no depende del cliente):

- `Synergy` (exacto — la fila del inventario para este nombre existe pero está vacía) → **2 boletos GENERAL MX**, siempre — el boleto es para el evento Synergy Unlimited MX específicamente, así que la variante es MX sin importar dónde viva el cliente ni cuántos meses dure su membresía.

## 3.2 Extras por ETIQUETA (no por evento): MÁS+ y Black Access

A diferencia de los casos de 3.1 (que **reemplazan** el cálculo por evento), estos dos se **SUMAN** a los boletos que ya le tocan por su evento real — un cliente puede tener evento (ej. `EPMX - GDL`, 3 Meses → 2 GENERAL MX) y además una de estas etiquetas, y el resultado final es la suma de ambos. Se leen del campo **Etiqueta** del cliente (`clientes.etiqueta`), no del campo Evento — antes de esto vivían como casos fijos de evento en la sección 3.1, se movieron aquí para poder combinarse con un evento real.

- Etiqueta `MÁS+` (incluye la variante de escritura `MAS`) → **+3 boletos VIP MX**, siempre — variante fija, no depende del país capturado del cliente (ese campo puede venir vacío o inconsistente y no debe voltear la variante). `MÁS+ USA` es una etiqueta **separada** para los de Estados Unidos → **+3 boletos VIP US**, también fija. **Excepción a la sección 2**: este extra se otorga aunque la membresía NO esté activa (fin calculado antes de la fecha de corte) — para este grupo la oferta del Club en Kajabi es vitalicia. Sí se respeta "Revocado" (si el acceso a plataforma está revocado, no recibe el extra pase lo que pase).
- Etiqueta `BLACK ACCESS` (exacto) → **+1 boleto BLACK**, siempre que la membresía esté activa (regla normal de la sección 2) — pero a diferencia de un evento cualquiera, Black Access trae su propio año extra de acceso al Club (el mismo que ya se refleja en "Fin de acceso" vía `finAccesoConEtiqueta`, `fechas.ts`), y ese año extra SÍ cuenta para decidir si la membresía sigue activa de cara al corte. En otras palabras: si sumarle el año de Black Access a su fecha calculada normal ya alcanza el corte, sí recibe el boleto (y sus boletos normales de evento, que dependen del mismo filtro) aunque su fecha SIN ese bono ya hubiera vencido. Igual que el ajuste de "Fin de acceso", este bono solo aplica cuando la etiqueta se asignó por el flujo normal del CRM (`etiqueta_asignada_en` no nulo) — los clientes migrados desde el CSV ya traían su fecha de inscripción ajustada a mano de origen, sumarles el año otra vez sería contarlo doble. Es el acceso Black al evento Synergy Unlimited 2026.

Ejemplo real: cliente con evento `EPMX - GDL` y membresía de 3 Meses (2 GENERAL MX por evento) que además tiene la etiqueta `BLACK ACCESS` → queda con 2 GENERAL MX + 1 BLACK. Si en vez de Black Access tuviera la etiqueta `MÁS+` → queda con 2 GENERAL MX + 3 VIP.

## 4. Caso especial: Acceso = "Renovación"

Si el campo "Acceso a plataforma" contiene la palabra "renovación" (en cualquier variante/mayúscula), **se ignora la tabla de inventario por evento** y se usa una regla fija basada solo en el país:

```
SI país contiene "méxico" → 1 chip: GRAL MX · 2
SI país contiene "estados unidos" o "canadá" → 2 chips: VIP MX · 2  Y  GRAL US · 2
EN cualquier otro país (resto de LATAM) → 1 chip: VIP MX · 2
```

Esta regla existe porque los clientes en renovación no están ligados a un evento puntual — su boleto depende de dónde viven, no de qué webinar/presencial los originó.

## 5. Overrides manuales por contacto (excepciones individuales)

Los chips de la sección 3 se calculan **por evento**, es decir, son iguales para *todos* los asistentes de ese evento con la misma duración de membresía. Pero hay casos reales donde **una persona en particular** tiene boletos distintos al resto de su evento (compró un upgrade, un boleto BLACK adicional, etc.), sin que eso deba afectar a los demás asistentes del mismo evento.

Para esto se guarda, por separado, un **override por correo** que se aplica *después* del cálculo base:

| Tipo de override | Qué hace |
|---|---|
| `VIP` | Convierte todos los chips GRAL del cliente en VIP, conservando la cantidad (o la cantidad indicada explícitamente en el override, si es distinta). |
| `BLACK` | Convierte todos los chips GRAL/VIP del cliente en BLACK. |
| `GRAL` | Fuerza el chip a GENERAL (útil cuando el evento no existe en la tabla de inventario — ver sección 6). |
| `MIXTO` | El cliente conserva una cantidad de boletos GRAL y además tiene una cantidad de VIP y/o BLACK, todos visibles a la vez (ej. "2 GRAL + 1 VIP"). |

Cada override lleva también una **nota en texto libre** explicando el motivo (quién autorizó, cuánto pagó, qué compró), que se muestra junto al chip.

**Importante:** el override es la única fuente de verdad cuando existe — no se combina automáticamente con la tabla de inventario salvo en el caso MIXTO, donde se parte del valor base (cantidad de GRAL que le tocaría por evento) y se le resta/agrega lo que indique el override.

## 6. Evento no encontrado en la tabla de inventario

Si el evento del cliente no existe como fila en la tabla de inventario (típicamente: eventos nuevos que aún no se cargan a esa hoja), el sistema:

1. Revisa si el cliente tiene un override manual (sección 5).
2. Si lo tiene, construye el chip usando **el país del cliente** para decidir MX/US, y la cantidad indicada en el override (default: 1).
3. Si no tiene override, se muestra "sin información de boletos para este evento" — no se asume nada.

## 7. Casos extraordinarios encontrados (y cómo se resolvieron)

Estos son ejemplos reales que obligaron a ajustar las reglas de arriba. Es importante que el otro CRM sepa que **estos patrones van a repetirse**:

### 7.1 — Campo "Fin de acceso" no confiable / no existe
Cientos de registros con Acceso="Renovación" tenían un campo de fin de acceso importado vacío o inconsistente. Se resolvió dejando de guardar/leer ese campo por completo: se calcula siempre (fecha de renovación, o si no hay, fecha de inscripción, + 1 año) — ver sección 2. **No confiar en ningún valor de "fin de acceso" importado.**

### 7.2 — Un correo usado por varias personas distintas
Es común que una persona pague/registre el boleto de otra usando su propio correo (ej. una compra familiar). Al cruzar datos de compras contra el CRM por correo, **si el nombre no coincide, no es un error de dato — es otra persona**. No se debe sobrescribir el teléfono/boleto del titular del correo con el de un tercero solo porque comparten esa cuenta.

*Ejemplo real:* dos ventas de $2,000 con el mismo correo de pago, pero nombres distintos en cada fila → eran dos personas diferentes pagando desde la misma cuenta, no un boleto doble de una sola persona.

### 7.3 — Upgrade parcial (algunos boletos suben de categoría, otros no)
Un cliente puede tener 3 boletos GRAL y solo pagar el upgrade de 1 a VIP. El resultado correcto es mostrar **2 GRAL + 1 VIP simultáneos** (caso MIXTO), no convertir todo el lote a VIP ni ignorar el resto.

### 7.4 — Monto pagado no coincide con la tarifa esperada
Cuando el upgrade tiene un precio fijo conocido (en este caso $2,000 por boleto), y el monto registrado no es múltiplo limpio de esa tarifa, **es señal de alerta, no un dato usable directamente** — probablemente el monto incluye otro concepto (otra compra empaquetada, un evento distinto). No inferir automáticamente cuántos boletos cubre; marcarlo para revisión manual.

### 7.5 — Datos contradictorios entre columnas de la misma fila
Una fila puede decir "VIP" en una columna de texto libre y "BLACK" en la columna de categoría estructurada de la misma venta. Cuando dos campos que deberían coincidir no lo hacen, **no elegir uno arbitrariamente** — marcar para verificación humana.

### 7.6 — Pagos parciales/apartados no son ventas cerradas
Un registro de compra puede tener un estado tipo "APARTADO" (anticipo) — estos **no deben tratarse como upgrade/venta confirmada** aunque el monto parcial ya esté registrado. Solo se aplican boletos cuando el estado indica venta cerrada.

### 7.7 — Nombre del evento con variantes de escritura
Los nombres de evento deben normalizarse (trim + minúsculas) antes de comparar, porque la misma fuente puede escribir el mismo evento con espacios extra, mayúsculas distintas, etc.

### 7.8 — Multiplicidad de tabs/hojas por "familia" de eventos
En este CRM, los eventos presenciales viven repartidos en distintas pestañas de un mismo spreadsheet, identificadas porque su nombre contiene la palabra "VENTAS". Si el otro CRM tiene una estructura similar (múltiples pestañas por sede/fecha), hay que iterar sobre **todas** las pestañas que calcen ese patrón, no asumir una sola.

## 8. Resumen de la jerarquía de reglas (orden de evaluación)

```
0. ¿Acceso a plataforma = "Revocado"? SÍ → sin boletos (ni siquiera los extras de etiqueta), fin del cálculo (manda sobre todo lo demás)
0.1. ¿Etiqueta = "MÁS+"/"MAS"/"MÁS+ USA"? SÍ → +3 VIP fijos (MX/US según país), vitalicio — se calcula aunque el paso 1 diga que no está activo (se suma al final, no reemplaza el resto)
1. ¿Cliente activo hasta la fecha de corte? (fin calculado: renovación o inscripción, +1 año)
   NO → sin boletos (solo sobrevive el extra de MÁS+ del paso 0.1, si aplica)
1.1. ¿Etiqueta = "BLACK ACCESS"? SÍ → +1 Black fijo, se suma al resultado final (a diferencia de MÁS+, sí requiere estar activo)
2. ¿Acceso = "Renovación"?
   SÍ → chip fijo por país (2 boletos), fin del cálculo base (+ extras de etiqueta si aplican)
3. ¿Existe el evento en la tabla de inventario?
   NO → ¿hay override manual? SÍ → usar override con país del cliente
        NO → "sin información" (aunque sí se dan los extras de etiqueta si aplican)
   SÍ → calcular chips base por evento+duración
4. ¿Existe override manual para este correo?
   SÍ → aplicar override (VIP / BLACK / GRAL / MIXTO) sobre el resultado del paso 3
   NO → usar el resultado del paso 3 tal cual
```
