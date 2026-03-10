import NextAuth from "next-auth"
import KeycloakProvider from "next-auth/providers/keycloak"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_ID!,
      clientSecret: process.env.KEYCLOAK_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      const sessionToken = token as typeof token & {
        provider?: string;
        providerAccountId?: string;
      }

      if (account?.provider) {
        sessionToken.provider = account.provider
      }

      if (account?.providerAccountId) {
        sessionToken.providerAccountId = account.providerAccountId
      }

      return sessionToken
    },
    async session({ session, token }) {
      const sessionToken = token as typeof token & {
        provider?: string;
        providerAccountId?: string;
      }
      const sessionUser = session.user as typeof session.user & {
        id?: string;
        provider?: string;
      }

      if (sessionUser) {
        sessionUser.id = sessionToken.providerAccountId ?? sessionToken.sub ?? sessionUser.id
        sessionUser.provider = sessionToken.provider
      }

      return session
    },
  },
})