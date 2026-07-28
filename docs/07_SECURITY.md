# InmoScore - Security

## Principios

- Seguridad por defecto.
- Minimo privilegio.
- Defensa en profundidad.
- Trazabilidad de eventos criticos.
- Proteccion estricta de PII, documentos, tokens y secretos.

## OWASP

Controles prioritarios:

- Validacion de entrada en backend.
- Autenticacion fuerte y manejo seguro de sesiones.
- Autorizacion por rol y organizacion.
- Rate limiting en endpoints publicos.
- Proteccion contra enumeracion de usuarios.
- Sanitizacion de logs.
- CORS configurado por entorno con coincidencia exacta de origen.
- Headers de seguridad con Helmet.

## CORS

- `FRONTEND_URL` define el unico origen productivo obligatorio.
- `ADDITIONAL_ALLOWED_ORIGINS` admite una lista opcional de origenes HTTPS exactos,
  separados por comas, para previews autorizados expresamente.
- No se autorizan dominios automaticamente por sufijo, incluido `*.vercel.app`.
- Solicitudes sin `Origin` siguen permitidas para clientes no navegador y health checks.
- Las solicitudes preflight `OPTIONS` y `credentials: true` permanecen habilitadas.

## JWT y autenticacion

- Backend valida tokens antes de acceder a recursos protegidos.
- Los endpoints admin deben exigir privilegios adicionales.
- Tokens no deben registrarse en logs.
- Flujos de cambio/reset password deben auditarse sin exponer el secreto ni confirmar existencia de cuentas indebidamente.

## Turnstile

Turnstile es obligatorio en:

- Registro.
- Login.
- Reset password.

Reglas:

- Verificar siempre en backend.
- Rechazar tokens invalidos, ausentes o expirados.
- Configurar dominios permitidos para local, staging y produccion.
- No reutilizar tokens.

## Resend

- Resend es el proveedor oficial de correo transaccional.
- API key solo en backend o proveedor autorizado.
- Validar dominio/remitente antes de produccion.
- No enviar secretos por correo.

## Supabase Auth

- Usar Supabase Auth para flujos de identidad donde aplique.
- Configurar redirects productivos exactos.
- Revisar plantillas de email y dominios.
- No exponer service role en frontend.

## Auditoria

Eventos recomendados:

- Registro, login, login fallido, reset password y cambio de password.
- Busquedas.
- Consumo de creditos.
- Creacion y revision de reportes.
- Acceso a documentos.
- Acciones admin.
- Solicitudes legales, disputas y revision humana.

## Proteccion de secretos

- Secretos solo en `.env` locales o variables del proveedor.
- Nunca commitear `.env`.
- Nunca imprimir secrets en consola.
- Rotar claves si hay sospecha de exposicion.
- Separar claves publicas y privadas.

## Documentos y PII

- Usar almacenamiento seguro y acceso firmado.
- Registrar accesos a documentos.
- Limitar exposicion de PII por rol y necesidad operacional.
- Mantener trazabilidad de origen, base legal y estado de disputa.
