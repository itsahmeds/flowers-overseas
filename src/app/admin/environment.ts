/**
 * @purpose The deployment environment and its chip label, for the admin chrome (spec 012 §5.3)
 */
import { appEnvironment } from "@/lib/env.schema";
import { adminT } from "@/modules/admin";
import type { AdminEnvironment } from "@/modules/ui";

export function adminEnvironment(): {
  environment: AdminEnvironment;
  label: string;
} {
  const environment = appEnvironment(process.env);
  return {
    environment,
    label: adminT(`admin.shell.environment.${environment}`),
  };
}
