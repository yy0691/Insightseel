<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10umFyhQTrYignX_evH9sRpDh8Ty5t8qP

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Multi-Provider Support

This app supports multiple AI providers:
- **Gemini** (Google Generative AI) - Default, supports vision & audio
- **OpenAI** (GPT models) - Supports vision
- **Poe** (Poe API) - Requires proxy due to CORS
- **Custom** - Any Gemini-compatible API

See [PROXY_SETUP.md](./PROXY_SETUP.md) for detailed configuration guide.

## Deploy to Vercel

For secure deployment with API key protection, see the detailed guide in [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md).

**Quick Summary:**
- Set provider API keys (e.g., `GEMINI_API_KEY`, `OPENAI_API_KEY`) in Vercel environment variables
- Your API keys stay secure on the backend
- Users can try the app without configuring their own key
- Users who set their own key use direct API calls (not your quota)
- Multiple providers can be configured simultaneously
