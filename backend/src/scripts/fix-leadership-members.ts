/**
 * Fix department and role for leadership members
 */

import { db } from '../shared/database/client.js';
import { teamMembers } from '../shared/database/schema.js';
import { inArray } from 'drizzle-orm';

async function fix() {
  const usernames = ['franciscojavierarceo', 'terrytangyuan', 'rareddy', 'tarilabs', 'vpavlin', 'HumairAK', 'mprahl'];

  const result = await db.update(teamMembers)
    .set({ 
      department: 'AI Engineering',
      role: 'Engineer'
    })
    .where(inArray(teamMembers.githubUsername, usernames))
    .returning({ name: teamMembers.name });

  console.log(`Updated ${result.length} members to AI Engineering / Engineer:`);
  result.forEach(m => console.log(`  - ${m.name}`));
  
  process.exit(0);
}

fix();
