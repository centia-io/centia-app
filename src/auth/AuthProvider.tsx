import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getCodeFlow, getStatus, getClaims, initClient } from '../baas/client';

interface AuthState {
  isAuth: boolean;
  loading: boolean;
  user: Record<string, unknown> | null;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  isAuth: false,
  loading: true,
  user: null,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    initClient();
    try {
      const authed = getStatus().isAuth();
      setIsAuth(authed);
      if (authed) {
        setUser(getClaims().get());
      }
    } catch {
      // not authenticated
    }
    setLoading(false);
  }, []);

  const signIn = useCallback(() => {
    getCodeFlow().signIn();
  }, []);

  const signOut = useCallback(() => {
    getCodeFlow().signOut();
    setIsAuth(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuth, loading, user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
