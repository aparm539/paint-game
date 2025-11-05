# Dice Roll Combat Multiplayer Game

A real-time multiplayer web game where players throw dice on a shared playing field. Dice rolls deal area-of-effect damage to nearby players based on the roll value.

## Features

- Real-time multiplayer gameplay using Socket.io
- Physics-based dice throwing with trajectory preview
- Area-of-effect damage system
- Health bars for each player
- Visual feedback for damage and eliminations
- Winner announcement when players are eliminated

## Setup

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:

Copy the example environment files and customize as needed:

```bash
# Copy root .env file
cp .env.example .env

# Copy server .env file
cp server/.env.example server/.env

# Copy client .env file
cp client/.env.example client/.env
```

**Environment Variables:**

Server (`.env` or `server/.env`):
- `PORT` - Server port (default: 3000)
- `CORS_ORIGIN` - Allowed CORS origins, comma-separated (default: *)
- `GRID_SIZE` - Grid size for the painting canvas (default: 20)
- `CELL_PIXEL_SIZE` - Size of each cell in pixels (default: 50)
- `NUM_COLORS` - Number of paint colors available (default: 6)

Client (`.env` or `client/.env`):
- `VITE_SERVER_URL` - Server URL for Socket.io connection (default: http://localhost:3000)

> **Note:** `.env` files are gitignored by default. Never commit sensitive credentials to version control. Use `.env.example` files as templates.

3. Start the development servers:

In separate terminals:

**Terminal 1 - Server:**
```bash
cd server
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

3. Open your browser and navigate to:
   - Client: http://localhost:5173
   - The server will run on http://localhost:3000

## How to Play

1. Enter a username and click "Join Game"
2. Your dice will appear on the playing field
3. Click and drag from your dice to aim your throw
4. Release to throw - the trajectory preview shows where you'll land
5. When your dice lands, it deals damage equal to the roll value (1-6) to all players within the damage radius
6. Players are eliminated when their health reaches 0
7. Last player standing wins!

## Project Structure

```
dice-game/
├── server/          # Node.js server with Socket.io
│   └── src/
│       ├── index.ts          # Server entry point
│       ├── socket-handler.ts # Game logic and Socket.io handlers
│       └── types.ts          # Type definitions
├── client/          # Client-side application
│   ├── public/      # Static files (HTML, CSS)
│   └── src/
│       ├── index.ts      # Client entry point
│       ├── game.ts       # Game UI and logic
│       ├── physics.ts    # Physics calculations
│       ├── socket-client.ts # Socket.io client
│       └── types.ts      # Type definitions
└── shared/          # Shared types between client and server
    └── types.ts
```

## Development

The project uses:
- **TypeScript** for type safety
- **Socket.io** for real-time communication
- **Vite** for client development and building
- **Express** for the server
- **Canvas API** for rendering the playing field

## Building for Production

```bash
# Build both client and server
npm run build
```

Or build individually:

```bash
# Build server
cd server
npm run build

# Build client
cd client
npm run build
```

## Deployment

For production deployment to a VPS, see the comprehensive [Deployment Guide](DEPLOYMENT.md).

Quick summary:

1. **Set environment variables** on your hosting platform:
   - For the server: `PORT`, `CORS_ORIGIN`, `NODE_ENV`
   - For the client: `VITE_SERVER_URL` (must point to your production server)

2. **Build the application**:
   ```bash
   npm run build
   ```

3. **Deploy with PM2** (recommended for VPS):
   ```bash
   pm2 start ecosystem.config.js
   ```

The server will automatically serve the client from the `dist` folder.

📖 **See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed VPS setup instructions, Nginx configuration, troubleshooting, and more.**

## Game Mechanics

- Each player starts with 100 HP
- Dice roll values range from 1-6
- Damage radius is 80 pixels
- Players are eliminated at 0 HP
- Game ends when one player remains or all are eliminated

