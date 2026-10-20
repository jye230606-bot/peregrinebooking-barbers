"use client";

import { createContext, useContext } from "react";
import type { TenantConfig } from "@/config/tenant";

/**
 * The shop's config in force, loaded on the server (services, hours, closures
 * and rules as Vance has them in the console) and handed down to the client
 * components that offer days and times, so they offer exactly what the server
 * will accept.
 */

const TenantContext = createContext<TenantConfig | null>(null);

export function TenantProvider({ value, children }: { value: TenantConfig; children: React.ReactNode }) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantConfig {
  const cfg = useContext(TenantContext);
  if (!cfg) throw new Error("useTenant() outside a TenantProvider");
  return cfg;
}
