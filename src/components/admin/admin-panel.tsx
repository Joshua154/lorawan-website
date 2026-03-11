"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BoardSelector } from "@/components/admin/board-selector";
import { FormMessage } from "@/components/ui/form-message";
import { RoleBadge } from "@/components/ui/role-badge";
import {
  UserRole,
  type CreateUserPayload,
  type ManagedUser,
  type PingSummary,
  type SessionUser,
  type UpdateUserPayload,
} from "@/lib/types";
import {
  DEFAULT_CREATE_USER_FORM,
  type UserAccountTypeFilter,
  type UserRoleFilter,
  filterExistingSelections,
  filterManagedUsers,
  getManagedUserStats,
  sortNumericStrings,
  toCreateUserPayload,
  toUpdateUserPayload,
  toggleStringSelection,
} from "@/lib/users";
import { useTranslation } from "@/i18n/useTranslation";
import { useSessionActions } from "@/hooks/use-session-actions";

type AdminPanelProps = {
  viewer: SessionUser;
};

type UserListResponse = {
  users: ManagedUser[];
};

type FormFeedback = {
  kind: "success" | "error";
  message: string;
};

type UserMutationResponse = {
  message?: string;
  user?: ManagedUser;
};

export function AdminPanel({ viewer }: AdminPanelProps) {
  const [summary, setSummary] = useState<PingSummary | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [userForm, setUserForm] = useState<CreateUserPayload>(DEFAULT_CREATE_USER_FORM);
  const [editForm, setEditForm] = useState<UpdateUserPayload | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [accountTypeFilter, setAccountTypeFilter] = useState<UserAccountTypeFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [createFeedback, setCreateFeedback] = useState<FormFeedback | null>(null);
  const [managementFeedback, setManagementFeedback] = useState<FormFeedback | null>(null);

  const { t } = useTranslation();
  const { logout, redirectHome, redirectToLogin } = useSessionActions();

  const boardOptions = useMemo(
    () => sortNumericStrings(Object.keys(summary?.boardCounts ?? {})),
    [summary],
  );

  const hasBoards = boardOptions.length > 0;

  const filteredUsers = useMemo(
    () => filterManagedUsers(managedUsers, { searchQuery, roleFilter, accountTypeFilter }),
    [accountTypeFilter, managedUsers, roleFilter, searchQuery],
  );

  const userStats = useMemo(() => getManagedUserStats(managedUsers), [managedUsers]);

  const createDisabled = isSavingUser || isLoading || (userForm.role === "user" && userForm.assignedBoardIds.length === 0);

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);

    try {
      const [usersResponse, summaryResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/pings/summary", { cache: "no-store" }),
      ]);

      if (usersResponse.status === 401 || summaryResponse.status === 401) {
        redirectToLogin();
        return;
      }

      if (usersResponse.status === 403 || summaryResponse.status === 403) {
        redirectHome();
        return;
      }

      if (!usersResponse.ok || !summaryResponse.ok) {
        setManagementFeedback({ kind: "error", message: "Could not load admin data." });
        return;
      }

      const usersPayload = (await usersResponse.json()) as UserListResponse;
      const summaryPayload = (await summaryResponse.json()) as PingSummary;
      setManagedUsers(usersPayload.users);
      setSummary(summaryPayload);
    } catch {
      setManagementFeedback({ kind: "error", message: "Server error while loading admin data." });
    } finally {
      setIsLoading(false);
    }
  }, [redirectHome, redirectToLogin]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    setUserForm((currentForm) => ({
      ...currentForm,
      assignedBoardIds: filterExistingSelections(currentForm.assignedBoardIds, boardOptions),
    }));

    setEditForm((currentForm) =>
      currentForm
        ? {
            ...currentForm,
            assignedBoardIds: filterExistingSelections(currentForm.assignedBoardIds, boardOptions),
          }
        : currentForm,
    );
  }, [boardOptions]);

  const toggleAssignedBoard = (boardId: string) => {
    setUserForm((currentForm) => ({
      ...currentForm,
      assignedBoardIds: toggleStringSelection(currentForm.assignedBoardIds, boardId),
    }));
  };

  const toggleEditBoard = (boardId: string) => {
    setEditForm((currentForm) => {
      if (!currentForm) {
        return currentForm;
      }

      return {
        ...currentForm,
        assignedBoardIds: toggleStringSelection(currentForm.assignedBoardIds, boardId),
      };
    });
  };

  const startEditingUser = (user: ManagedUser) => {
    setEditingUserId(user.id);
    setEditForm({
      username: user.username,
      role: user.role,
      assignedBoardIds: user.assignedBoardIds,
    });
    setManagementFeedback(null);
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setEditForm(null);
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingUser(true);
    setCreateFeedback(null);
    setManagementFeedback(null);

    try {
      const payload = toCreateUserPayload(userForm);

      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string };

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (response.status === 403) {
        redirectHome();
        return;
      }

      if (!response.ok) {
        setCreateFeedback({ kind: "error", message: result.message ?? "Could not create user." });
        return;
      }

      setUserForm(DEFAULT_CREATE_USER_FORM);
      setCreateFeedback({ kind: "success", message: "User created." });
      await loadAdminData();
    } catch {
      setCreateFeedback({ kind: "error", message: "Server error while creating the user." });
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleUpdateUser = async (userId: number) => {
    if (!editForm) {
      return;
    }

    setSavingUserId(userId);
    setManagementFeedback(null);

    try {
      const payload = toUpdateUserPayload(editForm);

      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as UserMutationResponse;

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (response.status === 403) {
        redirectHome();
        return;
      }

      if (!response.ok) {
        setManagementFeedback({ kind: "error", message: result.message ?? "Could not update user." });
        return;
      }

      setManagementFeedback({ kind: "success", message: t("admin.users.feedback.updated") });
      cancelEditingUser();
      await loadAdminData();
    } catch {
      setManagementFeedback({ kind: "error", message: "Server error while updating the user." });
    } finally {
      setSavingUserId(null);
    }
  };

  const handleDeleteUser = async (user: ManagedUser) => {
    if (!window.confirm(t("admin.users.delete.confirm", { username: user.username }))) {
      return;
    }

    setDeletingUserId(user.id);
    setManagementFeedback(null);

    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const result = (await response.json()) as UserMutationResponse;

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (response.status === 403) {
        redirectHome();
        return;
      }

      if (!response.ok) {
        setManagementFeedback({ kind: "error", message: result.message ?? "Could not delete user." });
        return;
      }

      if (editingUserId === user.id) {
        cancelEditingUser();
      }

      setManagementFeedback({ kind: "success", message: t("admin.users.feedback.deleted", { username: user.username }) });
      await loadAdminData();
    } catch {
      setManagementFeedback({ kind: "error", message: "Server error while deleting the user." });
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <main className="admin-page">
      <section className="admin-page-shell">
        <header className="admin-toolbar">
          <div>
            <p className="eyebrow">{t("admin.header.eyebrow")}</p>
            <h1>{t("admin.header.title")}</h1>
            <p className="login-copy">{t("admin.header.subtitle", { username: viewer.username })}</p>
          </div>
          <div className="viewer-actions admin-toolbar-actions">
            <span className="role-badge admin">{t("common.roles.admin")}</span>
            <div className="admin-toolbar-links">
              <Link className="secondary-button nav-link-button" href="/">
                {t("admin.navigation.backToDashboard")}
              </Link>
              <button className="secondary-button" onClick={() => void logout()} type="button">
                {t("common.actions.logout")}
              </button>
            </div>
          </div>
        </header>

        <section className="admin-layout">
          <article className="admin-card admin-form-card">
            <div className="admin-card-header">
              <div>
                <p className="eyebrow">{t("admin.users.form.eyebrow")}</p>
                <h3>{t("admin.users.form.title")}</h3>
              </div>
              <span className="admin-count">{t("admin.users.count", { count: managedUsers.length })}</span>
            </div>

            <form className="admin-form" onSubmit={handleCreateUser}>
              <label>
                <span>{t("common.form.username")}</span>
                <input
                  onChange={(event) =>
                    setUserForm((currentForm) => ({ ...currentForm, username: event.target.value }))
                  }
                  required
                  type="text"
                  value={userForm.username}
                />
              </label>

              <label>
                <span>{t("common.form.password")}</span>
                <input
                  onChange={(event) =>
                    setUserForm((currentForm) => ({ ...currentForm, password: event.target.value }))
                  }
                  required
                  type="password"
                  value={userForm.password}
                />
              </label>

              <label>
                <span>{t("common.form.role")}</span>
                <select
                  onChange={(event) =>
                    setUserForm((currentForm) => ({
                      ...currentForm,
                      role: event.target.value as CreateUserPayload["role"],
                      assignedBoardIds: event.target.value === "admin" ? [] : currentForm.assignedBoardIds,
                    }))
                  }
                  value={userForm.role}
                >
                  <option value="user">{t("common.roles.user")}</option>
                  <option value="admin">{t("common.roles.admin")}</option>
                </select>
              </label>

              {userForm.role === "user" ? (
                <BoardSelector
                  boardLabel={(boardId) => t("admin.boards.boardLabel", { id: boardId })}
                  boardOptions={boardOptions}
                  emptyLabel={t("admin.boards.empty")}
                  hasBoards={hasBoards}
                  onToggle={toggleAssignedBoard}
                  selectedBoardIds={userForm.assignedBoardIds}
                  selectedCountLabel={t("admin.boards.selectedCount", { count: userForm.assignedBoardIds.length })}
                  title={t("admin.boards.title")}
                />
              ) : (
                <p className="helper-text">{t("admin.boards.helper")}</p>
              )}

              <FormMessage feedback={createFeedback} />

              <button className="primary-button" disabled={createDisabled} type="submit">
                {isSavingUser ? t("admin.users.form.submitting") : t("admin.users.form.submit")}
              </button>
            </form>
          </article>

          <article className="admin-card admin-summary-card">
            <div className="admin-card-header">
              <div>
                <p className="eyebrow">{t("admin.summary.eyebrow")}</p>
                <h3>{t("admin.summary.title")}</h3>
              </div>
              <span className="admin-count">{t("admin.boards.count", { count: boardOptions.length })}</span>
            </div>

            <div className="summary-grid admin-summary-grid">
              <article>
                <span>{t("admin.summary.metrics.boards")}</span>
                <strong>{Object.keys(summary?.boardCounts ?? {}).length}</strong>
              </article>
              <article>
                <span>{t("admin.summary.metrics.gateways")}</span>
                <strong>{Object.keys(summary?.gatewayCounts ?? {}).length}</strong>
              </article>
              <article>
                <span>{t("admin.summary.metrics.lastPing")}</span>
                <strong>{summary?.latestTimestamp ? new Date(summary.latestTimestamp).toLocaleString("de-DE") : "--"}</strong>
              </article>
            </div>

            <div className="admin-board-list">
              {boardOptions.map((boardId) => (
                <div className="admin-board-chip" key={boardId}>{t("admin.boards.boardLabel", { id: boardId })}</div>
              ))}
            </div>
          </article>
        </section>

        <section className="admin-card admin-list-card">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">{t("admin.users.list.eyebrow")}</p>
              <h3>{t("admin.users.list.title")}</h3>
            </div>
            <button className="secondary-button" onClick={() => void loadAdminData()} type="button">
              {isLoading ? t("admin.users.list.loading") : t("admin.users.list.refresh")}
            </button>
          </div>

          <div className="admin-user-stats">
            <article>
              <span>{t("admin.users.stats.total")}</span>
              <strong>{managedUsers.length}</strong>
            </article>
            <article>
              <span>{t("admin.users.stats.admins")}</span>
              <strong>{userStats.admins}</strong>
            </article>
            <article>
              <span>{t("admin.users.stats.local")}</span>
              <strong>{userStats.local}</strong>
            </article>
            <article>
              <span>{t("admin.users.stats.oauth")}</span>
              <strong>{userStats.oauth}</strong>
            </article>
          </div>

          <div className="admin-user-filters">
            <label>
              <span>{t("admin.users.filters.searchLabel")}</span>
              <input
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("admin.users.filters.searchPlaceholder")}
                type="search"
                value={searchQuery}
              />
            </label>

            <label>
              <span>{t("admin.users.filters.roleLabel")}</span>
              <select onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)} value={roleFilter}>
                <option value="all">{t("admin.users.filters.allRoles")}</option>
                <option value="admin">{t("common.roles.admin")}</option>
                <option value="user">{t("common.roles.user")}</option>
              </select>
            </label>

            <label>
              <span>{t("admin.users.filters.accountTypeLabel")}</span>
              <select
                onChange={(event) => setAccountTypeFilter(event.target.value as "all" | "local" | "oauth")}
                value={accountTypeFilter}
              >
                <option value="all">{t("admin.users.filters.allAccountTypes")}</option>
                <option value="local">{t("admin.users.list.accountType.local")}</option>
                <option value="oauth">{t("admin.users.filters.oauthOnly")}</option>
              </select>
            </label>
          </div>

          <div className="admin-user-results-bar">
            <p className="helper-text">{t("admin.users.list.results", { count: filteredUsers.length })}</p>
            {(searchQuery || roleFilter !== "all" || accountTypeFilter !== "all") ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setSearchQuery("");
                  setRoleFilter("all");
                  setAccountTypeFilter("all");
                }}
                type="button"
              >
                {t("admin.users.filters.clear")}
              </button>
            ) : null}
          </div>

          <FormMessage feedback={managementFeedback} />

          <div className="admin-user-list">
            {filteredUsers.length === 0 ? (
              <article className="admin-empty-state">
                <strong>{t("admin.users.empty.title")}</strong>
                <p>{t("admin.users.empty.description")}</p>
              </article>
            ) : null}

            {filteredUsers.map((user) => {
              const isEditing = editingUserId === user.id && editForm;

              return (
                <article className={`admin-user-row${isEditing ? " editing" : ""}`} key={user.id}>
                  {isEditing ? (
                    <>
                      <div className="admin-user-editor">
                        <div className="admin-user-heading">
                          <strong>{t("admin.users.editor.title", { username: user.username, self: user.id === viewer.id ? t("admin.users.editor.self") : "" })}</strong>
                          <span className="admin-user-meta-text">
                            {user.auth_type === "oauth"
                              ? t("admin.users.list.accountType.oauth", { provider: user.oauth_provider ?? "" })
                              : t("admin.users.list.accountType.local")}
                          </span>
                        </div>

                        <label>
                          <span>{t("common.form.username")}</span>
                          <input
                            onChange={(event) =>
                              setEditForm((currentForm) =>
                                currentForm ? { ...currentForm, username: event.target.value } : currentForm,
                              )
                            }
                            required
                            type="text"
                            value={editForm.username}
                          />
                        </label>

                        <label>
                          <span>{t("common.form.role")}</span>
                          <select
                            disabled={user.id === viewer.id}
                            onChange={(event) =>
                              setEditForm((currentForm) =>
                                currentForm
                                  ? {
                                      ...currentForm,
                                      role: event.target.value as UpdateUserPayload["role"],
                                      assignedBoardIds:
                                        event.target.value === "admin" ? [] : currentForm.assignedBoardIds,
                                    }
                                  : currentForm,
                              )
                            }
                            value={editForm.role}
                          >
                            <option value="user">{t("common.roles.user")}</option>
                            <option value="admin">{t("common.roles.admin")}</option>
                          </select>
                        </label>

                        {editForm.role === "user" ? (
                          <BoardSelector
                            boardLabel={(boardId) => t("admin.boards.boardLabel", { id: boardId })}
                            boardOptions={boardOptions}
                            emptyLabel={t("admin.boards.empty")}
                            hasBoards={hasBoards}
                            onToggle={toggleEditBoard}
                            selectedBoardIds={editForm.assignedBoardIds}
                            selectedCountLabel={t("admin.boards.selectedCount", { count: editForm.assignedBoardIds.length })}
                            title={t("admin.boards.title")}
                          />
                        ) : (
                          <p className="helper-text">{t("admin.boards.helper")}</p>
                        )}

                        {user.id === viewer.id ? <p className="helper-text">{t("admin.users.list.selfProtected")}</p> : null}
                      </div>

                      <div className="admin-user-actions">
                        <RoleBadge label={editForm.role} role={editForm.role} />
                        <button
                          className="primary-button"
                          disabled={
                            savingUserId === user.id ||
                            deletingUserId === user.id ||
                            (editForm.role === "user" && editForm.assignedBoardIds.length === 0)
                          }
                          onClick={() => void handleUpdateUser(user.id)}
                          type="button"
                        >
                          {savingUserId === user.id ? t("admin.users.list.saving") : t("common.actions.save")}
                        </button>
                        <button className="secondary-button" onClick={cancelEditingUser} type="button">
                          {t("common.actions.cancel")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-user-main">
                        <div className="admin-user-heading">
                          <strong style={{color: user.id === viewer.id ? "red" : ""}}>{user.username} {user.id === viewer.id ? t("admin.users.editor.self") : ""}</strong>
                          <span className="admin-user-meta-text">
                            {user.auth_type === "oauth"
                              ? t("admin.users.list.accountType.oauth", { provider: user.oauth_provider ?? "" })
                              : t("admin.users.list.accountType.local")}
                          </span>
                        </div>

                        <div className="admin-user-meta-row">
                          <span className="admin-meta-pill">
                            {t("admin.users.list.createdAt", {
                              date: new Date(user.createdAt).toLocaleDateString(),
                            })}
                          </span>
                          <span className="admin-meta-pill">
                            {t("admin.users.list.boardCount", { count: user.assignedBoardIds.length })}
                          </span>
                        </div>

                        {user.role === "admin" ? (
                          <p>{t("admin.boards.helper")}</p>
                        ) : user.assignedBoardIds.length > 0 ? (
                          <div className="admin-inline-board-list">
                            {user.assignedBoardIds.map((boardId) => (
                              <span className="admin-board-chip subtle" key={`${user.id}-${boardId}`}>
                                {t("admin.boards.boardLabel", { id: boardId })}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p>{t("admin.boards.none")}</p>
                        )}
                      </div>

                      <div className="admin-user-actions">
                        <RoleBadge label={user.role} role={user.role} />
                        <button
                          className="secondary-button"
                          disabled={Boolean(savingUserId || deletingUserId)}
                          onClick={() => startEditingUser(user)}
                          type="button"
                        >
                          {t("common.actions.edit")}
                        </button>
                        <button
                          className="secondary-button danger-button"
                          disabled={user.id === viewer.id || Boolean(savingUserId || deletingUserId)}
                          onClick={() => void handleDeleteUser(user)}
                          type="button"
                        >
                          {deletingUserId === user.id ? t("admin.users.list.deleting") : t("common.actions.delete")}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}