import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ADMIN_MODULE_UNAVAILABLE_MESSAGE,
  classifyAdminResponse,
  countActionableAdminAlerts,
  formatNullableAdminMetric,
} from "./adminOperational.ts";

test("una lista vacía válida conserva el estado disponible", () => {
  const result = classifyAdminResponse(
    { ok: true, status: 200 },
    { success: true },
    "No se pudo cargar"
  );
  assert.deepEqual(result, { kind: "valid" });
});

test("MIGRATION_REQUIRED se clasifica como módulo degradado", () => {
  const result = classifyAdminResponse(
    { ok: false, status: 503 },
    { success: false, code: "MIGRATION_REQUIRED", message: "detalle no confiable" },
    "No se pudo cargar"
  );
  assert.deepEqual(result, {
    kind: "degraded",
    message: ADMIN_MODULE_UNAVAILABLE_MESSAGE,
  });
});

test("otros fallos siguen siendo errores accionables", () => {
  const result = classifyAdminResponse(
    { ok: false, status: 500 },
    { success: false, message: "Fallo real" },
    "Fallback"
  );
  assert.deepEqual(result, { kind: "error", message: "Fallo real" });
});

test("avisos operacionales normales no incrementan alertas", () => {
  assert.equal(
    countActionableAdminAlerts([
      null,
      "MFA verificado. Completando operación…",
      ADMIN_MODULE_UNAVAILABLE_MESSAGE,
      "Error cargando usuarios",
    ]),
    1
  );
});

test("métrica cero y métrica no disponible se diferencian", () => {
  assert.equal(formatNullableAdminMetric(0), "0");
  assert.equal(formatNullableAdminMetric(null), "No disponible");
});

test("el frontend no registra el payload completo del historial arrendaticio", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/aportar-historial/page.tsx"),
    "utf8"
  );
  assert.doesNotMatch(source, /console\.log\(\s*["']\[RENTAL_HISTORY_SUBMIT\]["']\s*,\s*payload/);
});
