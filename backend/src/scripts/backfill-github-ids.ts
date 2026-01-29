import { db } from '../shared/database/client.js';
import { teamMembers } from '../shared/database/schema.js';
import { eq, isNull, isNotNull, and } from 'drizzle-orm';
import { config } from '../shared/config/index.js';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

async function fetchGitHubUserId(username: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'upstream-pulse',
        ...(config.githubToken && { 'Authorization': `Bearer ${config.githubToken}` }),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`⚠ User not found`);
        return null;
      }
      if (response.status === 403) {
        console.error(`✗ Rate limited. Try again later or add GITHUB_TOKEN to .env`);
        process.exit(1);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const user = await response.json() as GitHubUser;
    return user.id;
  } catch (error) {
    console.error(`✗ Error fetching ${username}:`, error);
    return null;
  }
}

async function backfillGitHubIds() {
  console.log('🔄 Backfilling GitHub User IDs...\n');

  // Find team members with username but no user_id
  const membersToUpdate = await db
    .select({
      id: teamMembers.id,
      name: teamMembers.name,
      githubUsername: teamMembers.githubUsername,
      githubUserId: teamMembers.githubUserId,
    })
    .from(teamMembers)
    .where(
      and(
        isNotNull(teamMembers.githubUsername),
        isNull(teamMembers.githubUserId)
      )
    );

  console.log(`Found ${membersToUpdate.length} team members needing GitHub user IDs\n`);

  if (membersToUpdate.length === 0) {
    console.log('✅ All team members already have GitHub user IDs!');
    process.exit(0);
  }

  let updated = 0;
  let failed = 0;

  for (const member of membersToUpdate) {
    if (!member.githubUsername) continue;

    process.stdout.write(`Processing ${member.name} (@${member.githubUsername})... `);

    const userId = await fetchGitHubUserId(member.githubUsername);

    if (userId) {
      await db
        .update(teamMembers)
        .set({ githubUserId: userId })
        .where(eq(teamMembers.id, member.id));

      console.log(`✓ ID: ${userId}`);
      updated++;
    } else {
      console.log(`✗ Failed`);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n✅ Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  
  process.exit(0);
}

backfillGitHubIds().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
