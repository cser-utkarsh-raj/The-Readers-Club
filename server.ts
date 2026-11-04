import { startServer } from './backend/src/server.ts';

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
