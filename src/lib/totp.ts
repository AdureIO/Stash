// TOTP implementation using Node.js crypto — no external library needed
// RFC 6238 / RFC 4226 compliant
import { createHmac, randomBytes } from "crypto";
import QRCode from "qrcode";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DIGITS = 6;
const STEP = 30; // seconds

export function generateTotpSecret(): string {
	const bytes = randomBytes(20);
	let result = "";
	let buffer = 0,
		bitsLeft = 0;
	for (const byte of bytes) {
		buffer = (buffer << 8) | byte;
		bitsLeft += 8;
		while (bitsLeft >= 5) {
			bitsLeft -= 5;
			result += BASE32_CHARS[(buffer >> bitsLeft) & 31];
		}
	}
	return result;
}

function base32Decode(encoded: string): Buffer {
	const upper = encoded.replace(/=+$/, "").toUpperCase();
	let buffer = 0,
		bitsLeft = 0;
	const output: number[] = [];
	for (const char of upper) {
		const val = BASE32_CHARS.indexOf(char);
		if (val < 0) continue;
		buffer = (buffer << 5) | val;
		bitsLeft += 5;
		if (bitsLeft >= 8) {
			bitsLeft -= 8;
			output.push((buffer >> bitsLeft) & 0xff);
		}
	}
	return Buffer.from(output);
}

function hotp(secret: string, counter: number): string {
	const key = base32Decode(secret);
	const msg = Buffer.alloc(8);
	msg.writeBigInt64BE(BigInt(counter));
	const hmac = createHmac("sha1", key).update(msg).digest();
	const offset = hmac[19] & 0xf;
	const code =
		(((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]) %
		10 ** DIGITS;
	return code.toString().padStart(DIGITS, "0");
}

export function verifyTotpCode(secret: string, token: string, window = 1): boolean {
	const counter = Math.floor(Date.now() / 1000 / STEP);
	for (let i = -window; i <= window; i++) {
		if (hotp(secret, counter + i) === token) return true;
	}
	return false;
}

export async function totpQrDataUri(username: string, secret: string): Promise<string> {
	const issuer = "Stash";
	const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
	return QRCode.toDataURL(uri);
}
