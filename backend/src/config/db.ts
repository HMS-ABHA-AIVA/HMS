import { PrismaClient } from "@prisma/client";

// A hosted database can be slow to answer the first connection after it has been idle (Neon suspends idle databases).
// Prisma's default is to give up after 5 seconds, which showed up as a 500 on the first request. Wait longer instead.
const withPatience = (url: string | undefined) =>
  url && !/connect_timeout=/.test(url) ? `${url}${url.includes("?") ? "&" : "?"}connect_timeout=30&pool_timeout=30` : url;

const url = withPatience(process.env.DATABASE_URL);

export const prisma = url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();