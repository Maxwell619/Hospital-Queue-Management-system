import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api/client';
import { authStorage } from '../api/authStorage';

const AuthContext = createContext(null);

function readStoredUser() {
  const raw = authStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  const login = useCallback(async (staffType, username, password) => {
    // api.post's `auth: true` default is fine here even though we don't
    // have a token yet -- there's just nothing in storage to attach.
    const result = await api.post('/api/auth/login', { staffType, username, password });
    const loggedInUser = { id: result.id, staffType: result.staffType, name: result.name };

    authStorage.setItem('token', result.token);
    authStorage.setItem('user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);

    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    authStorage.removeItem('token');
    authStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
