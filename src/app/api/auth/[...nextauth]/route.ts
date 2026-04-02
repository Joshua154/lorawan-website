import { handlers } from "@/server/next-auth"

import { NextRequest } from "next/server";

const { GET: AuthGET, POST: AuthPOST } = handlers;

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function rewriteRequestWithBasePath(req: NextRequest) {
  if (!basePath) return req;

  const url = new URL(req.url);
  if (!url.pathname.startsWith(basePath)) {
    url.pathname = `${basePath}${url.pathname}`;
  }

  return new NextRequest(url, req);
}

export const GET = (req: NextRequest) => AuthGET(rewriteRequestWithBasePath(req));
export const POST = (req: NextRequest) => AuthPOST(rewriteRequestWithBasePath(req));