import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionsSource = readFileSync(
  new URL("./actions.ts", import.meta.url),
  "utf8"
);
const formSource = readFileSync(
  new URL("./ResetPasswordForm.tsx", import.meta.url),
  "utf8"
);
const loginSource = readFileSync(
  new URL("../login/page.tsx", import.meta.url),
  "utf8"
);

test("successful password reset redirects after cleanup while failures remain in the form", () => {
  const finalDeleteGrant = actionsSource.lastIndexOf("deleteGrant();");
  const successLog = actionsSource.lastIndexOf(
    'logResetPasswordStage("RESET_PASSWORD_SUCCESS")'
  );
  const successRedirect = actionsSource.lastIndexOf(
    'redirect("/login?password_reset=success")'
  );

  assert.ok(finalDeleteGrant >= 0);
  assert.ok(successLog > finalDeleteGrant);
  assert.ok(successRedirect > successLog);
  assert.doesNotMatch(
    actionsSource.slice(successLog, successRedirect),
    /return\s+\{/
  );

  assert.match(formSource, /<form action=\{formAction\}/);
  assert.match(formSource, /state\.status === "error"/);
  assert.doesNotMatch(formSource, /state\.status === "success"/);

  assert.match(
    loginSource,
    /Contraseña actualizada correctamente\. Ya puedes iniciar sesión\./
  );
  assert.match(
    loginSource,
    /cleanedSearchParams\.delete\("password_reset"\)/
  );
  assert.match(loginSource, /window\.history\.replaceState\(/);
});
