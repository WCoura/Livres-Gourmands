import { createApp } from './app.js';
import { getConfig } from './config.js';
import { getPool } from './db.js';

const config = getConfig();
const app = createApp();

try {
  await getPool().query('SELECT 1');
} catch (error) {
  console.error('Connexion MySQL impossible.');
  console.error(error.message);
  console.error('Créez la base puis lancez : npm run db:setup');
  process.exit(1);
}

if (config.usingDefaultJwt) {
  console.warn('JWT_SECRET absent : un secret de développement local est utilisé. Ne pas déployer ainsi.');
}

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Livres Gourmands  ${config.publicUrl}`);
});
