const BACKEND = "http://localhost:3001";

export type LoginResponse = {
  ok: boolean;
  user?: { id: number; username: string; joined_at: string; is_admin: number };
  ticket?: string;
  error?: string;
};

export function getTicket(): string | null {
  return localStorage.getItem("auth_ticket");
}

export function setTicket(t: string | null) {
  if (!t) localStorage.removeItem("auth_ticket");
  else localStorage.setItem("auth_ticket", t);
}

export async function apiGet<T>(path: string): Promise<T> {
  const ticket = getTicket();
  const url = new URL(BACKEND + path);
  if (ticket) url.searchParams.set("ticket", ticket);
  const res = await fetch(url.toString());
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const ticket = getTicket();
  const url = new URL(BACKEND + path);
  if (ticket) url.searchParams.set("ticket", ticket);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return (await res.json()) as T;
}

