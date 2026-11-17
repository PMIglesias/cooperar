// src/context.ts
import { createContext, useContext } from "react";
import type { Usuario } from "./api";

export type Route = "inicio" | "asociados" | "cuotas" | "caja" | "reuniones" | "actas" | "rendiciones" | "documentacion" | "comision" | "usuarios" | "historial" | "perfil";

export interface AppCtx {
  usuario: Usuario;
  route: Route;
  navigate: (r: Route) => void;
  setUsuario: (u: Usuario) => void;
  logout: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  logoCooperadora: string;
  setLogoCooperadora: (logo: string) => void;
}

export const AppContext = createContext<AppCtx | null>(null);
export const useApp = () => useContext(AppContext)!;