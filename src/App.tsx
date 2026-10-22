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
import Documentacion from "./pages/Documentacion";
import ComisionDirectiva from "./pages/ComisionDirectiva";
import Usuarios from "./pages/Usuarios";

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [route, setRoute] = useState<Route>("inicio");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("cooperar_sidebar_collapsed") === "true";
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("cooperar_sidebar_collapsed", String(next));
      return next;
    });
  };

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
  else if (route === "documentacion") page = <Documentacion />;
  else if (route === "comision") page = <ComisionDirectiva />;
  else if (route === "usuarios" && usuario.rol === "Superadmin") page = <Usuarios />;
  else page = <Dashboard />;

  return (
    <AppContext.Provider
      value={{
        usuario,
        route,
        navigate: setRoute,
        logout,
        sidebarCollapsed,
        toggleSidebar,
      }}
    >
      {page}
    </AppContext.Provider>
  );
}