import { closePool } from '../src/db.js';
import { expirerPaniersInactifs } from '../src/services/panierService.js';

const result = await expirerPaniersInactifs();
console.log(`${result.expires} panier(s) expiré(s).`);
await closePool();
