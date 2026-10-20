// src/context.ts
import { createContext, useContext } from "react";
import type { Usuario } from "./api";

export type Route = "inicio" | "asociados" | "cuotas" | "caja" | "reuniones" | "rendiciones" | "documentacion" | "comision" | "usuarios";

export interface AppCtx {
  usuario: Usuario;
  route: Route;
  navigate: (r: Route) => void;
  logout: () => void;
}

export const AppContext = createContext<AppCtx | null>(null);
export const useApp = () => useContext(AppContext)!;