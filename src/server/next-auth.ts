import NextAuth from "next-auth"
import KeycloakProvider from "next-auth/providers/keycloak"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: `${basePath}/api/auth`, 
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_ID!,
      clientSecret: process.env.KEYCLOAK_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
      profile(profile) {
        console.log("Profile received in provider profile callback:", profile)
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username,
          email: profile.email,
          image: profile.picture,
          roles: profile.client_access?.roles ?? profile.realm_access?.roles ?? profile.roles ?? [],
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}${basePath}`;
      }
      if (url.startsWith("/")) {
        return url.startsWith(basePath) ? `${baseUrl}${url}` : `${baseUrl}${basePath}${url}`;
      }
      if (url.startsWith(baseUrl)) return url;
      
      return `${baseUrl}${basePath}`;
    },
    async jwt({ token, account, profile }) {
      const sessionToken = token as typeof token & {
        provider?: string;
        providerAccountId?: string;
        roles?: string[];
      }

      if (account?.provider) {
        sessionToken.provider = account.provider
      }

      if (account?.providerAccountId) {
        sessionToken.providerAccountId = account.providerAccountId
      }

      if (profile) {
        console.log("Profile received in JWT callback:", profile)
        const p = profile as Profile
        sessionToken.roles = p.client_access?.roles ?? p.realm_access?.roles ?? p.roles ?? []
      }

      return sessionToken
    },
    async session({ session, token }) {
      const sessionToken = token as typeof token & {
        provider?: string;
        providerAccountId?: string;
        roles?: string[];
      }
      const sessionUser = session.user as typeof session.user & {
        id?: string;
        provider?: string;
        roles?: string[];
      }

      if (sessionUser) {
        sessionUser.id = sessionToken.providerAccountId ?? sessionToken.sub ?? sessionUser.id
        sessionUser.provider = sessionToken.provider
        sessionUser.roles = sessionToken.roles ?? []
      }

      return session
    },
  },
})

type Profile = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  realm_access?: {
    roles: string[];
  };
  client_access?: {
    roles: string[];
  };
  roles?: string[];
};