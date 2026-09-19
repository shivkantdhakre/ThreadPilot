const { PrismaClient } = require('./packages/database/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

async function main() {
  // Check for drafts with issues
  const drafts = await p.contentDraft.findMany({
    take: 20,
    select: { id: true, workspaceId: true, ideaId: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log('Recent drafts:', JSON.stringify(drafts, null, 2));

  // Check for any scheduled posts with potentially bad data
  const sched = await p.scheduledPost.findMany({
    take: 5,
    select: { id: true, draftId: true, workspaceId: true }
  });
  console.log('Scheduled posts:', JSON.stringify(sched, null, 2));

  // Try to reproduce the 500 error
  try {
    const result = await p.contentDraft.findMany({
      where: { workspaceId: '1cd24832-0426-4f86-bbe5-e0bada2ee3e4' },
      include: {
        versions: { orderBy: { version: 'desc' } },
        idea: true,
        scheduledPost: true,
        publishedPost: true,
      },
      take: 20,
    });
    console.log('List drafts for audit workspace OK, count:', result.length);
  } catch (e) {
    console.error('List drafts FAILED:', e.message);
  }
}

main().catch(e => console.error(e)).finally(() => p.$disconnect());
