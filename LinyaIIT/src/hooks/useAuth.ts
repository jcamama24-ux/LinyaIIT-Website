import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { StaffProfile } from '../types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  staffProfile: StaffProfile | null;
  loading: boolean;
  isAuthorizedStaff: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadStaffProfile = useCallback(async (userId: string | undefined) => {
    if (!supabase || !userId) {
      setStaffProfile(null);
      return;
    }

    const { data, error: profileError } = await supabase
      .from('staff_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setStaffProfile(null);
      return;
    }

    setStaffProfile((data as StaffProfile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await loadStaffProfile(data.session?.user?.id);
        if (active) setLoading(false);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadStaffProfile(nextSession?.user?.id).finally(() => {
        setLoading(false);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadStaffProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      throw new Error(signInError.message);
    }

    await loadStaffProfile(data.user?.id);
  }, [loadStaffProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setStaffProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadStaffProfile(session?.user?.id);
  }, [loadStaffProfile, session?.user?.id]);

  return {
    session,
    user: session?.user ?? null,
    staffProfile,
    loading,
    isAuthorizedStaff: Boolean(session?.user && staffProfile),
    error,
    signIn,
    signOut,
    refreshProfile,
  };
}
