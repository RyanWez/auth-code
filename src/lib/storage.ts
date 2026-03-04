/**
 * Encrypted storage using Web Crypto API (AES-GCM)
 * Stores OTP accounts in localStorage with AES-256-GCM encryption.
 */

import type { OTPAccount } from './migration';

const STORAGE_KEY = 'auth_vault_accounts';
const SALT = 'auth-vault-pbkdf2-salt-v1';
const PASSPHRASE = 'auth-vault-encryption-key-2024';

let cachedKey: CryptoKey | null = null;

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return cachedKey;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Combine IV (12 bytes) + ciphertext
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return uint8ToBase64(combined);
}

async function decrypt(data: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = base64ToUint8(data);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export async function saveAccounts(accounts: OTPAccount[]): Promise<void> {
  try {
    const json = JSON.stringify(accounts);
    const encrypted = await encrypt(json);
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (e) {
    console.error('Failed to save accounts:', e);
  }
}

export async function loadAccounts(): Promise<OTPAccount[]> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const json = await decrypt(data);
    const accounts = JSON.parse(json);
    if (Array.isArray(accounts)) return accounts;
    return [];
  } catch (e) {
    console.error('Failed to load accounts:', e);
    // If decryption fails, try parsing as plain JSON (migration from unencrypted)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const accounts = JSON.parse(raw);
        if (Array.isArray(accounts)) {
          await saveAccounts(accounts); // Re-encrypt
          return accounts;
        }
      }
    } catch { /* ignore */ }
    return [];
  }
}

// ── Supabase Shared Storage ──────────────────────────────────────────────────
// All OTP accounts are shared: Super Admin writes, all users read.

import { supabase } from './supabase';

const SHARED_CACHE_KEY = 'auth_vault_shared_cache';

/** Instantly load cached accounts from localStorage (synchronous, no network) */
export function getCachedAccounts(): OTPAccount[] {
  try {
    const raw = localStorage.getItem(SHARED_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

function cacheAccounts(accounts: OTPAccount[]) {
  try {
    localStorage.setItem(SHARED_CACHE_KEY, JSON.stringify(accounts));
  } catch { /* ignore */ }
}

export function clearAccountsCache() {
  localStorage.removeItem(SHARED_CACHE_KEY);
}

export async function saveSharedAccounts(accounts: OTPAccount[]): Promise<boolean> {
  try {
    const json = JSON.stringify(accounts);
    const encrypted = await encrypt(json);

    // Cache locally for instant loading next time
    cacheAccounts(accounts);

    const { error } = await supabase
      .from('shared_accounts')
      .upsert(
        {
          id: 'global',
          accounts_data: encrypted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('[Auth Vault] Supabase save failed:', error.message, error.details, error.hint);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Auth Vault] Supabase save exception:', e);
    return false;
  }
}

export async function loadSharedAccounts(): Promise<OTPAccount[]> {
  try {
    const { data, error } = await supabase
      .from('shared_accounts')
      .select('accounts_data')
      .eq('id', 'global')
      .single();

    if (error) {
      console.error('[Auth Vault] Supabase load failed:', error.message, error.details, error.hint);
      return getCachedAccounts(); // Fallback to cache on error
    }

    if (!data?.accounts_data) {
      console.warn('[Auth Vault] No shared accounts data found in Supabase');
      return [];
    }

    const json = await decrypt(data.accounts_data);
    const accounts = JSON.parse(json);
    if (Array.isArray(accounts)) {
      cacheAccounts(accounts); // Update cache with fresh data
      return accounts;
    }
    return [];
  } catch (e) {
    console.error('[Auth Vault] Supabase load exception:', e);
    return getCachedAccounts(); // Fallback to cache on error
  }
}

/**
 * Subscribe to real-time changes on shared_accounts table.
 * Returns an unsubscribe function.
 */
export function subscribeToSharedAccounts(
  onUpdate: (accounts: OTPAccount[]) => void
): () => void {
  const channel = supabase
    .channel('shared-accounts-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_accounts',
        filter: 'id=eq.global',
      },
      async (payload) => {
        const accountsData = (payload.new as { accounts_data?: string })?.accounts_data;
        if (!accountsData) return;

        try {
          const json = await decrypt(accountsData);
          const accounts = JSON.parse(json);
          if (Array.isArray(accounts)) {
            onUpdate(accounts);
          }
        } catch (e) {
          console.error('Failed to decrypt realtime update:', e);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}


