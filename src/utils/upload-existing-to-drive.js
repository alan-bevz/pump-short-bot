import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import readline from 'readline';
import open from 'open';
import { google } from 'googleapis';

const TOKEN_PATH = 'oauth-token.json';
const CREDENTIALS_PATH = 'oauth-client-secret.json';
const LOCAL_BASE_FOLDER = 'results-strategies';
const DRIVE_ROOT_FOLDER = 'results-strategies';

async function authorize() {
  const credentials = JSON.parse(await fsPromises.readFile(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  try {
    const token = JSON.parse(await fsPromises.readFile(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  } catch {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive']
    });

    console.log('🔐 Open this URL in your browser:\n', authUrl);
    await open(authUrl);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise(resolve => rl.question('Enter code: ', resolve));
    rl.close();

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    await fsPromises.writeFile(TOKEN_PATH, JSON.stringify(tokens));
    console.log('✅ Token saved to', TOKEN_PATH);
    return oAuth2Client;
  }
}

async function isFileExistsInDrive(drive, fileName, folderId) {
  const query = [`name = '${fileName}'`, `'${folderId}' in parents`, `trashed = false`].join(
    ' and '
  );

  const res = await drive.files.list({
    q: query,
    fields: 'files(id)',
    spaces: 'drive'
  });

  return res.data.files.length > 0;
}

async function getOrCreateDriveFolder(drive, folderName, parentId = null) {
  const query =
    `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false` +
    (parentId ? ` and '${parentId}' in parents` : '');

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {})
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id'
  });

  return folder.data.id;
}

async function getOrCreateDriveFolderByPath(drive, pathParts) {
  let parentId = null;
  for (const part of pathParts) {
    parentId = await getOrCreateDriveFolder(drive, part, parentId);
  }
  return parentId;
}

async function uploadFileToDrive(drive, localPath, driveFolderId) {
  const fileName = path.basename(localPath);
  const mimeType = fileName.endsWith('.json') ? 'application/json' : 'text/csv';

  const exists = await isFileExistsInDrive(drive, fileName, driveFolderId);
  if (exists) {
    console.log(`⚠️ Пропущено (файл вже існує): ${fileName}`);
    return;
  }

  const media = {
    mimeType,
    body: fs.createReadStream(localPath)
  };

  const res = await drive.files.create({
    resource: {
      name: fileName,
      parents: [driveFolderId]
    },
    media,
    fields: 'id, webViewLink'
  });

  console.log(`📄 Завантажено: ${fileName} → ${res.data.webViewLink}`);
}

async function syncFolderToDrive(localBase, relativePathParts, drive, parentDriveId = null) {
  const currentLocalPath = path.join(localBase, ...relativePathParts);
  const folderName = relativePathParts.slice(-1)[0] || DRIVE_ROOT_FOLDER;

  // 🔁 Створюємо папку на Google Drive
  const currentDriveId = await getOrCreateDriveFolder(drive, folderName, parentDriveId);

  const entries = await fsPromises.readdir(currentLocalPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(currentLocalPath, entry.name);

    if (entry.isDirectory()) {
      await syncFolderToDrive(localBase, [...relativePathParts, entry.name], drive, currentDriveId);
    } else if (entry.name.endsWith('.csv') || entry.name.endsWith('.json')) {
      await uploadFileToDrive(drive, entryPath, currentDriveId);
    }
  }

  // ✅ Навіть якщо папка порожня — вона створена вже на цьому етапі
}

async function main() {
  const auth = await authorize();
  const drive = google.drive({ version: 'v3', auth });

  console.log(
    `\n📁 Синхронізація папки "${LOCAL_BASE_FOLDER}" → Google Drive "${DRIVE_ROOT_FOLDER}"...\n`
  );

  const rootExists = await fsPromises.stat(LOCAL_BASE_FOLDER).catch(() => null);
  if (!rootExists || !rootExists.isDirectory()) {
    console.error(`❌ Папка "${LOCAL_BASE_FOLDER}" не знайдена.`);
    return;
  }

  // Створюємо кореневу папку на Drive, якщо її нема
  const rootDriveId = await getOrCreateDriveFolder(drive, DRIVE_ROOT_FOLDER);
  await syncFolderToDrive(LOCAL_BASE_FOLDER, [], drive, null);

  console.log('\n✅ Синхронізацію завершено.');
}

main().catch(err => {
  console.error('❌ Помилка:', err.message);
});
