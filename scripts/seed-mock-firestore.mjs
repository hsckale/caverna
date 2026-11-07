import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { applicationDefault, getApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const expectedProjectId = 'caverna-jiujitsu';
const projectId = process.env.FIREBASE_PROJECT_ID;
const mockPassword = '12345678a';
const dryRun = process.argv.includes('--dry-run');

if (projectId !== expectedProjectId || !process.argv.includes(`--confirm-project=${expectedProjectId}`)) {
  throw new Error(
    `Defina FIREBASE_PROJECT_ID=${expectedProjectId} e confirme a gravação com --confirm-project=${expectedProjectId}.`,
  );
}

const fixtureUrl = new URL('./mock-firestore.json', import.meta.url);
const fixture = JSON.parse(await readFile(fileURLToPath(fixtureUrl), 'utf8'));
if (fixture.authUsers.some(({ email }) => !email.endsWith('@example.test'))) {
  throw new Error('Contas de demonstração devem usar somente endereços @example.test.');
}

const dateInSaoPaulo = (offsetDays) => {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
};
const now = new Date().toISOString();

const replaceTokens = (value, tokens) => {
  if (typeof value === 'string') {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (placeholder, token) => {
      if (!(token in tokens)) throw new Error(`Token desconhecido no JSON: ${placeholder}`);
      return tokens[token];
    });
  }
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, tokens));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, tokens)]));
  }
  return value;
};

const uidTokens = Object.fromEntries(
  fixture.authUsers.map(({ uidToken }) => [uidToken, `dry-run-${uidToken.toLowerCase()}`]),
);
let app;
let db;
if (!dryRun) {
  app = (() => {
    try {
      return getApp();
    } catch {
      return initializeApp({ credential: applicationDefault(), projectId });
    }
  })();

  const auth = getAuth(app);
  db = getFirestore(app);
  const gymSnapshot = await db.collection('gyms').doc(fixture.gym.id).get();
  let existingAdmin;
  try {
    existingAdmin = await auth.getUserByEmail(fixture.authUsers.find(({ uidToken }) => uidToken === 'ADMIN_UID').email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  if (gymSnapshot.exists) {
    const existingGym = gymSnapshot.data();
    if (
      existingGym.seededBy !== 'caverna-mock-v1' ||
      ![existingAdmin?.uid, 'demo-admin'].includes(existingGym.ownerId)
    ) {
      throw new Error(
        `A academia ${fixture.gym.id} já existe e não parece ser este seed de demonstração; nada foi gravado.`,
      );
    }
  }

  for (const mockUser of fixture.authUsers) {
    let existingUser;
    try {
      existingUser = await auth.getUserByEmail(mockUser.email);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }

    const user = existingUser
      ? await auth.updateUser(existingUser.uid, {
          password: mockPassword,
          displayName: mockUser.displayName,
          disabled: false,
        })
      : await auth.createUser({
          email: mockUser.email,
          password: mockPassword,
          displayName: mockUser.displayName,
        });
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), cavernaMock: true });
    uidTokens[mockUser.uidToken] = user.uid;
  }
}

const tokens = {
  ...uidTokens,
  TODAY: dateInSaoPaulo(0),
  TOMORROW: dateInSaoPaulo(1),
  NOW: now,
};
const resolvedFixture = replaceTokens(fixture, tokens);
const gym = resolvedFixture.gym.data;
const records = Object.entries(resolvedFixture.collections).flatMap(([collectionName, documents]) =>
  documents.map(({ id, data }) => ({
    collectionName,
    id,
    data,
  })),
);

if (!dryRun) {
  const gymRef = db.collection('gyms').doc(fixture.gym.id);
  for (const { collectionName, id } of records) {
    const snapshot = await db.collection(collectionName).doc(id).get();
    if (snapshot.exists && snapshot.data().gymId !== fixture.gym.id) {
      throw new Error(
        `O documento ${collectionName}/${id} já pertence a outra academia; nada foi gravado no Firestore.`,
      );
    }
  }

  const batch = db.batch();
  batch.set(gymRef, gym);
  for (const { collectionName, id, data } of records) batch.set(db.collection(collectionName).doc(id), data);
  await batch.commit();
  console.info(`Seed concluído no projeto ${projectId}. Academia: ${fixture.gym.id}.`);
  console.info(`Contas Auth mock: ${fixture.authUsers.map(({ email }) => email).join(', ')}.`);
  console.info(`Senha padrão das contas mock: ${mockPassword}.`);
} else {
  console.info(
    `Dry run válido: ${records.length} documentos de exemplo + academia e ${fixture.authUsers.length} contas Auth mock, no projeto ${projectId}.`,
  );
}
