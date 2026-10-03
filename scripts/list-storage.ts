import '../src/config/load-env-file.ts';
import { db } from '../src/config/supabase.ts';

async function inspectStorage() {
  const { data: buckets, error: bucketsError } = await db.storage.listBuckets();
  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError);
    return;
  }
  console.log('Buckets:', buckets.map(b => ({ id: b.id, name: b.name, public: b.public })));

  for (const b of buckets) {
    console.log(`\n=== Bucket: ${b.name} (${b.id}) ===`);
    const { data: files, error: filesError } = await db.storage.from(b.id).list('', { limit: 100 });
    if (filesError) {
      console.error(`Error listing files in bucket ${b.name}:`, filesError);
    } else {
      console.log('Root files/folders:', files);
      for (const item of files || []) {
        if (!item.id) {
          // folder
          const { data: subFiles } = await db.storage.from(b.id).list(item.name, { limit: 100 });
          console.log(`  Folder ${item.name}:`, subFiles);
        }
      }
    }
  }
}

inspectStorage().catch(console.error);
