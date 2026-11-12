import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

type User = {
  id: number;
  username: string;
  joined_at: string;
  is_admin: number;
  avatar_slots_json?: string;
};

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: boolean; user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  if (error) return <div className="alert alertError">{error}</div>;
  if (!user) return <div className="muted">Loading profile…</div>;

  let slots: { name?: string }[] = [];
  try {
    slots = user.avatar_slots_json ? JSON.parse(user.avatar_slots_json) : [];
  } catch {
    slots = [];
  }

  const joined = new Date(user.joined_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <div className="pageHeader">
        <h1 className="h1">Profile</h1>
      </div>

      <div className="profileLayout">
        <div className="profileAvatar">Avatar</div>

        <div className="profileMain">
          <h2 className="profileUsername">{user.username}</h2>

          <div className="profileStats">
            <span className="profileStat">
              <strong>0</strong> Friends
            </span>
            <span className="profileStat">
              <strong>0</strong> Followers
            </span>
            <span className="profileStat">
              <strong>0</strong> Following
            </span>
            <span className="profileStat">
              <strong>R$ 0</strong>
            </span>
          </div>

          <div className="profileMeta">
            <div>Member since {joined}</div>
            <div>User ID: {user.id}</div>
            {user.is_admin === 1 ? <div>Account: Administrator</div> : null}
          </div>
        </div>
      </div>

      <div className="profileSection">
        <div className="profileSectionHeader">Avatar Outfit Slots</div>
        <div className="profileSectionBody">
          <div className="slotGrid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="slot">
                <div className="slotLabel">Slot {i + 1}</div>
                <div className="slotValue">{slots[i]?.name || "Empty"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
