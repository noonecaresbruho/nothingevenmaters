import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiGet, getTicket, setTicket } from "../api/client";

type MeUser = {
  id: number;
  username: string;
  joined_at: string;
  is_admin: number;
};

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const ticket = getTicket();
  const loggedIn = Boolean(ticket);
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    if (!ticket) {
      setUser(null);
      return;
    }
    apiGet<{ ok: boolean; user: MeUser }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, [ticket, location.pathname]);

  function logout() {
    setTicket(null);
    setUser(null);
    navigate("/login");
  }

  const path = location.pathname;
  const isLogin = path === "/login";

  return (
    <div className="appShell">
      <header className="rbxHeader">
        <div className="rbxHeaderInner">
          <div className="rbxHeaderLeft">
            <Link to="/" className="rbxLogo">
              ROBLOX
            </Link>
            <nav className="rbxTopNav">
              <Link to="/">Games</Link>
              <a href="#">Catalog</a>
              <a href="#">Forum</a>
              <a href="#">More</a>
            </nav>
          </div>
          <div className="rbxHeaderRight">
            {loggedIn && user ? (
              <>
                <span className="rbxRobux">0</span>
                <Link to="/profile" className="rbxUsername">
                  {user.username}
                </Link>
                <button type="button" className="rbxLogout" onClick={logout}>
                  Logout
                </button>
              </>
            ) : (
              <Link to="/login" className="rbxSignUp">
                Sign Up / Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {!isLogin && (
        <nav className="rbxSubNav">
          <div className="rbxSubNavInner">
            <Link to="/" className={path === "/" ? "active" : ""}>
              Home
            </Link>
            <Link to="/profile" className={path === "/profile" ? "active" : ""}>
              Profile
            </Link>
            <a href="#">Avatar</a>
            <a href="#">Friends</a>
            <a href="#">Messages</a>
            <a href="#">Create</a>
            {user?.is_admin === 1 ? (
              <Link to="/admin" className={path === "/admin" ? "active" : ""}>
                Admin
              </Link>
            ) : null}
          </div>
        </nav>
      )}

      <main className="rbxContent">{children}</main>

      <footer className="rbxFooter">
        © Roblox Revival • Local development server
      </footer>
    </div>
  );
}
