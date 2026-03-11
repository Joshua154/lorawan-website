"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setErrorMessage(payload.message ?? "Login failed.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setErrorMessage("The server is currently unavailable.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        <span>Username</span>
        <input
          autoComplete="username"
          onChange={(event) => setUsername(event.target.value)}
          required
          type="text"
          value={username}
        />
      </label>

      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}