# Deployment Instructions for Vercel

This repository is built using Next.js (App Router) and is configured to be deployed on **Vercel** with a true zero-config setup.

## Steps to deploy:

1. Push your code to a repository in GitHub, GitLab, or Bitbucket.
2. Sign in to [Vercel](https://vercel.com/) with your Git provider.
3. Click on the **Add New...** button and select **Project**.
4. Import your newly pushed repository.
5. Vercel will automatically detect that this is a Next.js project. You do not need to override any Build or Output commands.
6. Click **Deploy**.

## Why Vercel?
Next.js applications, specifically those leveraging the App Router and complex hydration sequences (React 19), have internal limitations when exported as a single flat `file://` HTML. Running the app in Vercel allows the Next.js runtime to function correctly over `http(s)://`, fully supporting client-side routing, offline-first architectures (via localStorage), and dynamic asset loading without console errors.
