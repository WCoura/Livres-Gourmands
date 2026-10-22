import dotenv from 'dotenv';

dotenv.config();

const DEV_JWT_SECRET = 'dev-jwt-secret-livres-gourmands-ne-pas-utiliser-en-production';

export function getConfig() {
  const port = Number(process.env.PORT || 4721);
  const jwtSecret = process.env.JWT_SECRET || DEV_JWT_SECRET;
  return {
    port,
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    panierExpirationHeures: Number(process.env.PANIER_EXPIRATION_HEURES || 72),
    publicUrl: process.env.PUBLIC_URL || `http://127.0.0.1:${port}`,
    usingDefaultJwt: !process.env.JWT_SECRET,
    db: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'livres',
      password: process.env.DB_PASSWORD || 'livres_dev',
      database: process.env.DB_NAME || 'livresgourmands',
    },
  };
}
