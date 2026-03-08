"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CreateUserPayload, ManagedUser, PingSummary, SessionUser, UserRole } from "@/lib/types";

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

const DEFAULT_USER_FORM: CreateUserPayload = {
  username: "",
  password: "",
  role: "user",
  assignedBoardIds: [],
};

export function AdminPanel({ viewer }: AdminPanelProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<PingSummary | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [userForm, setUserForm] = useState<CreateUserPayload>(DEFAULT_USER_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userFeedback, setUserFeedback] = useState<FormFeedback | null>(null);

  const redirectToLogin = useCallback(() => {
    router.push("/login");
    router.refresh();
  }, [router]);

  const boardOptions = useMemo(
    () => Object.keys(summary?.boardCounts ?? {}).sort((left, right) => Number(left) - Number(right)),
    [summary],
  );

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    setUserFeedback(null);

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
        router.push("/");
        router.refresh();
        return;
      }

      if (!usersResponse.ok || !summaryResponse.ok) {
        setUserFeedback({ kind: "error", message: "Could not load admin data." });
        return;
      }

      const usersPayload = (await usersResponse.json()) as UserListResponse;
      const summaryPayload = (await summaryResponse.json()) as PingSummary;
      setManagedUsers(usersPayload.users);
      setSummary(summaryPayload);
    } catch {
      setUserFeedback({ kind: "error", message: "Server error while loading admin data." });
    } finally {
      setIsLoading(false);
    }
  }, [redirectToLogin, router]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    setUserForm((currentForm) => ({
      ...currentForm,
      assignedBoardIds: currentForm.assignedBoardIds.filter((boardId) => boardOptions.includes(boardId)),
    }));
  }, [boardOptions]);

  const toggleAssignedBoard = (boardId: string) => {
    setUserForm((currentForm) => ({
      ...currentForm,
      assignedBoardIds: currentForm.assignedBoardIds.includes(boardId)
        ? currentForm.assignedBoardIds.filter((currentBoardId) => currentBoardId !== boardId)
        : [...currentForm.assignedBoardIds, boardId],
    }));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    redirectToLogin();
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingUser(true);
    setUserFeedback(null);

    try {
      const payload: CreateUserPayload = {
        ...userForm,
        username: userForm.username.trim(),
        password: userForm.password,
        assignedBoardIds:
          userForm.role === "admin"
            ? []
            : [...new Set(userForm.assignedBoardIds)].sort((left, right) => Number(left) - Number(right)),
      };

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
        router.push("/");
        router.refresh();
        return;
      }

      if (!response.ok) {
        setUserFeedback({ kind: "error", message: result.message ?? "Could not create user." });
        return;
      }

      setUserForm(DEFAULT_USER_FORM);
      setUserFeedback({ kind: "success", message: "User created." });
      await loadAdminData();
    } catch {
      setUserFeedback({ kind: "error", message: "Server error while creating the user." });
    } finally {
      setIsSavingUser(false);
    }
  };

  return (
    <main className="admin-page">
      <section className="admin-page-shell">
        <header className="admin-toolbar">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Benutzer und Board-Zugriff</h1>
            <p className="login-copy">Angemeldet als {viewer.username}. Admins können Nutzer anlegen und alle Boards sehen.</p>
          </div>
          <div className="viewer-actions admin-toolbar-actions">
            <span className="role-badge admin">Admin</span>
            <div className="admin-toolbar-links">
              <Link className="secondary-button nav-link-button" href="/">
                Zurück zum Dashboard
              </Link>
              <button className="secondary-button" onClick={() => void handleLogout()} type="button">
                Abmelden
              </button>
            </div>
          </div>
        </header>

        <section className="admin-layout">
          <article className="admin-card admin-form-card">
            <div className="admin-card-header">
              <div>
                <p className="eyebrow">Neuer Benutzer</p>
                <h3>Account anlegen</h3>
              </div>
              <span className="admin-count">{managedUsers.length} Accounts</span>
            </div>

            <form className="admin-form" onSubmit={handleCreateUser}>
              <label>
                <span>Username</span>
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
                <span>Password</span>
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
                <span>Role</span>
                <select
                  onChange={(event) =>
                    setUserForm((currentForm) => ({
                      ...currentForm,
                      role: event.target.value as UserRole,
                      assignedBoardIds: event.target.value === "admin" ? [] : currentForm.assignedBoardIds,
                    }))
                  }
                  value={userForm.role}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              {userForm.role === "user" ? (
                <div className="admin-board-picker">
                  <span>Sichtbare Boards</span>
                  <div className="admin-board-grid">
                    {boardOptions.map((boardId) => (
                      <label key={boardId}>
                        <input
                          checked={userForm.assignedBoardIds.includes(boardId)}
                          onChange={() => toggleAssignedBoard(boardId)}
                          type="checkbox"
                        />
                        <span>{`Board ${boardId}`}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="helper-text">Admins can always see every board.</p>
              )}

              {userFeedback ? <p className={`form-message ${userFeedback.kind}`}>{userFeedback.message}</p> : null}

              <button className="primary-button" disabled={isSavingUser || isLoading} type="submit">
                {isSavingUser ? "Speichert…" : "Benutzer anlegen"}
              </button>
            </form>
          </article>

          <article className="admin-card admin-summary-card">
            <div className="admin-card-header">
              <div>
                <p className="eyebrow">Dataset</p>
                <h3>Verfügbare Boards</h3>
              </div>
              <span className="admin-count">{boardOptions.length} Boards</span>
            </div>

            <div className="summary-grid admin-summary-grid">
              <article>
                <span>Boards</span>
                <strong>{Object.keys(summary?.boardCounts ?? {}).length}</strong>
              </article>
              <article>
                <span>Gateways</span>
                <strong>{Object.keys(summary?.gatewayCounts ?? {}).length}</strong>
              </article>
              <article>
                <span>Letzter Ping</span>
                <strong>{summary?.latestTimestamp ? new Date(summary.latestTimestamp).toLocaleString("de-DE") : "--"}</strong>
              </article>
            </div>

            <div className="admin-board-list">
              {boardOptions.map((boardId) => (
                <div className="admin-board-chip" key={boardId}>{`Board ${boardId}`}</div>
              ))}
            </div>
          </article>
        </section>

        <section className="admin-card admin-list-card">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Benutzerliste</p>
              <h3>Aktive Accounts</h3>
            </div>
            <button className="secondary-button" onClick={() => void loadAdminData()} type="button">
              {isLoading ? "Lädt…" : "Neu laden"}
            </button>
          </div>

          {userFeedback?.kind === "error" && isLoading ? (
            <p className="form-message error">{userFeedback.message}</p>
          ) : null}

          <div className="admin-user-list">
            {managedUsers.map((user) => (
              <article className="admin-user-row" key={user.id}>
                <div>
                  <strong>{user.username}</strong>
                  <p>
                    {user.role === "admin"
                      ? "Admin · Zugriff auf alle Boards"
                      : user.assignedBoardIds.length > 0
                        ? `Boards: ${user.assignedBoardIds.join(", ")}`
                        : "Keine Boards zugewiesen"}
                  </p>
                </div>
                <span className={`role-badge ${user.role}`}>{user.role}</span>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}