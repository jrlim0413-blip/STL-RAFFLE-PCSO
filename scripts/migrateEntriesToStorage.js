import { migrateEntryDetailsToBucket } from '../lib/raffleStore.js';

try {
  const migratedCount = await migrateEntryDetailsToBucket();
  console.log(`Verified private storage for ${migratedCount} raffle entries and minimized database records.`);
} catch (error) {
  console.error('Participant record migration failed:', error);
  process.exitCode = 1;
}
