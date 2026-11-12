import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import GameDetail from "./pages/GameDetail";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/games/:id" element={<GameDetail />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

