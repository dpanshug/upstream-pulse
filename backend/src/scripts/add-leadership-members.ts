/**
 * Add Red Hat team members with Kubeflow leadership roles
 */

import { db } from '../shared/database/client.js';
import { teamMembers } from '../shared/database/schema.js';

const leadershipMembers = [
  {
    name: 'Francisco Javier Arceo',
    githubUsername: 'franciscojavierarceo',
    department: 'AI Platform',
    role: 'Principal Engineer',
  },
  {
    name: 'Yuan Tang',
    githubUsername: 'terrytangyuan',
    department: 'AI Platform',
    role: 'Principal Engineer',
  },
  {
    name: 'Ramesh Reddy',
    githubUsername: 'rareddy',
    department: 'AI Platform',
    role: 'Principal Engineer',
  },
  {
    name: 'Matteo Mortari',
    githubUsername: 'tarilabs',
    department: 'AI Platform',
    role: 'Senior Engineer',
  },
  {
    name: 'Vaclav Pavlin',
    githubUsername: 'vpavlin',
    department: 'AI Platform',
    role: 'Senior Engineer',
  },
  {
    name: 'Humair Khan',
    githubUsername: 'HumairAK',
    department: 'AI Platform',
    role: 'Senior Engineer',
  },
  {
    name: 'Matthew Prahl',
    githubUsername: 'mprahl',
    department: 'AI Platform',
    role: 'Senior Engineer',
  },
];

async function addMembers() {
  console.log('Adding leadership team members...');
  
  for (const member of leadershipMembers) {
    try {
      const [inserted] = await db.insert(teamMembers).values({
        name: member.name,
        githubUsername: member.githubUsername,
        department: member.department,
        role: member.role,
        isActive: true,
      }).returning();
      
      console.log(`Added: ${member.name} (@${member.githubUsername})`);
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('duplicate') || msg.includes('unique')) {
        console.log(`Skipped (already exists): ${member.name}`);
      } else {
        console.error(`Error adding ${member.name}:`, msg);
      }
    }
  }
  
  console.log('Done!');
  process.exit(0);
}

addMembers();
