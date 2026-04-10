import Link from "next/link";

import type { TranslateFn } from "@/components/admin/statistics/admin-statistics-utils";

type AdminStatisticsHeaderProps = {
  username: string;
  t: TranslateFn;
  onLogout: () => void;
};

export function AdminStatisticsHeader({ username, t, onLogout }: AdminStatisticsHeaderProps) {
  return (
    <header className="admin-toolbar">
      <div>
        <p className="eyebrow">{t("admin.stats.header.eyebrow")}</p>
        <h1>{t("admin.stats.header.title")}</h1>
        <p className="login-copy">{t("admin.stats.header.subtitle", { username })}</p>
      </div>
      <div className="viewer-actions admin-toolbar-actions">
        <span className="role-badge admin">{t("common.roles.admin")}</span>
        <div className="admin-toolbar-links">
          <Link className="secondary-button nav-link-button" href="/admin/users">
            {t("admin.stats.navigation.manageUsers")}
          </Link>
          <Link className="secondary-button nav-link-button" href="/admin/configurations">
            {t("admin.stats.navigation.manageConfigurations")}
          </Link>
          <Link className="secondary-button nav-link-button" href="/">
            {t("admin.navigation.backToDashboard")}
          </Link>
          <button className="secondary-button" onClick={onLogout} type="button">
            {t("common.actions.logout")}
          </button>
        </div>
      </div>
    </header>
  );
}
