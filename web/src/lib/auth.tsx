"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { pb } from "./pb";
import type { Bootstrap } from "./types";

interface AuthState {
  loading: boolean;
  user: Bootstrap["user"] | null;
  employee: Bootstrap["employee"];
  company: Bootstrap["company"];
  locations: Bootstrap["locations"];
  isManager: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    employee: null,
    company: null,
    locations: [],
    isManager: false,
  });

  const refresh = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setState((s) => ({ ...s, loading: false, user: null }));
      return;
    }
    try {
      const data = await pb.send<Bootstrap>("/api/openroster/bootstrap", {
        method: "GET",
      });
      setState({
        loading: false,
        user: data.user,
        employee: data.employee,
        company: data.company,
        locations: data.locations || [],
        isManager: !!data.is_manager,
      });
    } catch {
      pb.authStore.clear();
      setState({
        loading: false,
        user: null,
        employee: null,
        company: null,
        locations: [],
        isManager: false,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await pb.collection("users").authWithPassword(email.trim(), password);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(() => {
    pb.authStore.clear();
    setState({
      loading: false,
      user: null,
      employee: null,
      company: null,
      locations: [],
      isManager: false,
    });
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refresh }),
    [state, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
