import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, getTicket } from "../api/client";

type User = { id: number; username: string; joined_at: string; is_admin: number };
type Game = {
  id: number;
  name: string;
  description: string;
  thumbnail_asset_id: string | null;
  maintenance_enabled: number;
  place_id: number | null;
};

export default function Admin() {
  const ticket = getTicket();
  const [me, setMe] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [maintenance, setMaintenance] = useState<boolean>(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [newGameName, setNewGameName] = useState("");
  const [newGameDesc, setNewGameDesc] = useState("");

  const [rccExePath, setRccExePath] = useState("");
  const [gameserverJsonPath, setGameserverJsonPath] = useState("");

  const adminBlocked = useMemo(() => !ticket, [ticket]);

  useEffect(() => {
    if (!ticket) return;
    apiGet<any>("/auth/me")
      .then((r) => setMe(r.user))
      .catch((e) => setError(String(e?.message || e)));
  }, [ticket]);

  async function refreshAll() {
    if (!ticket) return;
    setError(null);
    const [u, g, m, s] = await Promise.all([
      apiGet<any>("/admin/users"),
      apiGet<any>("/api/games"),
      apiGet<any>("/admin/maintenance"),
      apiGet<any>("/admin/server-status"),
    ]);
    setUsers(u.users || []);
    setGames(g.games || []);
    setMaintenance(Boolean(m.enabled));
    setStatus(s.rcc);
  }

  useEffect(() => {
    if (!ticket) return;
    refreshAll().catch((e) => setError(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  if (adminBlocked) {
    return <div className="alert alertError">Login required.</div>;
  }
  if (me && me.is_admin !== 1) {
    return <div className="alert alertError">Admin panel is only visible to is_admin=1 users.</div>;
  }

  async function createGame() {
    const r = await apiPost<any>("/admin/games", { name: newGameName, description: newGameDesc });
    if (!r.ok) throw new Error(r.error || "Failed to create game");
    setNewGameName("");
    setNewGameDesc("");
    await refreshAll();
  }

  async function toggleMaintenance() {
    const r = await apiPost<any>("/admin/maintenance", { enabled: !maintenance });
    if (!r.ok) throw new Error(r.error || "Failed to toggle maintenance");
    setMaintenance(Boolean(r.enabled));
  }

  async function startRcc() {
    const r = await apiPost<any>("/admin/rcc/start", { rccExePath, gameserverJsonPath });
    if (!r.ok) throw new Error(r.error || "Failed to start RCC");
    await refreshAll();
  }

  async function stopRcc() {
    const r = await apiPost<any>("/admin/rcc/stop", {});
    if (!r.ok) throw new Error(r.error || "Failed to stop RCC");
    await refreshAll();
  }

  async function uploadPlace(gameId: number, file: File) {
    const url = new URL("http://localhost:3001/admin/games/" + gameId + "/upload-place");
    url.searchParams.set("ticket", ticket!);
    const form = new FormData();
    form.append("place", file);
    const res = await fetch(url.toString(), { method: "POST", body: form });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Upload failed");
    await refreshAll();
  }

  return (
    <div>
      <div className="pageHeader">
        <h1 className="h1">Admin Panel</h1>
        <div className="row">
          <button className="btn btnSecondary" onClick={() => refreshAll().catch((e) => setError(String(e)))}>
            Refresh
          </button>
          <button className="btn btnPrimary" onClick={() => toggleMaintenance().catch((e) => setError(String(e)))}>
            Maintenance: {maintenance ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {error ? <div className="alert alertError">{error}</div> : null}

      <div className="adminGrid">
        <div className="card">
          <div className="cardBody">
            <div className="cardTitle">Upload .rbxl Place</div>
            <p className="muted small">Attach a place to an existing game row below.</p>
            <div className="muted small">After uploading, RCCService will fetch via `PlaceFetchUrl`.</div>
          </div>
        </div>

        <div className="card">
          <div className="cardBody">
            <div className="cardTitle">Create Game</div>
            <label className="label">
              Name
              <input className="input" value={newGameName} onChange={(e) => setNewGameName(e.target.value)} />
            </label>
            <label className="label">
              Description
              <textarea className="input" value={newGameDesc} onChange={(e) => setNewGameDesc(e.target.value)} />
            </label>
            <button className="btn btnPrimary" onClick={() => createGame().catch((e) => setError(String(e)))}>
              Create
            </button>
          </div>
        </div>

        <div className="card">
          <div className="cardBody">
            <div className="cardTitle">RCCService</div>
            <label className="label">
              RCCService.exe path
              <input className="input" value={rccExePath} onChange={(e) => setRccExePath(e.target.value)} />
            </label>
            <label className="label">
              gameserver.json path
              <input className="input" value={gameserverJsonPath} onChange={(e) => setGameserverJsonPath(e.target.value)} />
            </label>
            <div className="row">
              <button className="btn btnPrimary" onClick={() => startRcc().catch((e) => setError(String(e)))}>
                Start
              </button>
              <button className="btn btnSecondary" onClick={() => stopRcc().catch((e) => setError(String(e)))}>
                Stop
              </button>
            </div>
            <div className="muted small">Running: {status?.running ? "Yes" : "No"}</div>
            <div className="muted small">PID: {status?.pid ?? "-"}</div>
          </div>
        </div>
      </div>

      <h2 className="h2">Games</h2>
      <div className="table">
        <div className="tr th">
          <div>ID</div>
          <div>Name</div>
          <div>PlaceId</div>
          <div>Upload</div>
        </div>
        {games.map((g) => (
          <div className="tr" key={g.id}>
            <div>{g.id}</div>
            <div>{g.name}</div>
            <div>{g.place_id ?? "-"}</div>
            <div>
              <input
                type="file"
                accept=".rbxl,.rbxm,.xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  uploadPlace(g.id, f).catch((err) => setError(String(err?.message || err)));
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <h2 className="h2">Users</h2>
      <div className="table">
        <div className="tr th">
          <div>ID</div>
          <div>Username</div>
          <div>Joined</div>
          <div>Admin</div>
        </div>
        {users.map((u) => (
          <div className="tr" key={u.id}>
            <div>{u.id}</div>
            <div>{u.username}</div>
            <div>{new Date(u.joined_at).toLocaleDateString()}</div>
            <div>{u.is_admin === 1 ? "Yes" : "No"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

