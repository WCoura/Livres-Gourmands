import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function dbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'livres',
    password: process.env.DB_PASSWORD || 'livres_dev',
    database: process.env.DB_NAME || 'livresgourmands',
    multipleStatements: true,
  };
}

export async function resetDatabase() {
  const config = dbConfig();
  const conn = await mysql.createConnection(config);
  const schema = fs.readFileSync(path.join(root, 'sql', 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(root, 'sql', 'seed.sql'), 'utf8');
  await conn.query(schema);
  await conn.query(seed);
  await conn.end();
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    await resetDatabase();
    const config = dbConfig();
    console.log(`Base « ${config.database} » prête (schéma + données de démonstration).`);
  } catch (error) {
    console.error('Échec de l\'initialisation MySQL.');
    console.error(error.message);
    console.error(`
Créez l'utilisateur local si besoin (mot de passe de développement, pas un secret de production) :

  sudo mysql -e "CREATE DATABASE IF NOT EXISTS livresgourmands CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'livres'@'localhost' IDENTIFIED BY 'livres_dev';
  GRANT ALL PRIVILEGES ON livresgourmands.* TO 'livres'@'localhost';
  FLUSH PRIVILEGES;"
`);
    process.exit(1);
  }
}
