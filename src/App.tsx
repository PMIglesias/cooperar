// src/App.tsx
import { useState } from "react";
import { api, Usuario } from "./api";
import { AppContext, Route } from "./context";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Asociados from "./pages/Asociados";
import Cuotas from "./pages/Cuotas";
import Caja from "./pages/Caja";
import Reuniones from "./pages/Reuniones";
import Rendiciones from "./pages/Rendiciones";
import Usuarios from "./pages/Usuarios";

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [route, setRoute] = useState<Route>("inicio");

  if (!usuario) return <Login onLogin={setUsuario} />;

  const logout = () => {
    api.logout().finally(() => { setUsuario(null); setRoute("inicio"); });
  };

  let page;
  if (route === "inicio") page = <Dashboard />;
  else if (route === "asociados") page = <Asociados />;
  else if (route === "cuotas") page = <Cuotas />;
  else if (route === "caja") page = <Caja />;
  else if (route === "reuniones") page = <Reuniones />;
  else if (route === "rendiciones") page = <Rendiciones />;
  else if (route === "usuarios") page = <Usuarios />;
  else page = <Dashboard />;

  return (
    <AppContext.Provider value={{ usuario, route, navigate: setRoute, logout }}>
      {page}
    </AppContext.Provider>
  );
}