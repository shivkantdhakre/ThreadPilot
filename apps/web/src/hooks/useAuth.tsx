'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../lib/api-client';

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, workspaceName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!apiClient.token) {
      const refreshedToken = await apiClient.refreshToken();
      if (!refreshedToken) {
        setUser(null);
        setWorkspace(null);
        setWorkspaces([]);
        setLoading(false);
        return;
      }
    }


    try {
      const data = await apiClient.get<any>('/auth/me');
      setUser(data.user);
      const wsList: Workspace[] = Array.isArray(data.workspaces) ? data.workspaces : [];
      setWorkspaces(wsList);

      const savedWsId = apiClient.workspaceId;
      const currentWs =
        wsList.find((w) => w.id === savedWsId) || wsList[0] || null;

      if (currentWs) {
        setWorkspace(currentWs);
        apiClient.workspaceId = currentWs.id;
      }
    } catch {
      setUser(null);
      setWorkspace(null);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<any>(
      '/auth/login',
      { email, password },
      { skipAuth: true },
    );
    apiClient.token = res.accessToken;
    setUser(res.user);

    let wsList: Workspace[] = Array.isArray(res.workspaces) ? res.workspaces : [];
    if (wsList.length === 0 && res.user?.workspaceId) {
      wsList = [
        {
          id: res.user.workspaceId,
          name: res.user.workspaceName || 'Personal Workspace',
          slug: 'default',
          role: 'OWNER',
        },
      ];
    }

    setWorkspaces(wsList);
    if (wsList[0]) {
      setWorkspace(wsList[0]);
      apiClient.workspaceId = wsList[0].id;
    }
  };

  const register = async (email: string, password: string, workspaceName: string) => {
    const res = await apiClient.post<any>(
      '/auth/register',
      { email, password, name: workspaceName, workspaceName },
      { skipAuth: true },
    );
    apiClient.token = res.accessToken;
    setUser(res.user);

    let ws: Workspace =
      res.workspace || (Array.isArray(res.workspaces) && res.workspaces[0]);
    if (!ws && res.user?.workspaceId) {
      ws = {
        id: res.user.workspaceId,
        name: res.user.workspaceName || workspaceName,
        slug: 'default',
        role: 'OWNER',
      };
    }

    const wsList =
      Array.isArray(res.workspaces) && res.workspaces.length > 0
        ? res.workspaces
        : ws
          ? [ws]
          : [];
    setWorkspaces(wsList);
    if (ws) {
      setWorkspace(ws);
      apiClient.workspaceId = ws.id;
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {}
    apiClient.token = null;
    apiClient.workspaceId = null;
    setUser(null);
    setWorkspace(null);
    setWorkspaces([]);
    window.location.href = '/login';
  };

  const switchWorkspace = (workspaceId: string) => {
    const target = workspaces.find((w) => w.id === workspaceId);
    if (target) {
      setWorkspace(target);
      apiClient.workspaceId = target.id;
      window.location.reload();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        workspaces,
        loading,
        login,
        register,
        logout,
        switchWorkspace,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
