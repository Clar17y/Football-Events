# Grassroots PWA Starter ⚽

A modern Progressive Web App for grassroots football match management and event logging. Built with React, TypeScript, and Ionic for offline-first mobile experiences.

## Features

• 🕐 Real-time match clock with start/pause/reset controls
• ⚽ Event logging (goals, cards, substitutions) with player selection
• 🎤 Speech-to-text integration for quick event capture
• 📱 PWA with offline support and service worker caching
• 💾 IndexedDB storage with Dexie for persistent data
• 🔄 Error handling with retry mechanisms and toast notifications
• 📊 Team and player management with comprehensive event tracking

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript |
| UI Framework | Ionic React |
| Build Tool | Vite |
| Database | IndexedDB + Dexie |
| Validation | Zod schemas |
| Testing | Vitest + Testing Library |
| PWA | Service Worker + Manifest |
| Styling | Ionic CSS + Custom CSS |

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:5173
# Or with Docker: docker-compose up
```

Requires Node.js 18+ or Docker with docker-compose.

## Development Workflow

• Use MCP proxy for CLI commands: `Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command": "npm test"}'`
• Start dev server with hot reload
• Run tests in watch mode during development
• Use TypeScript strict mode for type safety
• Follow error boundary patterns for robust UX

## Testing & Type-checking

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npx tsc --noEmit      # Type check
```

## Scripts

| Command | Description |
|---------|-------------|
| `dev` | Start development server |
| `build` | Production build |
| `test` | Run test suite |
| `test:watch` | Tests in watch mode |
| `preview` | Preview production build |

## Commit & Branch Conventions

```
feat: add new feature
fix: bug fix
docs: documentation
style: formatting
refactor: code restructure
test: add tests
chore: maintenance
```

## License

MIT License - see LICENSE file for details.