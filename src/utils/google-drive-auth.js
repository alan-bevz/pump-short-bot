import fs from 'fs/promises';
import readline from 'readline';
import { google } from 'googleapis';

const TOKEN_PATH = 'oauth-token.json';
const CREDENTIALS_PATH = 'oauth-client-secret.json';

export async function checkGoogleDriveAuthorization() {
  let credentials;

  try {
    credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf-8'));
  } catch {
    console.warn('❌ Файл oauth-client-secret.json не знайдено.');
    return null;
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  try {
    const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);
    console.log('✅ Користувач вже авторизований у Google Drive.');
    return oAuth2Client;
  } catch {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });

    console.log('\n🔐 Щоб зберігати файли на Google Drive, авторизуйтесь:');
    console.log(authUrl);
    console.log('(Або натисни Enter, щоб пропустити)');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const code = await new Promise(resolve => rl.question('\nВстав код сюди (або натисни Enter): ', resolve));
    rl.close();

    if (!code.trim()) {
      console.warn('⚠️ Авторизацію пропущено. Файли не будуть збережені на Google Drive.');
      return null;
    }

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
    console.log('✅ Авторизація успішна. Токен збережено.');
    return oAuth2Client;
  }
}
