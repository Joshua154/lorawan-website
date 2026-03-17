import { DashboardShell } from "../components/dashboard/dashboard-shell";
import { getCurrentUser } from "@/server/auth";
import { getMillisecondsUntilRelease } from "@/server/ping-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const releaseMillisecondsRemaining = getMillisecondsUntilRelease();
  return <DashboardShell releaseMillisecondsRemaining={releaseMillisecondsRemaining} viewer={user} />;
}
