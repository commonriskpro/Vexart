# Flexily vendorizado

Esta copia proviene sin cambios semánticos del repositorio upstream:

- Repository: https://github.com/beorn/flexily
- Revisión fijada: `e9a752aacef9d84d20c383443b9c89f2ad2daf4a`
- Tag reproducido: `v0.6.0`
- Tarball de comprobación: https://registry.npmjs.org/flexily/-/flexily-0.6.0.tgz
- Integridad observada en el lock antes de enlazar el workspace: `sha512-V2z9Nx+a77dicQUM5ktU6A4wSoNUbbVRocOCjXgLHIkhl/pdmrtX8MWQTwBJ3mCuB4pkniitvKW5C4tBo94XIg==`
- Licencia: MIT, conservada en `LICENSE`.

Se vendorizó el árbol completo `src/` del commit fijado, incluidos los módulos
base de layout, Node, tipos, medición de texto, entrypoint y auxiliares. El
paquete workspace y su configuración de TypeScript son los únicos metadatos
locales; las decisiones de build y resolución se verifican en G-003/G-004.
No se edita `node_modules`, no se modifica upstream y no se implementa Grid en
esta tarea.
