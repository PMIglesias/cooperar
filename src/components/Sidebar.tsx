// src/components/Sidebar.tsx
import { useApp, Route } from "../context";
import { LogoMark, NavIcon } from "./icons";
import s from "./Sidebar.module.css";

const ITEMS: { route: Route; label: string }[] = [
  { route: "inicio", label: "Inicio" },
  { route: "asociados", label: "Asociados" },
  { route: "cuotas", label: "Cuotas y pagos" },
  { route: "caja", label: "Caja" },
  { route: "reuniones", label: "Reuniones" },
  { route: "rendiciones", label: "Rendiciones" },
  { route: "usuarios", label: "Usuarios y respaldo" },
];

export default function Sidebar() {
  const { usuario, route, navigate, logout } = useApp();
  return (
    <aside className={s.sidebar}>
      <div className={s.brand}>
        <LogoMark size={36} color="#fff" />
        <span>Cooperar</span>
      </div>
      <nav className={s.nav}>
        {ITEMS.map((it) => (
          <button
            key={it.route}
            type="button"
            className={`${s.item} ${route === it.route ? s.active : ""}`}
            aria-current={route === it.route ? "page" : undefined}
            onClick={() => navigate(it.route)}
          >
            <NavIcon />
            {it.label}
          </button>
        ))}
      </nav>
      <div className={s.spacer} />
      <div className={s.user}>
        <p className={s.name}>{usuario.nombre}</p>
        <p className={s.role}>{usuario.rol}</p>
      </div>
      <button type="button" className={s.logout} onClick={logout}>Cerrar sesión</button>
    </aside>
  );
}