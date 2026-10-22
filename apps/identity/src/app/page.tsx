import { headers } from "next/headers";
import { IdentityPage } from "@/_pages/identity";
import { SignInPage } from "@/_pages/sign-in";
import { getLoginPageConfig } from "@/server/auth";

export default async function Page() {
  const config = await getLoginPageConfig();
  const requestHeaders = await headers();
  if (config && requestHeaders.get("host") === new URL(config.loginUrl).host) {
    const googleSignInUrl = new URL("/api/auth/login", config.appUrl);
    googleSignInUrl.searchParams.set("provider", "google");
    googleSignInUrl.searchParams.set("destination", "website");

    const githubSignInUrl = new URL("/api/auth/login", config.appUrl);
    githubSignInUrl.searchParams.set("provider", "github");
    githubSignInUrl.searchParams.set("destination", "website");

    return (
      <SignInPage
        googleSignInUrl={googleSignInUrl.toString()}
        githubSignInUrl={githubSignInUrl.toString()}
      />
    );
  }

  return <IdentityPage />;
}
