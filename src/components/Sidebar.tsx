// src/components/Sidebar.tsx
import { useEffect, useState } from "react";
import { useApp, Route } from "../context";
import { api } from "../api";
import { LogoMark, NavIcon, MenuToggleIcon, LogoutIcon } from "./icons";
import s from "./Sidebar.module.css";

const ITEMS: { route: Route; label: string | [string, string]; labelText: string }[] = [
  { route: "inicio", label: "Inicio", labelText: "Inicio" },
  { route: "asociados", label: "Asociados", labelText: "Asociados" },
  { route: "cuotas", label: "Cuotas y pagos", labelText: "Cuotas y pagos" },
  { route: "caja", label: "Caja", labelText: "Caja" },
  { route: "reuniones", label: "Reuniones", labelText: "Reuniones" },
  { route: "rendiciones", label: "Rendiciones", labelText: "Rendiciones" },
  { route: "documentacion", label: ["Documentación", "Asambleas"], labelText: "Documentación Asambleas" },
  { route: "comision", label: ["Comisión", "Directiva"], labelText: "Comisión Directiva" },
  { route: "usuarios", label: "Usuarios y respaldo", labelText: "Usuarios y respaldo" },
];

export default function Sidebar() {
  const { usuario, route, navigate, logout, sidebarCollapsed, toggleSidebar, logoCooperadora } = useApp();

  const itemsVisibles = ITEMS.filter((it) => {
    // Superadmin tiene acceso a todo
    if (usuario.rol === "Superadmin") return true;

    // Usuarios y respaldo es exclusivo de Superadmin
    if (it.route === "usuarios") return false;

    // Secretaria: gestión institucional (Asociados, Reuniones, Documentación, Comisión Directiva)
    // NO tiene acceso a finanzas: Caja ni Cuotas y pagos
    if (usuario.rol === "Secretaria") {
      return ["inicio", "asociados", "reuniones", "documentacion", "comision"].includes(it.route);
    }

    // Tesorero: gestión financiera y económica (Cuotas, Caja, Rendiciones, Documentación)
    // NO administra el padrón de asociados ni reuniones institucionales
    if (usuario.rol === "Tesorero") {
      return ["inicio", "cuotas", "caja", "rendiciones", "documentacion"].includes(it.route);
    }

    // Presidente: supervisión y gobierno institucional (Inicio, Asociados [lectura], Caja [lectura], Rendiciones [aprobación], Reuniones, Documentación, Comisión)
    if (usuario.rol === "Presidente") {
      return ["inicio", "asociados", "caja", "reuniones", "rendiciones", "documentacion", "comision"].includes(it.route);
    }

    return true;
  });

  return (
    <aside className={`${s.sidebar} ${sidebarCollapsed ? s.collapsed : ""}`}>
      <div className={s.header}>
        <button
          type="button"
          className={s.brandBtn}
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
          aria-label={sidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
        >
          <span className={s.brandIcon}>
            {logoCooperadora ? (
              <img
                src={logoCooperadora}
                alt="Logo Cooperar"
                className={s.brandLogoImg}
              />
            ) : (
              <LogoMark size={32} color="#fff" />
            )}
          </span>
          {!sidebarCollapsed && <span className={s.brandText}>Cooperar</span>}
        </button>
      </div>

      <nav className={s.nav}>
        {itemsVisibles.map((it) => (
          <button
            key={it.route}
            type="button"
            className={`${s.item} ${route === it.route ? s.active : ""}`}
            aria-current={route === it.route ? "page" : undefined}
            onClick={() => navigate(it.route)}
            title={sidebarCollapsed ? it.labelText : undefined}
          >
            <span className={s.itemIcon}>
              <NavIcon route={it.route} />
            </span>
            {!sidebarCollapsed && (
              <span className={s.itemLabel}>
                {Array.isArray(it.label) ? (
                  <>
                    <span>{it.label[0]}</span>
                    <span>{it.label[1]}</span>
                  </>
                ) : (
                  it.label
                )}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className={s.spacer} />

      <div className={s.footer}>
        {!sidebarCollapsed ? (
          <>
            <div className={s.user}>
              <p className={s.name}>{usuario.nombre}</p>
              <p className={s.role}>{usuario.rol}</p>
            </div>
            <button type="button" className={s.logout} onClick={logout}>
              Cerrar sesión
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${s.item} ${s.logoutCollapsed}`}
            onClick={logout}
            title={`Cerrar sesión (${usuario.nombre} - ${usuario.rol})`}
            aria-label="Cerrar sesión"
          >
            <span className={s.itemIcon}>
              <LogoutIcon size={20} />
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}