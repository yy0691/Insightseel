# Proxy Setup Guide

This document explains how to configure the multi-provider proxy for AI-Videos-Play.

## Overview

The proxy (`/api/proxy`) supports multiple AI providers:
- **Gemini** (Google Generative AI)
- **OpenAI** (GPT models)
- **Poe** (Poe API)
- **Custom** (Gemini-compatible APIs)

## Environment Variables

Configure the following environment variables based on your chosen provider(s):

### Gemini (Default)
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_BASE_URL=https://generativelanguage.googleapis.com  # Optional
GEMINI_MODEL=gemini-2.5-flash  # Optional
```

### OpenAI
```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional
OPENAI_MODEL=gpt-4o-mini  # Optional
```

### Poe
```bash
POE_API_KEY=your_poe_api_key_here
POE_BASE_URL=https://api.poe.com/v1  # Optional
POE_MODEL=GPT-4o-mini  # Optional, must match Poe bot name
```

### Custom (Gemini-compatible)
```bash
CUSTOM_API_KEY=your_custom_api_key_here
CUSTOM_BASE_URL=https://your-custom-endpoint.com
CUSTOM_MODEL=your_model_name
```

## Local Development

### Using Vite Dev Server (No Proxy)
If you're using `npm run dev` with Vite, the proxy won't be available. You must:
1. Configure API keys directly in the app settings
2. Disable "Use Proxy" in settings
3. Use direct API connections

### Using Vercel Dev (With Proxy)
To test the proxy locally:

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Create a `.env` file in the project root:
```bash
# Example for Gemini
GEMINI_API_KEY=your_actual_key_here

# Or for OpenAI
OPENAI_API_KEY=your_actual_key_here

# Or for Poe
POE_API_KEY=your_actual_key_here
```

3. Run with Vercel dev server:
```bash
vercel dev
```

4. In the app settings:
   - Enable "Use Proxy"
   - Select your provider (Gemini/OpenAI/Poe)
   - Test connection

## Deployment

### Vercel Deployment

1. Push your code to GitHub/GitLab/Bitbucket

2. Import project to Vercel

3. Add environment variables in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add the API keys for your chosen provider(s)
   - Example: `GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.

4. Deploy

### Other Platforms

For other serverless platforms (Netlify, AWS Lambda, etc.), ensure:
- The platform supports Node.js serverless functions
- Environment variables are configured
- The `/api/proxy` endpoint is properly routed

## Provider-Specific Notes

### Gemini
- Supports vision (images) and audio
- Supports streaming
- No CORS issues in browser (can use direct connection)

### OpenAI
- Supports vision (images) but not audio in vision API
- Supports streaming
- No CORS issues in browser (can use direct connection)
- Audio transcription requires separate Whisper API

### Poe
- **Requires proxy** due to CORS restrictions
- Limited support for multimodal content
- Model names must match Poe bot identifiers
- Check Poe API documentation for available bots

### Custom
- Must be Gemini API-compatible
- Format: `{baseUrl}/v1beta/models/{model}:generateContent?key={apiKey}`

## Troubleshooting

### "API Key not set" Error
- Ensure environment variables are set correctly
- Variable names must match exactly (e.g., `GEMINI_API_KEY`)
- Restart the dev server after adding variables

### "Proxy request failed" Error
- Check if `/api/proxy` is available (only works with Vercel/serverless)
- Verify API key is valid
- Check network connectivity

### "Request too large" Error
- Proxy has 4.5MB limit (Vercel restriction)
- Use shorter videos or compress them
- Consider using direct connection for large files

### CORS Errors
- Enable "Use Proxy" for providers that require it (Poe)
- Or use direct connection for Gemini/OpenAI

## Security Best Practices

1. **Never commit API keys** to version control
2. Use environment variables for all sensitive data
3. Add `.env` to `.gitignore`
4. Rotate API keys regularly
5. Use separate keys for development and production
6. Monitor API usage and set spending limits

## Example Configuration

### Development (.env)
```bash
# Use Gemini for development
GEMINI_API_KEY=AIzaSy...your_dev_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### Production (Vercel Environment Variables)
```bash
# Production keys with higher quotas
GEMINI_API_KEY=AIzaSy...your_prod_key_here
OPENAI_API_KEY=sk-...your_openai_key_here
POE_API_KEY=...your_poe_key_here
```

## Support

For issues or questions:
1. Check the console logs in browser DevTools
2. Check server logs in Vercel dashboard
3. Verify API keys are valid and have sufficient quota
4. Review provider-specific documentation
