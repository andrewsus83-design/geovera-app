import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// AUTH DISABLED — re-enable when dashboard is built
export function middleware(request: NextRequest) {
  void request;
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)).*)",
  ],
};
