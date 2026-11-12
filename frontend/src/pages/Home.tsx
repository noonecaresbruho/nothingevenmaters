import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";

type Game = {
  id: number;
  name: string;
  description: string;
  thumbnail_asset_id: string | null;
  maintenance_enabled: number;
  place_id: number | null;
};

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: boolean; games: Game[] }>("/api/games")
      .then((r) => setGames(r.games || []))
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  return (
    <div>
      <div className="pageHeader">
        <h1 className="h1">Games</h1>
      </div>

      {error ? <div className="alert alertError">{error}</div> : null}

      <h2 className="gamesSectionTitle">Popular</h2>

      <div className="gameCards">
        {games.map((g) => (
          <div key={g.id} className="gameCard">
            <div className="gameCardContainer">
              <div className="gameCardThumb">
                {g.thumbnail_asset_id ? (
                  <img
                    src={`http://localhost:3001/asset/?id=${encodeURIComponent(g.thumbnail_asset_id)}`}
                    alt=""
                  />
                ) : (
                  <div className="gameCardThumbPlaceholder">No Thumbnail</div>
                )}
              </div>
              <div className="gameCardInfo">
                <div className="gameCardTitle">
                  <Link to={`/games/${g.id}`}>{g.name}</Link>
                </div>
                <div className="gameCardCreator">by Revival</div>
                <div className="gameCardPlayers">0 Playing</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {games.length === 0 && !error ? (
        <p className="muted">No games yet. Use the Admin panel to upload one.</p>
      ) : null}
    </div>
  );
}
