import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function keyPaths(storageDir) {
  return {
    privateKey: path.join(storageDir, "join_private.pem"),
    publicKey: path.join(storageDir, "join_public.pem"),
  };
}

export function ensureJoinSigningKeys(storageDir) {
  const paths = keyPaths(storageDir);
  if (fs.existsSync(paths.privateKey) && fs.existsSync(paths.publicKey)) {
    return paths;
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 1024,
    publicExponent: 0x10001,
  });
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(
    paths.privateKey,
    privateKey.export({ type: "pkcs1", format: "pem" }),
  );
  fs.writeFileSync(
    paths.publicKey,
    publicKey.export({ type: "pkcs1", format: "pem" }),
  );
  console.log(
    `[join-sign] Generated new RSA keys in ${storageDir}. Re-patch RobloxPlayerBeta.exe with join_public.pem (see README).`,
  );
  return paths;
}

export function signJoinScriptBody(jsonBody, storageDir) {
  const paths = ensureJoinSigningKeys(storageDir);
  const privateKeyPem = fs.readFileSync(paths.privateKey);
  const data = `\r\n${jsonBody}`;
  const signature = crypto.sign("RSA-SHA1", Buffer.from(data, "utf8"), privateKeyPem);
  return `--rbxsig%${signature.toString("base64")}%${data}`;
}
