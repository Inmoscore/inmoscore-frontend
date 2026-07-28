# InmoScore - Testing QA

## Checklist funcional antes de produccion

## Frontend

- Home carga sin errores.
- Login muestra errores controlados.
- Registro muestra Turnstile.
- Reset password muestra Turnstile.
- Dashboard carga con usuario autenticado.
- Rutas protegidas redirigen si no hay sesion.
- Vistas admin no son accesibles por usuario no admin.

## Autenticacion

- Registro exitoso.
- Registro con Turnstile invalido falla.
- Login exitoso.
- Login con password incorrecto no filtra informacion sensible.
- Login con Turnstile invalido falla.
- Resend verification funciona.
- Reset password envia email.
- Link de reset redirige correctamente en produccion.
- Cambio de password funciona.
- Auditoria de reset exitoso queda registrada.
- Recovery TokenHash valido ejecuta `verifyOtp` una sola vez.
- Scanner que solo hace GET no consume el OTP.
- GET de `/auth/confirm` guarda cookie temporal y redirige 303 a URL limpia.
- El HTML intersticial no contiene `token_hash` ni campos hidden.
- Cookie temporal ausente o expirada rechaza el POST.
- Token reutilizado redirige a `reset-password?error=invalid_link`.
- `type` incorrecto y `next` externo son bloqueados.
- Sesion normal sin autorizacion firmada no habilita reset.
- Sesion verificada con autorizacion firmada si habilita reset.

### Evidencia productiva de recovery - 2026-07-24

- Password nueva permite login.
- Password anterior deja de funcionar.
- Enlace de recovery reutilizado es rechazado.
- Exito redirige al login y muestra confirmacion.
- Fallos publicos no exponen clasificaciones internas.

## Busqueda y creditos

- Busqueda por cedula valida funciona.
- Busqueda sin creditos falla de forma controlada.
- Reintento no descuenta doble credito.
- Search audit queda registrado.
- Resultado no expone datos fuera del permiso del usuario.

## Reportes

- Crear reporte con datos validos.
- Adjuntar o asociar evidencia cuando aplique.
- Reporte queda en estado esperado.
- Admin puede revisar reporte.
- Notificacion/derecho de contradiccion queda trazable.
- Legal report audit queda registrado.

## Legal y datos

- Documentos legales activos se consultan.
- Aceptacion legal se registra.
- Solicitud de datos se crea.
- Disputa se crea.
- Revision humana se crea.
- Identidad puede solicitar verificacion.
- Usuario puede consultar sus solicitudes.

## Documentos seguros

- Upload intent funciona.
- Confirm upload funciona.
- Access check funciona.
- Signed read expira y requiere permiso.
- Document access log queda registrado.

## Admin

- MFA admin status/setup/verify funciona.
- Listado de usuarios carga.
- Cambio de plan audita evento.
- Reportes admin cargan.
- Solicitudes legales admin cargan.
- Inventario de datos carga.
- Audit logs cargan.
- Metricas cargan.

## Billing

- Webhook Wompi procesa evento valido.
- Webhook duplicado no duplica beneficio.
- Verificacion/reconciliacion admin funciona.
- Upgrade event queda registrado.

## Seguridad

- No hay secrets en consola del navegador.
- No hay secrets en logs backend.
- CORS bloquea origen no autorizado.
- Rate limit responde correctamente.
- Endpoints protegidos rechazan sin token.
- Endpoints admin rechazan usuario no admin.

## Build

- Frontend: `npm run build`.
- Backend: `cd backend && npm run build`.
- Revisar errores TypeScript.
- Revisar warnings relevantes.
