# BUG-003 - Cuentas con correo no confirmado reciben sesion completa y pueden ejecutar operaciones sensibles

**Version:** v1.1
**Fecha de creacion:** 2026-07-30
**Ultima actualizacion:** 2026-07-31
**Responsable:** InmoScore Engineering Team
**Estado:** DONE
**Prioridad:** HIGH

## 1. Resumen

Registro y login emitian una sesion operativa aunque `public.users.email_verified_at`
permaneciera nulo. Los controles existentes no exigian confirmacion de correo.

## 2. Impacto

Una cuenta sin control demostrado sobre el correo podia ejecutar operaciones sensibles,
incluidas consultas, documentos, pagos, credenciales y, si ya tenia rol, administracion.

## 3. Pasos para reproducir

1. Registrar una cuenta sin abrir el correo de confirmacion.
2. Conservar el JWT entregado por registro.
3. Invocar directamente una ruta sensible.
4. Observar que la operacion superaba autenticacion.

## 4. Resultado actual

La implementacion productiva emite sesion `restricted`, consulta el campo canonico
`public.users.email_verified_at` y bloquea por defecto rutas fuera de la allowlist exacta.

## 5. Resultado esperado

La cuenta conserva dashboard limitado, reenvio, confirmacion, recovery, logout y soporte.
Toda operacion sensible devuelve `403 EMAIL_VERIFICATION_REQUIRED` hasta sincronizar la
confirmacion y volver a iniciar sesion para obtener alcance `full`.

## 6. Evidencia

- Pruebas backend de persistencia, sesion, admin y llamada directa.
- Pruebas frontend de confirmacion y redireccion centralizada.
- Builds frontend y backend exitosos.
- Railway y Vercel reportaron despliegue exitoso para el SHA validado.
- `GET /health` respondio `200` antes y despues de la prueba controlada.
- La cuenta sin confirmar recibio sesion `restricted`; checkout y busqueda protegida
  respondieron `403 EMAIL_VERIFICATION_REQUIRED`.
- La confirmacion se realizo administrativamente mediante Supabase Auth para la prueba;
  la sesion anterior permanecio restringida y el nuevo login emitio sesion `full`.
- `POST /api/billing/create-wompi-checkout` respondio `200`, genero una referencia unica,
  creo una sola fila `created` y entrego la configuracion necesaria para cargar el widget.
- El widget Wompi cargo sin autorizar pago, capturar fondos ni activar el plan.
- La fila de checkout, el perfil QA y el usuario de Supabase Auth fueron eliminados al finalizar.

## 7. Dependencias

Supabase Auth, Resend, `public.users.email_verified_at` y migracion no destructiva Wompi.

## 8. Acceptance Criteria

- Usuario no confirmado bloqueado por backend.
- Usuario confirmado habilitado solo con sesion reemitida.
- Reenvio y recovery disponibles.
- Admin no confirmado bloqueado.
- Llamadas directas no evitan el control.
- Pago Wompi aprobado no activa plan antes de confirmar.

## 9. Notas

La migracion productiva y el flujo controlado fueron validados el 2026-07-31. El incidente
previo `500` del checkout quedo resuelto al configurar en Railway las cuatro variables Wompi
requeridas y redesplegar el servicio. No se documentan valores, fragmentos ni longitudes de
las llaves.
