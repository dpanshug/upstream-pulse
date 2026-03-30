import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface UserIdentity {
  username: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
}

interface AuthState {
  user: UserIdentity | null;
  isLoading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAdmin: false,
});

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: UserIdentity | null) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin: user?.isAdmin ?? false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
