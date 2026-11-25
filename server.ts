import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  // =========================================================================
  // Domain Verification Files (iOS Universal Links & Android App Links)
  // =========================================================================
  app.get('/.well-known/apple-app-site-association', (_req: Request, res: Response) => {
    const teamId = process.env.IOS_TEAM_ID || 'TEAMID1234';
    const bundleId = process.env.IOS_BUNDLE_ID || 'com.smartlink.app';

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${teamId}.${bundleId}`],
            components: [
              {
                '/': '/r/*',
                comment: 'Matches SmartLink universal short link paths',
              },
              {
                '/': '/*',
                exclude: false,
                comment: 'Matches root short-code routes excluding web app paths',
              },
            ],
          },
        ],
      },
    });
  });

  app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    const pkg = process.env.ANDROID_APP_PACKAGE || 'com.smartlink.app';
    const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: pkg,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', database: 'cloud-firestore' });
  });

  // =========================================================================
  // Frontend Serving (Vite Middleware in Dev / Static dist in Production)
  // =========================================================================
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartLink server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
