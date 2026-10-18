import crypto from 'node:crypto';

/**
 * Passwords that are long but trivially guessable. A length rule alone happily
 * accepts "password123" and "qwertyuiop".
 */
const OBVIOUS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789',
  '1234567890', 'qwertyuiop', 'qwerty123', 'letmein123', 'iloveyou', 'admin123',
  'welcome123', 'abc12345', 'football', 'baseball', 'sunshine', 'princess',
  'dragon123', 'monkey123', 'trustno1', 'superman', 'starwars',
]);

export interface PasswordCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Ask Have I Been Pwned whether this password appears in a known breach.
 *
 * Uses their k-anonymity API: only the first five characters of the SHA-1 hash
 * are sent, and the response is a list of suffixes to match locally — so the
 * password itself never leaves this process.
 *
 * Fails open. If the service is slow or down, that is not a reason to stop
 * someone signing up.
 */
async function isBreached(password: string): Promise<boolean> {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(2500),
      headers: { 'Add-Padding': 'true', 'User-Agent': 'chat-app-password-check' },
    });
    if (!res.ok) return false;

    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function checkPasswordStrength(
  password: string,
  context: { email?: string; name?: string } = {}
): Promise<PasswordCheck> {
  const lower = password.toLowerCase();

  if (password.length < 10) {
    return { ok: false, reason: 'Password must be at least 10 characters.' };
  }
  if (OBVIOUS.has(lower)) {
    return { ok: false, reason: 'That password is too common. Choose something less predictable.' };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, reason: 'Password cannot be a single repeated character.' };
  }

  // A password containing your own email or name is guessable by anyone who
  // knows who you are.
  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    return { ok: false, reason: 'Password must not contain your email address.' };
  }
  if (context.name && context.name.length >= 4 && lower.includes(context.name.toLowerCase())) {
    return { ok: false, reason: 'Password must not contain your name.' };
  }

  if (await isBreached(password)) {
    return {
      ok: false,
      reason: 'This password has appeared in a known data breach. Please choose a different one.',
    };
  }

  return { ok: true };
}
