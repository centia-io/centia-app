import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getCodeFlow, getClaims, initClient } from '../baas/client';

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
    // The callback page performs the code exchange itself
    if (window.location.pathname === `${import.meta.env.VITE_BASE_PATH || '/'}callback`) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // Validates stored tokens and refreshes an expired access token;
        // throws (and clears tokens) when the refresh token has expired.
        // A bare presence check (getStatus().isAuth()) would treat stale
        // tokens as a valid login and let the first API call fail.
        const authed = await getCodeFlow().redirectHandle();
        setIsAuth(authed);
        if (authed) {
          setUser(getClaims().get());
        }
      } catch {
        getCodeFlow().clear();
      }
      setLoading(false);
    })();
  }, []);

  const signIn = useCallback(() => {
    getCodeFlow().signIn();
  }, []);

  const signOut = useCallback(() => {
    getCodeFlow().signOut();
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
