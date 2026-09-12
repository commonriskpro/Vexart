# Encargo: adaptar el audit loop a Comet

## Pedido del usuario

Adaptar el loop reutilizable de auditoría de código a Comet en una tarea
separada. No mezclar procesos, registros, estrellas ni ramas con Vexart. Este
handoff no inicia auditorías ni autoriza operaciones externas.

## Ubicaciones

- Proyecto destino: `/Users/saturno/Developer/Comet`.
- Implementación de referencia: `/Users/dev/ve/vexart/scripts/audit-loop/`.
- Leer primero las instrucciones vigentes del destino, `CONTEXT.md`,
  `docs/llm-code-map.md`, `docs/test-map.md` y `Package.swift`.

## Situación verificada mediante inspección, no ejecución

Comet usa SwiftPM / Swift 6, macOS 14 e iOS 17. Incluye `CometCore`,
`CometHostCore`, `CometRemote`, `CometRemoteUI`, `CometSyntax` y los ejecutables
`Comet`, `CometHost`, `CometMenu`. Tiene dependencias GRDB.swift y SwiftTerm;
WebRTC es opcional. Verificar versiones y configuración actuales antes de actuar.

Respetar las autoridades de Comet: `CometHost` controla ejecución, aprobaciones,
configuración y efectos; `AppDatabase` controla persistencia. Conservar la
identidad exacta `(projectID, executionRootID)`.

## Trabajo

1. Inspeccionar estado Git y proteger cambios ajenos. Trabajar en un worktree
   aislado desde un commit identificado; no copiar trabajo sucio implícitamente.
2. Revisar el controlador de referencia realmente, no solamente su README.
   Hoy presupone `node_modules`, Bun, scripts `typecheck` / `test` y una ruta
   Cargo específica de Vexart: **no es portable sin cambios**.
3. Proponer el cambio mínimo que separe checks/preparación del proyecto de la
   orquestación genérica. Un verificador independiente debe confirmar antes de
   implementar que corrige la arquitectura, sin hotfix, migración ni ad-hoc.
   Presentar cualquier decisión real de ownership o contrato al usuario.
4. Adaptar checks a SwiftPM: preflight del toolchain, dependencias/cache offline
   disponibles, scratch/build paths aislados y pruebas focalizadas. No convertir
   automáticamente un `swift build` en una instalación/resolución de red.
   Si falta cache suficiente, informar el requisito exacto, no saltar checks.
5. Mantener triangulación de código y contrato con reproducción ejecutable,
   revisión independiente previa y posterior, un commit por fix verificado,
   estrellas deduplicadas por fallo real y aprendizaje de resultados guardados.
6. Mantener Astra High para orquestación, exploración e implementación, y Luna xhigh para verificación independiente según el
   pedido del usuario; verificar soporte y recibos reales, nunca usar `minimal`
   para Astra ni cambiar configuración global de modelos.
7. Reutilizar el panel local de solo lectura, con identidad visual de Comet y
   puerto independiente. No representar actividad individual en vivo si solo
   existe telemetría persistida al terminar el intento.
8. Probar primero el ciclo completo en un fixture Swift aislado con un fallo
   conocido. Reportar por separado esa prueba y cualquier auditoría real Comet.
   Antes de activar ejecución recurrente, confirmar alcance operativo con el
   usuario y revisar permisos/requisitos del proyecto.

## Checks candidatos (verificar precondiciones antes de ejecutar)

- `git diff --check`
- `swift build` y `swift test`; preferir `swift test --filter <TestClass>` para
  un cambio focalizado. Inspeccionar flags offline soportados por el toolchain.
- Para ámbitos que lo requieran: targets/productos específicos de SwiftPM.
- Las guías del repo también referencian `Tests/ui-golden-pixel-diff.sh`,
  `scripts/production-harness-e2e.sh` y `scripts/release-doctor.sh`. **Inspeccionar
  sus efectos antes de ejecutarlos**; no lanzar pruebas live/external por defecto.

UI, packaging, Host IPC, CloudKit, GitHub, WebRTC y dispositivos físicos son
capas diferentes de evidencia: un test unitario no prueba su funcionamiento.

## Límites y aceptación

No alterar automáticamente `Package.swift`, `Package.resolved`, credenciales,
servicios Host activos, configuración, artefactos instalados ni datos de usuario.
No hacer push, desplegar o ejecutar operaciones externas sin autorización.
No tocar el runner Vexart que ya está activo.

Entregar cambios nombrados, revisión independiente, comandos y resultados reales,
commits, cómo iniciar/ver/detener el loop, límites conocidos y decisiones abiertas.
