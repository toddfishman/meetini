import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create the initial user
  const user = await prisma.user.upsert({
    where: { email: 'toddfishman@gmail.com' },
    update: {},
    create: {
      email: 'toddfishman@gmail.com',
      name: 'Todd Fishman',
      notifyByEmail: true,
      notifyBySms: false,
    },
  });

  console.log('Created user:', user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 