import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, setTicket } from "../api/client";

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function doLogin() {
    setError(null);
    const resp = await apiPost<any>("/auth/login", { username, password });
    if (!resp.ok) {
      setError(resp.error || "Login failed");
      return;
    }
    setTicket(resp.ticket);
    nav("/");
  }

  async function doRegister() {
    setError(null);
    const resp = await apiPost<any>("/auth/register", { username, password });
    if (!resp.ok) {
      setError(resp.error || "Register failed");
      return;
    }
    await doLogin();
  }

  return (
    <div className="loginPage">
      <div className="loginBox">
        <div className="loginLogo">
          <div className="loginLogoText">ROBLOX</div>
        </div>
        <h1 className="loginTitle">Login</h1>

        {error ? <div className="alert alertError">{error}</div> : null}

        <div className="loginField">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="loginField">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <div className="loginActions">
          <button type="button" className="btn btnPrimary" style={{ width: "100%" }} onClick={doLogin}>
            Login
          </button>
          <button type="button" className="btn btnNeutral" style={{ width: "100%" }} onClick={doRegister}>
            Sign Up
          </button>
        </div>

        <p className="loginHint">Default admin account: admin / admin</p>
      </div>
    </div>
  );
}
