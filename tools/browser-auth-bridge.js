// Port of the WhiskeySockets PR #2676 "browser-auth bridge" that runs against the
// installed @whiskeysockets/baileys (no fork build required). The browser-side
// extractor lives in import-wa-session.js (pure browser JS); this module contains
// only the Node-side materialisation into Baileys multi-file auth.
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BufferJSON,
  Curve,
  generateSignalPubKey,
  initAuthCreds,
  jidDecode,
  jidEncode,
} from '@whiskeysockets/baileys';
import * as curve from 'libsignal/src/curve.js';

const bufferFromB64 = (value) => Buffer.from(value, 'base64');
const bufferJsonToBuffer = (value) => bufferFromB64(value.__b64);

const browserJidToBaileysJid = (jid) => {
  const decoded = jidDecode(jid);
  if (!decoded) throw new Error(`Could not normalize browser JID: ${jid}`);
  return jidEncode(decoded.user, decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server, decoded.device);
};

const fixFileName = (file) => file.replace(/\//g, '__').replace(/:/g, '-');

const jidUser = (jid) => {
  const decoded = jidDecode(jid);
  if (!decoded) throw new Error(`Could not decode JID: ${jid}`);
  return decoded.user;
};

const publicKeyFromPrivate = (privateKey) =>
  Buffer.from(curve.getPublicFromPrivateKey(privateKey).slice(1));

const selectNoiseKeyPair = (noise) => {
  for (const privateCandidate of noise.privateKeyCandidates) {
    const privateKey = bufferFromB64(privateCandidate.value);
    const derivedPublicKey = publicKeyFromPrivate(privateKey);
    for (const publicCandidate of noise.publicKeyCandidates) {
      const publicKey = bufferFromB64(publicCandidate.value);
      if (derivedPublicKey.equals(publicKey)) {
        return {
          keyPair: { private: privateKey, public: publicKey },
          privateIvIndex: privateCandidate.ivIndex,
          publicIvIndex: publicCandidate.ivIndex,
        };
      }
    }
  }
  throw new Error('Could not match WhatsApp Web Noise private/public key candidates');
};

const selectRecoveryToken = (candidates, usedIvIndexes) => {
  if (!candidates?.length) return undefined;
  return candidates.find((candidate) => !usedIvIndexes.has(candidate.ivIndex)) || candidates[0];
};

const toKeyPair = (keyPair) => ({
  private: bufferJsonToBuffer(keyPair.privKey),
  public: bufferJsonToBuffer(keyPair.pubKey),
});

const toSignedKeyPair = (signedPreKey, identityKey) => {
  const keyPair = toKeyPair(signedPreKey.keyPair);
  const signature = Curve.sign(identityKey.private, generateSignalPubKey(keyPair.public));
  return { keyPair, signature, keyId: signedPreKey.keyId };
};

export const makeBrowserAuthImport = (extract, options = {}) => {
  const selectedNoise = selectNoiseKeyPair(extract.noise);
  const recoveryToken = selectRecoveryToken(
    extract.noise.recoveryTokenCandidates,
    new Set([selectedNoise.privateIvIndex, selectedNoise.publicIvIndex])
  );
  if (!recoveryToken) throw new Error('WhatsApp Web auth export did not include a recovery token');

  const signedPreKey =
    extract.signal.lastSignedPreKeyId === undefined
      ? extract.signal.signedPreKeys[0]
      : extract.signal.signedPreKeys.find((key) => key.keyId === extract.signal.lastSignedPreKeyId);
  if (!signedPreKey) throw new Error('WhatsApp Web auth export did not include a signed pre-key');

  const signedIdentityKey = {
    private: bufferFromB64(extract.signal.signedIdentityKey.private),
    public: bufferFromB64(extract.signal.signedIdentityKey.public),
  };
  const creds = initAuthCreds();
  Object.assign(creds, {
    noiseKey: selectedNoise.keyPair,
    signedIdentityKey,
    signedPreKey: toSignedKeyPair(signedPreKey, signedIdentityKey),
    registrationId: extract.signal.registrationId,
    advSecretKey: recoveryToken.value,
    processedHistoryMessages: [],
    nextPreKeyId: extract.signal.nextPreKeyId,
    firstUnuploadedPreKeyId: extract.signal.firstUnuploadedPreKeyId,
    accountSyncCounter: 0,
    accountSettings: { unarchiveChats: false },
    registered: false,
    account: {
      details: bufferJsonToBuffer(extract.signal.advSignedIdentity.details),
      accountSignatureKey: bufferJsonToBuffer(extract.signal.advSignedIdentity.accountSignatureKey),
      accountSignature: bufferJsonToBuffer(extract.signal.advSignedIdentity.accountSignature),
      deviceSignature: bufferJsonToBuffer(extract.signal.advSignedIdentity.deviceSignature),
    },
    me: {
      id: browserJidToBaileysJid(extract.localStorage.lastWidMd),
      lid: extract.localStorage.waLid,
      name: options.name,
    },
    signalIdentities: [
      {
        identifier: { name: extract.localStorage.waLid, deviceId: 0 },
        identifierKey: generateSignalPubKey(signedIdentityKey.public),
      },
    ],
    platform: options.platform || 'web',
  });

  const preKeys = {};
  for (const preKey of extract.signal.preKeys) preKeys[preKey.keyId] = toKeyPair(preKey.keyPair);

  const pnUser = jidUser(browserJidToBaileysJid(extract.localStorage.lastWidMd));
  const lidUser = jidUser(extract.localStorage.waLid);

  return {
    creds,
    keys: {
      'pre-key': preKeys,
      'lid-mapping': {
        [pnUser]: lidUser,
        [`${lidUser}_reverse`]: pnUser,
      },
    },
    selectedNoiseCandidate: {
      privateIvIndex: selectedNoise.privateIvIndex,
      publicIvIndex: selectedNoise.publicIvIndex,
      recoveryTokenIvIndex: recoveryToken?.ivIndex,
    },
  };
};

export const writeBrowserAuthToMultiFile = async (folder, extract, options = {}) => {
  const authImport = makeBrowserAuthImport(extract, options);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await chmod(folder, 0o700);

  const writePrivateJson = async (file, value) => {
    const filePath = join(folder, file);
    await writeFile(filePath, JSON.stringify(value, BufferJSON.replacer), { mode: 0o600 });
    await chmod(filePath, 0o600);
  };

  await writePrivateJson('creds.json', authImport.creds);
  for (const category in authImport.keys) {
    const values = authImport.keys[category];
    for (const id in values) {
      const value = values[id];
      if (value) await writePrivateJson(fixFileName(`${category}-${id}.json`), value);
    }
  }
  return authImport;
};
