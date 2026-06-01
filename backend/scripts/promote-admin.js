'use strict';

const prisma = require('../src/config/database');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/promote-admin.js <email>');
  process.exit(1);
}

async function main() {
  const pilot = await prisma.pilot.findUnique({ where: { email } });
  if (!pilot) {
    console.error(`No pilot found with email: ${email}`);
    process.exit(1);
  }
  if (pilot.isAdmin) {
    console.log(`${email} is already an admin.`);
    return;
  }
  await prisma.pilot.update({ where: { email }, data: { isAdmin: true } });
  console.log(`Promoted ${email} (${pilot.firstName} ${pilot.lastName}) to admin.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
