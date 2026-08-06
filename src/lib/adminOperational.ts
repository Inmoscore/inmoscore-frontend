export const ADMIN_MODULE_UNAVAILABLE_MESSAGE = "Módulo temporalmente no disponible";

type AdminApiPayload = {
  success?: boolean;
  code?: string;
  message?: string;
};

export type AdminResponseClassification =
  | { kind: "valid" }
  | { kind: "degraded"; message: typeof ADMIN_MODULE_UNAVAILABLE_MESSAGE }
  | { kind: "error"; message: string };

export function classifyAdminResponse(
  response: Pick<Response, "ok" | "status">,
  payload: AdminApiPayload,
  fallbackMessage: string
): AdminResponseClassification {
  if (response.status === 503 && payload.code === "MIGRATION_REQUIRED") {
    return { kind: "degraded", message: ADMIN_MODULE_UNAVAILABLE_MESSAGE };
  }

  if (!response.ok || payload.success === false) {
    return { kind: "error", message: payload.message || fallbackMessage };
  }

  return { kind: "valid" };
}

export function countActionableAdminAlerts(messages: Array<string | null | undefined>): number {
  return messages.filter((message) => {
    const normalized = String(message || "").trim().toLowerCase();
    return (
      normalized.length > 0 &&
      !normalized.startsWith("mfa verificado.") &&
      normalized !== ADMIN_MODULE_UNAVAILABLE_MESSAGE.toLowerCase()
    );
  }).length;
}

export function formatNullableAdminMetric(value: number | null): string {
  return value === null ? "No disponible" : value.toLocaleString("es-CO");
}
