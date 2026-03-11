import type { CreateUserPayload, ManagedUser, UpdateUserPayload, UserRole } from "@/lib/types";

export type UserRoleFilter = "all" | UserRole;
export type UserAccountTypeFilter = "all" | "local" | "oauth";

type UserPayload = Pick<CreateUserPayload, "username" | "role" | "assignedBoardIds">;

export const DEFAULT_CREATE_USER_FORM: CreateUserPayload = {
  username: "",
  password: "",
  role: "user",
  assignedBoardIds: [],
};

export function sortNumericStrings(values: string[]): string[] {
  return [...values].sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);

    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return leftNumber - rightNumber;
    }

    return left.localeCompare(right);
  });
}

export function normalizeBoardIds(boardIds: string[]): string[] {
  return sortNumericStrings([...new Set(boardIds.map((boardId) => boardId.trim()).filter(Boolean))]);
}

export function sanitizeAssignedBoardIds(role: UserRole, assignedBoardIds: string[]): string[] {
  return role === "admin" ? [] : normalizeBoardIds(assignedBoardIds);
}

export function toggleStringSelection(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function filterExistingSelections(values: string[], validOptions: string[]): string[] {
  return values.filter((value) => validOptions.includes(value));
}

export function mergeSelectableOptions(options: string[], previous: string[] | null, known: string[]): string[] {
  if (previous === null || (previous.length === 0 && known.length === 0)) {
    return options;
  }

  const previousSet = new Set(previous);
  return options.filter((option) => previousSet.has(option) || !known.includes(option));
}

export function buildUserPayload<TPayload extends UserPayload>(payload: TPayload): TPayload {
  return {
    ...payload,
    username: payload.username.trim(),
    assignedBoardIds: sanitizeAssignedBoardIds(payload.role, payload.assignedBoardIds),
  };
}

export function filterManagedUsers(
  users: ManagedUser[],
  {
    searchQuery,
    roleFilter,
    accountTypeFilter,
  }: { searchQuery: string; roleFilter: UserRoleFilter; accountTypeFilter: UserAccountTypeFilter },
): ManagedUser[] {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return users.filter((user) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      user.username.toLowerCase().includes(normalizedSearch) ||
      user.assignedBoardIds.some((boardId) => boardId.toLowerCase().includes(normalizedSearch)) ||
      (user.oauth_provider ?? "").toLowerCase().includes(normalizedSearch);

    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesAccountType = accountTypeFilter === "all" || user.auth_type === accountTypeFilter;

    return matchesSearch && matchesRole && matchesAccountType;
  });
}

export function getManagedUserStats(users: ManagedUser[]) {
  return {
    admins: users.filter((user) => user.role === "admin").length,
    local: users.filter((user) => user.auth_type === "local").length,
    oauth: users.filter((user) => user.auth_type === "oauth").length,
  };
}

export function toCreateUserPayload(payload: CreateUserPayload): CreateUserPayload {
  return {
    ...buildUserPayload(payload),
    password: payload.password,
  };
}

export function toUpdateUserPayload(payload: UpdateUserPayload): UpdateUserPayload {
  return buildUserPayload(payload);
}