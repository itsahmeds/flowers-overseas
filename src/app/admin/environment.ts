/**
 * @purpose The admin environment chip (§5.3)
 * @spec 012
 */
import { appEnvironment } from "@/lib/env.schema";
import { adminT } from "@/modules/admin";
import type { AdminEnvironment } from "@/modules/ui/admin/AdminChrome";

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
