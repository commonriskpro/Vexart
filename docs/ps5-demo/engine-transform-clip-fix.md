# Corrección interna de transformaciones y recortes

**Fecha:** 2026-09-09  
**Alcance:** motor TypeScript de Vexart; no cambia la API pública ni el límite nativo.

## Resumen

Se corrigió la composición interna del patrón `overflow: hidden` + fila
transformada que bloqueaba el carrusel de la demo PS5. La corrección mantiene
la intención web con las primitivas ya disponibles: cada transformación tiene
un único dueño durante la rasterización/composición y los recortes conservan
su espacio y ascendencia al cruzar límites de capa.

La implementación se realizó en el motor TypeScript (walk/layers, render
graph, paint/composite, backend GPU e hit testing). No se añadieron props,
métodos ni exports públicos, ni se hicieron cambios en `native/libvexart`.

## Causas corregidas

1. **Transformación duplicada.** El desplazamiento de una subárbol aislado se
   aplicaba al rasterizar y otra vez al componer la capa. El dueño de la
   frontera se conserva ahora hasta composición final, sin eliminar las
   transformaciones descendientes.
2. **Recorte en el espacio equivocado.** Un hijo que todavía estaba fuera del
   viewport se descartaba antes de que su transformación lo hiciera visible.
   El motor conserva la relación entre recorte externo y contenido transformado
   y aplica cada recorte en el espacio correspondiente.
3. **Estado de interacción.** El hit testing usa la geometría transformada y
   no descarta anticipadamente los elementos que entran al viewport.
4. **Recortes vacíos.** Un recorte de intersección nula no se confunde con la
   ausencia de recorte durante la construcción del render graph.

## Estrategia de compatibilidad

Cuando un subárbol transformado está dentro de un scroll con recorte, la ruta
correctness-first conserva ese subárbol en el paint stream del padre, incluidas
sus capas descendientes explícitas, si separarlo rompería el espacio del clip.
Una solicitud explícita de `layer` sigue representando una capa de composición
propia en los casos compatibles; bajo este clipping se aplana conservadoramente
para preservar la corrección visual. Esto no redefine el contrato general de
capas ni constituye una validación de rendimiento máximo del motor gráfico.

## Validación actual

La reproducción pública mínima source-public, en variantes sin layer, con layer
y con overlay, termina ahora con exit 0 y reporta centros de color esperados,
`outsideInk=0`, `imageBuckets=79`, `enteringImageVisible=true` y `pointerHit2`.
El comando y la evidencia están documentados en [`validation.md`](validation.md)
y [`api-blockers.md`](api-blockers.md).

La fila integrada de 24 tarjetas también reporta `visibleAfterNavigation=true`,
`rowInsideInk=38370` y `rowOutsideInk=0` después del ciclo de navegación/overlay
disponible. Una ejecución aislada anterior produjo `37441`; la variación es
timer-backed. El campo `runtimeRow.status` sigue como
`unverified-overlay-lifecycle`: esto valida un ciclo observado, no toda la
suite de lifecycle. El crossfade final, Kitty físico, la validación empaquetada
completa y el rendimiento siguen pendientes.

Durante la corrección se encontró además que el backend comparaba `opBounds`
en coordenadas absolutas (por ejemplo, `y=280`) contra un target local (`h=107`).
El helper de clipping ahora resta `ctx.offsetX/Y` antes de decidir la visibilidad;
hay una regresión para el caso con un hermano precedente.

La ejecución final obtuvo 780 pruebas pasadas y 1 fallo (781 pruebas en 124
archivos, 4242 assertions). El único fallo fue la paridad física de
`scripts/visual-test/tmux-grid.test.ts` por falta de TTY/Kitty, no una aserción
del motor. `typecheck` y la comprobación de diff pasaron.

## Decisión de gate

Los dos bloqueos mínimos de posición/recorte dejan de reproducirse con el
runtime source-public corregido y la fila integrada ya no queda vacía.
**Phase 1 no se declara completamente aprobada** hasta cerrar la validación
empaquetada, Kitty físico, crossfade y rendimiento indicados arriba.
