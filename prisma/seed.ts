import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@rally.local" },
    update: {},
    create: {
      email: "owner@rally.local",
      name: "Rally Owner",
      passwordHash,
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "rally" },
    update: {},
    create: {
      name: "Rally",
      slug: "rally",
      memberships: {
        create: { userId: owner.id, role: "OWNER" },
      },
      spaces: {
        create: {
          name: "Engineering",
          lists: {
            create: [
              { name: "Backlog" },
              { name: "Sprint 1", isSprint: true },
            ],
          },
        },
      },
    },
  });

  console.log(`Seeded workspace "${workspace.name}" with owner ${owner.email} (password: password123)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
