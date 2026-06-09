# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Insightseel, please report it by opening a private security advisory on GitHub or by emailing the maintainers directly. Please do not open public issues for security vulnerabilities.

## Security Best Practices

### Environment Variables

**Never commit `.env` files to version control.** The `.gitignore` file is configured to exclude:
- `.env`
- `.env.local`
- `.env*.local`

### API Keys

When deploying Insightseel, protect your API keys:

1. **Local Development:**
   - Copy `.env.example` to `.env.local`
   - Add your API keys to `.env.local`
   - Never commit `.env.local` to Git

2. **Production Deployment (Vercel/Netlify):**
   - Set environment variables in your hosting platform's dashboard
   - Enable `VITE_USE_PROXY=true` to route API calls through serverless functions
   - This keeps your API keys server-side and prevents exposure to the browser

3. **Supabase Service Role Key:**
   - The `SUPABASE_SERVICE_ROLE_KEY` has admin privileges
   - Only set this in server-side environments (Vercel serverless functions)
   - Never expose this key in browser code or public repositories
   - When set, it enables JWT authentication for the `/api/proxy` endpoint

### Key Rotation

If you suspect your API keys have been compromised:

1. **Immediately rotate** all affected keys:
   - Generate new keys from your provider (Deepgram, Supabase, LLM provider)
   - Update environment variables in all environments
   - Revoke the old keys

2. **Check Git history:**
   ```bash
   # Search for potential leaked keys
   git log -p | grep -i "api_key\|secret\|password"
   ```

3. **If keys were committed to Git:**
   - Rotate all keys immediately
   - Consider using tools like [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) to remove sensitive data from history
   - Force push after cleaning (note: this rewrites history)

### Authentication

- Supabase authentication uses JWT tokens
- Row-level security (RLS) policies should be enabled on all Supabase tables
- The `SUPABASE_ANON_KEY` is safe to expose in browser code (it's designed for client-side use)
- The `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the browser

### Dependencies

- Keep dependencies up to date to patch known vulnerabilities
- Run `pnpm audit` regularly to check for security issues
- Review dependency changes before updating

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

We recommend always using the latest version for security updates.
