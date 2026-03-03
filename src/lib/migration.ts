/**
 * Google Authenticator Migration Decoder
 * 
 * Implements protobuf wire format decoding for the Google Authenticator
 * migration/export format (otpauth-migration:// URLs).
 * 
 * Protobuf schema:
 *   message MigrationPayload {
 *     repeated OtpParameters otp_parameters = 1;
 *     int32 version = 2;
 *     int32 batch_size = 3;
 *     int32 batch_index = 4;
 *     int32 batch_id = 5;
 *   }
 *   message OtpParameters {
 *     bytes secret = 1;
 *     string name = 2;
 *     string issuer = 3;
 *     Algorithm algorithm = 4;
 *     DigitCount digits = 5;
 *     OtpType type = 6;
 *     int64 counter = 7;
 *   }
 */

import * as OTPAuth from 'otpauth';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OTPAccount {
  id: string;
  name: string;
  issuer: string;
  secretBase32: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  type: 'totp' | 'hotp';
  counter: number;
  period: number;
}

export type NewAccount = Omit<OTPAccount, 'id'>;

// ── Protobuf Wire Format Decoder ─────────────────────────────────────────────

function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;

  while (pos < data.length) {
    const byte = data[pos++];
    result |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7;
    if (shift > 35) throw new Error('Varint overflow');
  }

  return [result >>> 0, pos];
}

function readLengthDelimited(data: Uint8Array, offset: number): [Uint8Array, number] {
  const [length, pos] = readVarint(data, offset);
  if (pos + length > data.length) throw new Error('Length-delimited field exceeds data bounds');
  return [data.slice(pos, pos + length), pos + length];
}

interface ProtoField {
  fieldNumber: number;
  wireType: number;
  varintValue?: number;
  bytesValue?: Uint8Array;
}

function parseProtoMessage(data: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let pos = 0;

  while (pos < data.length) {
    const [tag, tagEnd] = readVarint(data, pos);
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    pos = tagEnd;

    if (wireType === 0) {
      // Varint
      const [value, nextPos] = readVarint(data, pos);
      fields.push({ fieldNumber, wireType, varintValue: value });
      pos = nextPos;
    } else if (wireType === 2) {
      // Length-delimited (bytes, string, embedded message)
      const [value, nextPos] = readLengthDelimited(data, pos);
      fields.push({ fieldNumber, wireType, bytesValue: value });
      pos = nextPos;
    } else if (wireType === 5) {
      // 32-bit fixed — skip 4 bytes
      pos += 4;
    } else if (wireType === 1) {
      // 64-bit fixed — skip 8 bytes
      pos += 8;
    } else {
      throw new Error(`Unsupported protobuf wire type: ${wireType}`);
    }
  }

  return fields;
}

// ── Enum Mappings ────────────────────────────────────────────────────────────

const ALGORITHM_MAP: Record<number, 'SHA1' | 'SHA256' | 'SHA512'> = {
  0: 'SHA1',  // ALGORITHM_UNSPECIFIED → defaults to SHA1
  1: 'SHA1',
  2: 'SHA256',
  3: 'SHA512',
};

const DIGITS_MAP: Record<number, number> = {
  0: 6, // DIGIT_COUNT_UNSPECIFIED → defaults to 6
  1: 6,
  2: 8,
};

// ── Base32 Encoder ───────────────────────────────────────────────────────────

function bytesToBase32(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

// ── OtpParameters Decoder ────────────────────────────────────────────────────

function decodeOtpParameters(data: Uint8Array): NewAccount {
  const fields = parseProtoMessage(data);

  let secretBytes = new Uint8Array(0);
  let name = '';
  let issuer = '';
  let algorithm: 'SHA1' | 'SHA256' | 'SHA512' = 'SHA1';
  let digits = 6;
  let type: 'totp' | 'hotp' = 'totp';
  let counter = 0;

  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1: // bytes secret
        secretBytes = field.bytesValue || new Uint8Array(0);
        break;
      case 2: // string name
        name = new TextDecoder().decode(field.bytesValue || new Uint8Array(0));
        break;
      case 3: // string issuer
        issuer = new TextDecoder().decode(field.bytesValue || new Uint8Array(0));
        break;
      case 4: // Algorithm enum
        algorithm = ALGORITHM_MAP[field.varintValue || 0] || 'SHA1';
        break;
      case 5: // DigitCount enum
        digits = DIGITS_MAP[field.varintValue || 0] || 6;
        break;
      case 6: // OtpType enum
        type = field.varintValue === 1 ? 'hotp' : 'totp';
        break;
      case 7: // int64 counter
        counter = field.varintValue || 0;
        break;
    }
  }

  // Google Authenticator often formats name as "Issuer:accountname"
  if (name.includes(':')) {
    const colonIdx = name.indexOf(':');
    const prefix = name.substring(0, colonIdx).trim();
    const suffix = name.substring(colonIdx + 1).trim();

    if (!issuer) {
      issuer = prefix;
      name = suffix;
    } else if (prefix.toLowerCase() === issuer.toLowerCase()) {
      name = suffix;
    }
  }

  return {
    name: name || 'Unknown Account',
    issuer: issuer || '',
    secretBase32: bytesToBase32(secretBytes),
    algorithm,
    digits,
    type,
    counter,
    period: 30,
  };
}

