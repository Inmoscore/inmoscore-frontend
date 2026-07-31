"use client";

export const EMAIL_VERIFICATION_REQUIRED_CODE = "EMAIL_VERIFICATION_REQUIRED";
export const EMAIL_VERIFICATION_PENDING_PATH = "/correo-pendiente";

type EmailVerificationErrorPayload = {
  code?: unknown;
};

export async function isEmailVerificationRequiredResponse(
  response: Response
): Promise<boolean> {
  if (response.status !== 403) return false;

  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as EmailVerificationErrorPayload | null;

  return payload?.code === EMAIL_VERIFICATION_REQUIRED_CODE;
}

export async function handleEmailVerificationRequiredResponse(
  response: Response,
  navigate: (path: string) => void = (path) => {
    if (
      typeof window !== "undefined" &&
      window.location.pathname !== EMAIL_VERIFICATION_PENDING_PATH
    ) {
      window.location.assign(path);
    }
  }
): Promise<boolean> {
  const required = await isEmailVerificationRequiredResponse(response);
  if (!required) return false;

  navigate(EMAIL_VERIFICATION_PENDING_PATH);
  return true;
}

export async function emailVerificationFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await globalThis.fetch(input, init);
  await handleEmailVerificationRequiredResponse(response);
  return response;
}
