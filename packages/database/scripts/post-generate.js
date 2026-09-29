const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach((element) => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

try {
  const rootNodeModules = path.resolve(__dirname, '../../../node_modules');
  const dbNodeModules = path.resolve(__dirname, '../node_modules');
  const pnpmDir = path.join(rootNodeModules, '.pnpm');

  if (fs.existsSync(pnpmDir)) {
    const entries = fs.readdirSync(pnpmDir);
    const prismaEntry = entries.find((e) => e.startsWith('@prisma+client@'));
    if (prismaEntry) {
      const srcPrisma = path.join(pnpmDir, prismaEntry, 'node_modules/.prisma');
      const srcPrismaClient = path.join(pnpmDir, prismaEntry, 'node_modules/@prisma');

      if (fs.existsSync(srcPrisma)) {
        copyFolderSync(srcPrisma, path.join(dbNodeModules, '.prisma'));
        copyFolderSync(srcPrisma, path.join(rootNodeModules, '.prisma'));
      }
      if (fs.existsSync(srcPrismaClient)) {
        copyFolderSync(srcPrismaClient, path.join(rootNodeModules, '@prisma'));
      }
    }
  }
} catch (err) {
  // Graceful fallback
}
