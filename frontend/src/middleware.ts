import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEVTOOLS_PATH = "/.well-known/appspecific/com.chrome.devtools.json";

/**
 * Chrome DevTools "Workspaces" reads this URL and maps the folder on disk. Next.js
 * responds with an absolute `root` (the app directory). In Docker that root is
 * e.g. `/app`, which Windows Chrome cannot add → "Unable to add filesystem: <illegal path>".
 *
 * Set `NEXT_DEVTOOLS_WORKSPACE_ROOT` to your *host* project path (e.g. the `frontend` folder
 * on your machine) when running the app in a container, or to fix a wrong auto-detected path.
 * Optional: `NEXT_DEVTOOLS_WORKSPACE_UUID` (stable UUID) so the workspace id does not change.
 */
export function middleware(request: NextRequest) {
  const hostRoot = process.env.NEXT_DEVTOOLS_WORKSPACE_ROOT?.trim();
  if (!hostRoot || process.env.NODE_ENV === "production") {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname === DEVTOOLS_PATH) {
    const uuid =
      process.env.NEXT_DEVTOOLS_WORKSPACE_UUID?.trim() || "00000000-0000-4000-8000-000000000001";
    return NextResponse.json(
      {
        workspace: {
          // Chrome accepts forward slashes on Windows
          root: hostRoot.replace(/\\/g, "/"),
          uuid,
        },
      },
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: DEVTOOLS_PATH,
};
