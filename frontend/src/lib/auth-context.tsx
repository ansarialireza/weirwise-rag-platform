"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@/types";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    try {
      // First attempt: try getMe directly (handles memory token or valid access_token cookie)
      const u = await api.getMe();
      setUser(u);
    } catch {
      // Second attempt: if initial fetch failed (e.g. access token expired but 30-day refresh cookie is present), attempt token refresh
      try {
        const refreshedToken = await api.refreshToken();
        if (refreshedToken) {
          const u = await api.getMe();
          setUser(u);
          return;
        }
      } catch {
        // Fall-through to null state
      }
      setUser(null);
      api.setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (token: string, loggedInUser: User) => {
    api.setToken(token);
    setUser(loggedInUser);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignored
    } finally {
      setUser(null);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
