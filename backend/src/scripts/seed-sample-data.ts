import { db } from '../shared/database/client.js';
import { projects, teamMembers } from '../shared/database/schema.js';
import { logger } from '../shared/utils/logger.js';
import { fetchGitHubUserId } from '../shared/utils/github.js';

/**
 * Seed sample data for testing
 * Run with: tsx src/scripts/seed-sample-data.ts
 */
async function seedSampleData() {
  logger.info('Seeding sample data...');

  try {
    // Sample projects
    const sampleProjects = [
      {
        name: 'Kubernetes',
        ecosystem: 'cncf',
        githubOrg: 'kubernetes',
        githubRepo: 'kubernetes',
        primaryLanguage: 'Go',
        governanceType: 'cncf',
        trackingEnabled: true,
      },
      {
        name: 'Kubeflow',
        ecosystem: 'lfai',
        githubOrg: 'kubeflow',
        githubRepo: 'kubeflow',
        primaryLanguage: 'Python',
        governanceType: 'linux-foundation',
        trackingEnabled: true,
      },
      {
        name: 'PyTorch',
        ecosystem: 'lfai',
        githubOrg: 'pytorch',
        githubRepo: 'pytorch',
        primaryLanguage: 'Python',
        governanceType: 'linux-foundation',
        trackingEnabled: true,
      },
      {
        name: 'MLflow',
        ecosystem: 'lfai',
        githubOrg: 'mlflow',
        githubRepo: 'mlflow',
        primaryLanguage: 'Python',
        governanceType: 'linux-foundation',
        trackingEnabled: true,
      },
    ];

    logger.info('Inserting sample projects...');
    for (const project of sampleProjects) {
      await db.insert(projects).values(project).onConflictDoNothing();
      logger.info(`Inserted project: ${project.name}`);
    }

    // Sample team members
    const sampleMembers = [
      {
        name: 'Alice Johnson',
        primaryEmail: 'alice.johnson@redhat.com',
        githubUsername: 'alice-redhat',
        department: 'AI Engineering',
        role: 'Senior Engineer',
        isActive: true,
      },
      {
        name: 'Bob Smith',
        primaryEmail: 'bob.smith@redhat.com',
        githubUsername: 'bsmith',
        department: 'AI Engineering',
        role: 'Staff Engineer',
        isActive: true,
      },
      {
        name: 'Carol Williams',
        primaryEmail: 'carol.williams@redhat.com',
        githubUsername: 'carolw',
        department: 'ML Operations',
        role: 'Principal Engineer',
        isActive: true,
      },
      {
        name: 'David Brown',
        primaryEmail: 'david.brown@redhat.com',
        githubUsername: 'dbrown-rh',
        department: 'AI Engineering',
        role: 'Engineer',
        isActive: true,
      },
    ];

    logger.info('Inserting sample team members...');
    for (const member of sampleMembers) {
      // Auto-fetch GitHub user ID if username is provided
      let githubUserId: number | null = null;
      if (member.githubUsername) {
        logger.info(`Fetching GitHub user ID for @${member.githubUsername}...`);
        githubUserId = await fetchGitHubUserId(member.githubUsername);
      }

      await db.insert(teamMembers).values({
        ...member,
        githubUserId,
      }).onConflictDoNothing();

      logger.info(`Inserted team member: ${member.name} (GitHub ID: ${githubUserId ?? 'not found'})`);
    }

    logger.info('Sample data seeding completed successfully!');
    logger.info(`Inserted ${sampleProjects.length} projects and ${sampleMembers.length} team members`);

    process.exit(0);

  } catch (error) {
    logger.error('Error seeding sample data', { error });
    process.exit(1);
  }
}

seedSampleData();