// ── MigrationPayload Decoder ─────────────────────────────────────────────────

function decodeMigrationPayload(data: Uint8Array): NewAccount[] {
  const fields = parseProtoMessage(data);

  return fields
    .filter(f => f.fieldNumber === 1 && f.wireType === 2 && f.bytesValue)
    .map(f => decodeOtpParameters(f.bytesValue!));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a Google Authenticator migration URL (otpauth-migration://offline?data=...)
 * and extract all OTP accounts.
 */
export function parseMigrationUrl(url: string): NewAccount[] {
  const match = url.match(/otpauth-migration:\/\/offline\?data=(.+)/);
  if (!match) throw new Error('Invalid migration URL format');

  const base64Data = decodeURIComponent(match[1]);
  let binaryString: string;

  try {
    binaryString = atob(base64Data);
  } catch {
    throw new Error('Invalid base64 data in migration URL');
  }

  const buf = new ArrayBuffer(binaryString.length);
  const binaryData = new Uint8Array(buf);
  for (let i = 0; i < binaryString.length; i++) {
    binaryData[i] = binaryString.charCodeAt(i);
  }
  const accounts = decodeMigrationPayload(binaryData);

  if (accounts.length === 0) {
    throw new Error('No accounts found in migration data');
  }

  return accounts;
}

/**
 * Parse a standard otpauth:// URI (otpauth://totp/... or otpauth://hotp/...)
 */
export function parseOtpauthUrl(url: string): NewAccount | null {
  try {
    const otp = OTPAuth.URI.parse(url);
    return {
      name: otp.label || 'Unknown',
      issuer: otp.issuer || '',
      secretBase32: otp.secret.base32,
      algorithm: (otp.algorithm || 'SHA1') as 'SHA1' | 'SHA256' | 'SHA512',
      digits: otp.digits || 6,
      type: otp instanceof OTPAuth.HOTP ? 'hotp' : 'totp',
      counter: otp instanceof OTPAuth.HOTP ? otp.counter : 0,
      period: otp instanceof OTPAuth.TOTP ? otp.period : 30,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a TOTP/HOTP code for the given account.
 */
export function generateCode(account: OTPAccount): string {
  try {
    if (account.type === 'hotp') {
      const hotp = new OTPAuth.HOTP({
        secret: OTPAuth.Secret.fromBase32(account.secretBase32),
        algorithm: account.algorithm,
        digits: account.digits,
        counter: account.counter,
      });
      return hotp.generate();
    }

    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(account.secretBase32),
      algorithm: account.algorithm,
      digits: account.digits,
      period: account.period || 30,
    });
    return totp.generate();
  } catch {
    return '—'.repeat(account.digits || 6);
  }
}

/**
 * Generate an otpauth:// URI for exporting an account.
 */
export function getOtpauthUri(account: OTPAccount): string {
  if (account.type === 'hotp') {
    const hotp = new OTPAuth.HOTP({
      issuer: account.issuer,
      label: account.name,
      secret: OTPAuth.Secret.fromBase32(account.secretBase32),
      algorithm: account.algorithm,
      digits: account.digits,
      counter: account.counter,
    });
    return hotp.toString();
  }

  const totp = new OTPAuth.TOTP({
    issuer: account.issuer,
    label: account.name,
    secret: OTPAuth.Secret.fromBase32(account.secretBase32),
    algorithm: account.algorithm,
    digits: account.digits,
    period: account.period || 30,
  });
  return totp.toString();
}
