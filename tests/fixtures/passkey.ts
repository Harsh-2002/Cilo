import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest();
const base64 = (value: Uint8Array) => Buffer.from(value).toString("base64url");
export function authenticator() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const id = randomBytes(32);
  const key = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, "base64url")],
      [-3, Buffer.from(jwk.y!, "base64url")],
    ]),
  );
  let counter = 0;
  return {
    registration(
      challenge: string,
      verified = true,
      origin = "http://localhost:3000",
      rp = "localhost",
    ) {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(id.length);
      const authData = Buffer.concat([
        hash(rp),
        Buffer.from([verified ? 69 : 65]),
        Buffer.alloc(4),
        Buffer.alloc(16),
        length,
        id,
        key,
      ]);
      const attestation = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, never>>([
          ["fmt", "none"],
          ["authData", authData],
          ["attStmt", new Map<string, never>()],
        ]),
      );
      return {
        id: base64(id),
        rawId: base64(id),
        type: "public-key",
        clientExtensionResults: { credProps: { rk: true } },
        response: {
          clientDataJSON: base64(
            Buffer.from(
              JSON.stringify({ type: "webauthn.create", challenge, origin }),
            ),
          ),
          attestationObject: base64(attestation),
          transports: ["usb"],
        },
      };
    },
    authentication(
      challenge: string,
      verified = true,
      origin = "http://localhost:3000",
      rp = "localhost",
    ) {
      const count = Buffer.alloc(4);
      count.writeUInt32BE(++counter);
      const authData = Buffer.concat([
        hash(rp),
        Buffer.from([verified ? 5 : 1]),
        count,
      ]);
      const clientData = Buffer.from(
        JSON.stringify({ type: "webauthn.get", challenge, origin }),
      );
      return {
        id: base64(id),
        rawId: base64(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          authenticatorData: base64(authData),
          clientDataJSON: base64(clientData),
          signature: base64(
            sign(
              "sha256",
              Buffer.concat([authData, hash(clientData)]),
              pair.privateKey,
            ),
          ),
        },
      };
    },
  };
}
