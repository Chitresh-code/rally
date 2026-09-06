import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/login";
  const isPublicPage = isLoginPage || pathname.startsWith("/invite/");

  if (!isLoggedIn && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  // Excludes anything with a file extension (static assets like /logo-black.png,
  // /icon.png, /favicon.ico) in addition to api/auth and Next internals — the
  // previous matcher only skipped favicon.ico and redirected every other public
  // asset (and /invite/[token] itself) to /login for signed-out requests.
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\..*).*)"],
};
