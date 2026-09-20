"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type User = {
  id: string;
  email: string;
  name: string;
};

type Org = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  organizations: Org[];
  activeOrg: Org | null;
  loading: boolean;
  setActiveOrg: (org: Org) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [activeOrg, setActiveOrgState] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/organizations");
      if (!res.ok) return;
      const data = await res.json();
      const orgs = data.items ?? data ?? [];
      setOrganizations(orgs);

      // Restore active org from localStorage
      const savedSlug = localStorage.getItem("activeOrgSlug");
      const saved = orgs.find((o: Org) => o.slug === savedSlug);
      if (saved) {
        setActiveOrgState(saved);
      } else if (orgs.length > 0) {
        setActiveOrgState(orgs[0]);
        localStorage.setItem("activeOrgSlug", orgs[0].slug);
      }
    } catch {
      // not logged in or error
    }
  }, []);

  const setActiveOrg = useCallback((org: Org) => {
    setActiveOrgState(org);
    localStorage.setItem("activeOrgSlug", org.slug);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    (async () => {
      await fetchUser();
      await fetchOrganizations();
      setLoading(false);
    })();
  }, [fetchUser, fetchOrganizations]);

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        activeOrg,
        loading,
        setActiveOrg,
        refresh: async () => {
          await fetchUser();
          await fetchOrganizations();
        },
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
