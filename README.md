# AQUAI Clone

Isometric onchain roguelike game inspired by [RogueAI.fun](https://www.rogueai.fun)

## Features

- 🎮 Isometric tile-based game world
- 🧙 Agent NFT minting system
- 🗺️ Real-time minimap
- 💰 ERC20 token integration (ready for smart contracts)
- ⚔️ Agent stats (HP, ATK, RNG, SPD, REGEN)
- 🏆 Leaderboard UI (ready for implementation)

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript (no build step required)
- **Rendering:** 2D Canvas API
- **State Management:** Custom state management
- **Web3:** Ready for Ethers.js integration

## Getting Started

### Quick Start

```bash
# Navigate to the project
cd rogueai-clone

# Start a simple HTTP server
python3 -m http.server 3000

# Open in browser
# http://localhost:3000
```

Or use any static file server:

```bash
npx serve .
# or
npx http-server .
```

## Project Structure

```
rogueai-clone/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # All styles
├── js/
│   └── game.js         # Game logic and rendering
├── assets/             # Game assets (images, etc.)
└── README.md
```

## Game Mechanics

### Agent Stats

| Stat | Description | Range |
|------|-------------|-------|
| HP | Health points | 80-150 |
| ATK | Attack damage | 80-150 |
| RNG | Attack range | 400-600 |
| SPD | Movement speed | 40-80 |
| REGEN | Health regeneration | 1-3 |

### Minting

- **Free Mints:** First 100 mints are free
- **Paid Mint:** After free mints, burn 10M tokens
- **Cost:** 0.01 ETH (when free mints exhausted)

### Mining Ring

Agents can mine tokens in the designated mining ring:
- **Center:** (6400, 6400)
- **Inner Radius:** 3840
- **Outer Radius:** 4480

## Smart Contracts (Coming Soon)

- **Agent NFT:** ERC-721 contract for agent ownership
- **Game Token:** ERC-20 token for in-game economy
- **Game Contract:** Core game logic and state

## Roadmap

- [x] Basic isometric game world
- [x] Agent minting UI
- [x] Minimap
- [x] Wallet connection (mock)
- [ ] Smart contract deployment (Solidity/Foundry)
- [ ] Real wallet integration (Ethers.js)
- [ ] Combat system
- [ ] Leaderboard
- [ ] Multiplayer support

## License

MIT
