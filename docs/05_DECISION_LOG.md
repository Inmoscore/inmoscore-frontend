# InmoScore - Decision Log

## Formato

Cada decision relevante debe registrar fecha, contexto, decision, impacto y estado.

## Decisiones clave

### Resend reemplaza SMTP GoDaddy

Estado: aceptada.

Contexto:

- Los flujos de autenticacion y notificacion requieren entrega confiable y trazable.

Decision:

- Resend es el proveedor oficial para emails transaccionales.

Impacto:

- Configuracion de dominio/remitente debe validarse antes de produccion.
- GoDaddy SMTP deja de ser la ruta primaria.

### Turnstile obligatorio en auth

Estado: aceptada.

Contexto:

- Registro, login y reset password son superficies de abuso.

Decision:

- Cloudflare Turnstile es obligatorio en flujos sensibles de autenticacion.

Impacto:

- Frontend debe enviar token Turnstile.
- Backend debe verificar token antes de completar la accion.
- Dominios productivos deben estar autorizados.

### Auditoria best-effort

Estado: aceptada.

Contexto:

- La auditoria es critica, pero fallos no esenciales de logging no deben tumbar operaciones validas.

Decision:

- Registrar eventos relevantes con estrategia best-effort donde aplique.

Impacto:

- Errores de auditoria deben capturarse sin exponer secretos.
- Operaciones legales o economicas deben evaluar caso por caso si la auditoria es bloqueante.

### Creditos con idempotencia

Estado: aceptada.

Contexto:

- Busquedas y pagos pueden recibir reintentos o webhooks duplicados.

Decision:

- Las operaciones que descuentan creditos o aplican beneficios deben ser idempotentes.

Impacto:

- Evitar doble descuento por reintentos.
- Usar llaves de operacion, estados o registros de auditoria para reconciliacion.

### Reportes con trazabilidad legal

Estado: aceptada.

Contexto:

- Los reportes pueden impactar decisiones sobre titulares de datos.

Decision:

- Todo reporte debe conservar evidencia, origen, revision y trazabilidad legal.

Impacto:

- Reportes requieren estados, evidencia, logs, notificaciones y posibilidad de contradiccion.
- Administracion debe poder revisar acciones y cambios.
