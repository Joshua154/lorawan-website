type RoleBadgeProps = {
  className?: string;
  label: string;
  role: "admin" | "user";
};

export function RoleBadge({ className, label, role }: RoleBadgeProps) {
  return <span className={`role-badge ${role}${className ? ` ${className}` : ""}`}>{label}</span>;
}