/**
 * Browser side of fingerprint / face sign-in (WebAuthn passkeys). The API sends
 * options as JSON with base64url strings for binary fields; these helpers turn
 * them into what `navigator.credentials` expects and the result back into JSON.
 * Decoding by hand keeps older phones working (no `parseCreationOptionsFromJSON`).
 */

type Json = Record<string, unknown>;
type Descriptor = { id: string; type: "public-key"; transports?: AuthenticatorTransport[] };

function toBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const descriptors = (list: unknown) =>
  ((list as Descriptor[] | undefined) ?? []).map((item) => ({ ...item, id: toBytes(item.id) }));

/** True when this device has a fingerprint, face or screen-lock sensor the browser can use. */
export async function passkeysSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !window.isSecureContext) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Asks the device to make a new passkey (shows the fingerprint / face prompt). */
export async function createPasskey(options: Json): Promise<Json> {
  const user = options.user as { id: string; name: string; displayName: string };
  const publicKey = {
    ...options,
    challenge: toBytes(options.challenge as string),
    user: { ...user, id: toBytes(user.id) },
    excludeCredentials: descriptors(options.excludeCredentials),
  } as unknown as PublicKeyCredentialCreationOptions;

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new DOMException("No passkey was created.", "NotAllowedError");
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      attestationObject: toBase64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}

/** Asks the device to sign in with one of its passkeys for this site. */
export async function getPasskey(options: Json): Promise<Json> {
  const publicKey = {
    ...options,
    challenge: toBytes(options.challenge as string),
    allowCredentials: descriptors(options.allowCredentials),
  } as unknown as PublicKeyCredentialRequestOptions;

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new DOMException("No passkey was chosen.", "NotAllowedError");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      authenticatorData: toBase64url(response.authenticatorData),
      signature: toBase64url(response.signature),
      userHandle: response.userHandle ? toBase64url(response.userHandle) : null,
    },
  };
}

export const isAlreadyRegistered = (error: unknown) => error instanceof DOMException && error.name === "InvalidStateError";

/**
 * A message for the person, or `null` when they just closed the prompt
 * (cancel and timeout look the same to the browser) and nothing should show.
 */
export function passkeyErrorMessage(error: unknown): string | null {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") return null;
    if (error.name === "InvalidStateError") return "This device is already set up for fingerprint sign-in.";
    if (error.name === "SecurityError" || error.name === "NotSupportedError") return "Fingerprint sign-in isn’t available here.";
  }
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}

/** A label people recognise in their device list, e.g. "iPhone" or "Android phone". */
export function deviceName(): string {
  const agent = navigator.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(agent)) return /Mobile/.test(agent) ? "Android phone" : "Android tablet";
  if (/Macintosh/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows PC";
  return "This device";
}

/** What people call the sensor on this device, e.g. "Face ID or Touch ID" on an iPhone. */
export function biometricLabel(): string {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad/.test(agent)) return "Face ID or Touch ID";
  if (/Macintosh/.test(agent)) return "Touch ID";
  if (/Windows/.test(agent)) return "Windows Hello";
  return "fingerprint";
}
