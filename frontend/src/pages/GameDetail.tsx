import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "../api/client";

type Game = {
  id: number;
  name: string;
  description: string;
  thumbnail_asset_id: string | null;
  maintenance_enabled: number;
  place_id: number | null;
};

export default function GameDetail() {
  const { id } = useParams();
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: boolean; game: Game }>(`/api/games/${id}`)
      .then((r) => setGame(r.game))
      .catch((e) => setError(String(e?.message || e)));
  }, [id]);

  if (error) return <div className="alert alertError">{error}</div>;
  if (!game) return <div className="muted">Loading…</div>;

  const joinUrl = new URL("http://localhost:3001/Game/Join.ashx");
  joinUrl.searchParams.set("placeId", String(game.place_id || game.id));

  return (
    <div className="detailGrid">
      <div className="card">
        <div className="cardBody">
          <h1 className="h1">{game.name}</h1>
          <p className="cardDesc">{game.description || "No description."}</p>
          <div className="row">
            <a className="btn btnPrimary" href={joinUrl.toString()} target="_blank" rel="noreferrer">
              Get Join Script (debug)
            </a>
          </div>
          <p className="muted small">
            Joining is done by the legacy client using its patched BaseUrl/asset endpoints; the link above is mainly for
            debugging JSON output.
          </p>
        </div>
      </div>
      <div className="card">
        <div className="thumbLarge">
          {game.thumbnail_asset_id ? (
            <img src={`http://localhost:3001/asset/?id=${encodeURIComponent(game.thumbnail_asset_id)}`} alt="" />
          ) : (
            <div className="thumbPlaceholder">Thumbnail</div>
          )}
        </div>
      </div>
    </div>
  );
}

