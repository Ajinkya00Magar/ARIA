import { workspaceService } from '../src/services/workspace.service';
import { connectDatabase, getDb } from '../src/db/connection';
import { users } from '../src/db/schema';

async function main() {
  try {
    await connectDatabase();
    const db = getDb();
    const allUsers = await db.select().from(users).limit(1);
    const user = allUsers[0];
    if (!user) {
      console.log('No user found');
      return;
    }
    console.log(`Creating workspace for user: ${user.id}`);
    const ws = await workspaceService.create(user.id, {
      name: 'test project',
      description: 'test'
    });
    console.log('Success:', ws);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}
main();
