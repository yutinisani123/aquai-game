// RogueAI Clone - Game Logic
// Constants matching RogueAI.fun
const GAME_CONFIG = {
  MAP_SIZE: 12800,
  TILE_SIZE: 64,
  DEFAULT_HP: 100,
  DEFAULT_ATK: 100,
  DEFAULT_RNG: 500,
  DEFAULT_SPD: 60,
  DEFAULT_REGEN: 1,
  COMBAT_COOLDOWN: 600,
  FREE_MINTS: 100,
  PAID_MINT_BURN: 10_000_000,
  MINT_COST_ETH: 0.0002, // ~$0.50
  MINING_RATE: 0.8333,
  MINING_CENTER: 6400,
  MINING_INNER_RADIUS: 3840,
  MINING_OUTER_RADIUS: 4480,
};

// 🟦 AQUAI Smart Contract Addresses (Base Sepolia)
const CONTRACTS = {
  baseSepolia: {
    AquaiToken: "0x97fA542Fc8B6797e98d40b0c5730B6FdC97D9d95",
    AquaiAgent: "0x9D8daE7df9ef5865ddC99Aa976c72d3E59B172B2",
    AquaiGame: "0x30127E12C14bAe9ec4f059f3CAae03E81803BB40"
  }
};

console.log('🌊 AQUAI Contracts Loaded:', CONTRACTS);

// Stat ranges for random generation
const STAT_RANGES = {
  hp: { min: 80, max: 150 },
  atk: { min: 80, max: 150 },
  rng: { min: 400, max: 600 },
  spd: { min: 40, max: 80 },
  regen: { min: 1, max: 3 },
};

// Game state
const gameState = {
  isConnected: false,
  wallet: null,
  balance: { eth: 0.5, tokens: 1000 },
  agents: [],
  selectedAgent: null,
  mintedCount: 0,
  freeMintsRemaining: 100, // Match contract: 100 free mints
  isMinting: false,
  activePanel: 'game',
  
  // Movement
  keys: {},
  lastMoveTime: 0,
  moveCooldown: 100, // ms between moves
  
  // Combat
  combatLog: [],
  lastCombatTime: 0,
  combatCooldown: 600, // ms
  
  // Mining
  miningRate: GAME_CONFIG.MINING_RATE,
  
  // Multiplayer
  remoteAgents: new Map(),
  lastRemoteUpdate: 0,
};

// Generate random agent stats
function generateAgentStats() {
  return {
    hp: Math.floor(Math.random() * (STAT_RANGES.hp.max - STAT_RANGES.hp.min + 1)) + STAT_RANGES.hp.min,
    atk: Math.floor(Math.random() * (STAT_RANGES.atk.max - STAT_RANGES.atk.min + 1)) + STAT_RANGES.atk.min,
    rng: Math.floor(Math.random() * (STAT_RANGES.rng.max - STAT_RANGES.rng.min + 1)) + STAT_RANGES.rng.min,
    spd: Math.floor(Math.random() * (STAT_RANGES.spd.max - STAT_RANGES.spd.min + 1)) + STAT_RANGES.spd.min,
    regen: Math.floor(Math.random() * (STAT_RANGES.regen.max - STAT_RANGES.regen.min + 1)) + STAT_RANGES.regen.min,
  };
}

// Generate tile map
function generateTileMap(size) {
  const tiles = [];
  const tileSize = GAME_CONFIG.TILE_SIZE;
  const halfSize = size / 2;

  for (let x = -halfSize; x < halfSize; x += tileSize) {
    for (let z = -halfSize; z < halfSize; z += tileSize) {
      // Simple noise-based tile generation
      const noise = Math.sin(x * 0.01) * Math.cos(z * 0.01) + Math.random() * 0.3;

      let type = 'grass';
      if (noise < -0.5) type = 'water';
      else if (noise < -0.2) type = 'dirt';
      else if (noise > 0.6) type = 'stone';

      // Create mining ring (visual only)
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter > GAME_CONFIG.MINING_INNER_RADIUS && 
          distFromCenter < GAME_CONFIG.MINING_OUTER_RADIUS) {
        if (type === 'grass') type = 'grassDark';
      }

      tiles.push({
        position: [x + tileSize / 2, 0, z + tileSize / 2],
        type,
        key: `${x}-${z}`,
      });
    }
  }

  return tiles;
}

// Initialize game
function initGame() {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('Game canvas not found!');
    return;
  }
  const ctx = canvas.getContext('2d');
  
  // Set canvas size
  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    console.log('Canvas resized:', canvas.width, 'x', canvas.height);
  }
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Setup keyboard controls
  setupKeyboardControls();
  
  // Start game loop
  startGameLoop(ctx);
  
  console.log('Game initialized!');

  // Generate tiles
  const tiles = generateTileMap(2000);

  // Animation loop
  let time = 0;
  function animate() {
    time += 0.016;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid (subtle)
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let z = 0; z < canvas.height; z += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, z);
      ctx.lineTo(canvas.width, z);
      ctx.stroke();
    }

    // Draw agents (isometric view)
    gameState.agents.forEach(agent => {
      const screenX = (agent.position.x - GAME_CONFIG.MINING_CENTER + canvas.width / 2) * 0.3;
      const screenY = (agent.position.y - GAME_CONFIG.MINING_CENTER + canvas.height / 2) * 0.3;

      // Agent body
      const agentColor = gameState.selectedAgent === agent.id ? '#00ff88' : '#4488ff';
      
      // Floating animation
      const floatY = Math.sin(time * 3) * 10;

      ctx.fillStyle = agentColor;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY - 40 + floatY);
      ctx.lineTo(screenX + 12, screenY - 20 + floatY);
      ctx.lineTo(screenX + 12, screenY + 20 + floatY);
      ctx.lineTo(screenX - 12, screenY + 20 + floatY);
      ctx.lineTo(screenX - 12, screenY - 20 + floatY);
      ctx.closePath();
      ctx.fill();

      // Name label
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(agent.name, screenX, screenY - 50 + floatY);

      // HP bar
      ctx.fillStyle = '#333333';
      ctx.fillRect(screenX - 10, screenY - 28 + floatY, 20, 3);
      ctx.fillStyle = '#ff4444';
      const hpPercent = Math.max(0, agent.stats.hp / 150);
      ctx.fillRect(screenX - 10, screenY - 28 + floatY, 20 * hpPercent, 3);
    });

    requestAnimationFrame(animate);
  }

  animate();

  // Initialize minimap
  initMinimap();

  // Setup event listeners
  setupEventListeners();

  // Update UI
  updateUI();
  
  // Auto-connect wallet immediately (no alert blocking)
  console.log('Auto-connecting wallet for demo...');
  connectWallet();
}

// Setup keyboard controls for movement and combat
function setupKeyboardControls() {
  // Key down
  document.addEventListener('keydown', (e) => {
    gameState.keys[e.key.toLowerCase()] = true;
    
    // Combat with space
    if (e.code === 'Space' && gameState.selectedAgent) {
      e.preventDefault();
      attemptCombat();
    }
    
    // Mining with 'm'
    if (e.key.toLowerCase() === 'm' && gameState.selectedAgent) {
      e.preventDefault();
      attemptMining();
    }
  });
  
  // Key up
  document.addEventListener('keyup', (e) => {
    gameState.keys[e.key.toLowerCase()] = false;
  });
}

// Game loop with movement, mining, and multiplayer
let animationId;
function startGameLoop(ctx) {
  let time = 0;
  
  function animate() {
    time += 0.016;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid (subtle)
    drawGrid(ctx);

    // Handle movement
    handleMovement();
    
    // Handle mining
    handleMining();
    
    // Handle multiplayer
    handleMultiplayer();

    // Draw agents (isometric view)
    drawAgents(ctx, time);
    
    // Draw UI overlays
    drawUIOverlays(ctx);

    animationId = requestAnimationFrame(animate);
  }

  animate();
}

// Draw grid
function drawGrid(ctx) {
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  const gridSize = 50;
  
  // Draw grid lines
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let z = 0; z < canvas.height; z += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, z);
    ctx.lineTo(canvas.width, z);
    ctx.stroke();
  }
  
  // Draw mining ring
  const center = { x: canvas.width / 2, y: canvas.height / 2 };
  const scale = 0.3;
  
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, GAME_CONFIG.MINING_INNER_RADIUS * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(center.x, center.y, GAME_CONFIG.MINING_OUTER_RADIUS * scale, 0, Math.PI * 2);
  ctx.stroke();
}

// Initialize minimap
function initMinimap() {
  const canvas = document.getElementById('minimapCanvas');
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const center = size / 2;
  const ringScale = (size / 2 - 20) / GAME_CONFIG.MINING_OUTER_RADIUS;

  function drawMinimap() {
    // Clear
    ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
    ctx.fillRect(0, 0, size, size);

    // Draw mining ring
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, GAME_CONFIG.MINING_INNER_RADIUS * ringScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, GAME_CONFIG.MINING_OUTER_RADIUS * ringScale, 0, Math.PI * 2);
    ctx.stroke();

    // Draw grid
    ctx.strokeStyle = 'rgba(51, 51, 51, 0.5)';
    ctx.lineWidth = 1;
    const gridSize = 50 * ringScale;
    for (let i = 0; i < size; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    // Draw agents
    gameState.agents.forEach(agent => {
      const x = center + (agent.position.x - GAME_CONFIG.MINING_CENTER) * ringScale;
      const y = center + (agent.position.y - GAME_CONFIG.MINING_CENTER) * ringScale;

      if (x < 0 || x > size || y < 0 || y > size) return;

      ctx.fillStyle = gameState.selectedAgent === agent.id ? '#00ff88' : '#4488ff';
      ctx.shadowColor = gameState.selectedAgent === agent.id ? '#00ff88' : '#4488ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw center marker
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(center, center, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  drawMinimap();
}

// Movement
function handleMovement() {
  if (!gameState.selectedAgent) return;
  
  const agent = gameState.agents.find(a => a.id === gameState.selectedAgent);
  if (!agent) return;
  
  const now = Date.now();
  if (now - gameState.lastMoveTime < gameState.moveCooldown) return;
  
  let moved = false;
  const moveSpeed = 50;
  
  if (gameState.keys['w'] || gameState.keys['arrowup']) {
    agent.position.y -= moveSpeed;
    moved = true;
  }
  if (gameState.keys['s'] || gameState.keys['arrowdown']) {
    agent.position.y += moveSpeed;
    moved = true;
  }
  if (gameState.keys['a'] || gameState.keys['arrowleft']) {
    agent.position.x -= moveSpeed;
    moved = true;
  }
  if (gameState.keys['d'] || gameState.keys['arrowright']) {
    agent.position.x += moveSpeed;
    moved = true;
  }
  
  if (moved) {
    gameState.lastMoveTime = now;
    updateAgentPosition(agent.id, agent.position);
  }
}

// Combat
function attemptCombat() {
  const now = Date.now();
  if (now - gameState.lastCombatTime < gameState.combatCooldown) return;
  
  const selectedAgent = gameState.agents.find(a => a.id === gameState.selectedAgent);
  if (!selectedAgent) return;
  
  // Find nearest enemy agent
  let nearestEnemy = null;
  let minDistance = Infinity;
  
  gameState.agents.forEach(agent => {
    if (agent.id === gameState.selectedAgent) return;
    
    const dx = agent.position.x - selectedAgent.position.x;
    const dy = agent.position.y - selectedAgent.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < minDistance && distance <= selectedAgent.stats.rng) {
      minDistance = distance;
      nearestEnemy = agent;
    }
  });
  
  if (nearestEnemy) {
    // Deal damage
    const damage = Math.floor(selectedAgent.stats.atk * (0.8 + Math.random() * 0.4));
    nearestEnemy.stats.hp = Math.max(0, nearestEnemy.stats.hp - damage);
    
    // Add to combat log
    gameState.combatLog.unshift({
      time: Date.now(),
      attacker: selectedAgent.name,
      target: nearestEnemy.name,
      damage: damage,
      type: 'attack'
    });
    
    // Check if enemy died
    if (nearestEnemy.stats.hp <= 0) {
      gameState.agents = gameState.agents.filter(a => a.id !== nearestEnemy.id);
      if (gameState.selectedAgent === nearestEnemy.id) {
        gameState.selectedAgent = null;
      }
      gameState.combatLog.unshift({
        time: Date.now(),
        message: `${nearestEnemy.name} was defeated!`,
        type: 'kill'
      });
    }
    
    gameState.lastCombatTime = now;
    updateUI();
    drawMinimap();
  }
}

// Mining
function handleMining() {
  if (!gameState.selectedAgent) return;
  
  const agent = gameState.agents.find(a => a.id === gameState.selectedAgent);
  if (!agent) return;
  
  // Check if in mining ring
  const dx = agent.position.x - GAME_CONFIG.MINING_CENTER;
  const dy = agent.position.y - GAME_CONFIG.MINING_CENTER;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance >= GAME_CONFIG.MINING_INNER_RADIUS && distance <= GAME_CONFIG.MINING_OUTER_RADIUS) {
    // Mine tokens
    if (Math.random() < 0.1) { // 10% chance per frame
      const mined = gameState.miningRate * (0.9 + Math.random() * 0.2);
      gameState.balance.tokens += mined;
      
      // Show mining effect (visual only for now)
      console.log(`Mined ${mined.toFixed(2)} tokens!`);
    }
  }
  
  updateUI();
}

// Multiplayer (simulated for now)
function handleMultiplayer() {
  const now = Date.now();
  
  // Simulate remote agent updates
  if (now - gameState.lastRemoteUpdate > 1000) {
    gameState.lastRemoteUpdate = now;
    
    // Add simulated remote agents
    if (gameState.remoteAgents.size < 2 && Math.random() < 0.3) {
      const remoteId = Date.now();
      gameState.remoteAgents.set(remoteId, {
        id: remoteId,
        name: `Player ${gameState.remoteAgents.size + 1}`,
        position: {
          x: GAME_CONFIG.MINING_CENTER + (Math.random() - 0.5) * 2000,
          y: GAME_CONFIG.MINING_CENTER + (Math.random() - 0.5) * 2000
        },
        stats: generateAgentStats()
      });
    }
  }
}

// Draw agents
function drawAgents(ctx, time) {
  // Draw local agents
  gameState.agents.forEach(agent => {
    const screenX = (agent.position.x - GAME_CONFIG.MINING_CENTER + canvas.width / 2) * 0.3;
    const screenY = (agent.position.y - GAME_CONFIG.MINING_CENTER + canvas.height / 2) * 0.3;

    // Agent body
    const agentColor = gameState.selectedAgent === agent.id ? '#00ff88' : '#4488ff';
    
    // Floating animation
    const floatY = Math.sin(time * 3) * 10;

    ctx.fillStyle = agentColor;
    ctx.beginPath();
    ctx.moveTo(screenX, screenY - 40 + floatY);
    ctx.lineTo(screenX + 12, screenY - 20 + floatY);
    ctx.lineTo(screenX + 12, screenY + 20 + floatY);
    ctx.lineTo(screenX - 12, screenY + 20 + floatY);
    ctx.lineTo(screenX - 12, screenY - 20 + floatY);
    ctx.closePath();
    ctx.fill();

    // Name label
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name, screenX, screenY - 50 + floatY);

    // HP bar
    ctx.fillStyle = '#333333';
    ctx.fillRect(screenX - 10, screenY - 28 + floatY, 20, 3);
    ctx.fillStyle = '#ff4444';
    const hpPercent = Math.max(0, agent.stats.hp / 150);
    ctx.fillRect(screenX - 10, screenY - 28 + floatY, 20 * hpPercent, 3);
  });
  
  // Draw remote agents
  gameState.remoteAgents.forEach(agent => {
    const screenX = (agent.position.x - GAME_CONFIG.MINING_CENTER + canvas.width / 2) * 0.3;
    const screenY = (agent.position.y - GAME_CONFIG.MINING_CENTER + canvas.height / 2) * 0.3;
    
    const floatY = Math.sin(time * 3 + agent.id) * 10;
    
    ctx.fillStyle = '#ff8844'; // Orange for remote players
    ctx.beginPath();
    ctx.moveTo(screenX, screenY - 40 + floatY);
    ctx.lineTo(screenX + 12, screenY - 20 + floatY);
    ctx.lineTo(screenX + 12, screenY + 20 + floatY);
    ctx.lineTo(screenX - 12, screenY + 20 + floatY);
    ctx.lineTo(screenX - 12, screenY - 20 + floatY);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name, screenX, screenY - 50 + floatY);
  });
}

// Draw UI overlays
function drawUIOverlays(ctx) {
  const controls = [
    { text: 'WASD/Arrows: Move', x: 10, y: 20 },
    { text: 'SPACE: Attack', x: 10, y: 35 },
    { text: 'M: Mine', x: 10, y: 50 },
  ];
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(5, 5, 120, 65);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px Inter';
  controls.forEach(c => {
    ctx.fillText(c.text, c.x, c.y);
  });
}

// Setup event listeners
function setupEventListeners() {
  // Connect wallet button
  const connectBtn = document.getElementById('connectWalletBtn');
  connectBtn.addEventListener('click', () => {
    if (gameState.isConnected) {
      disconnectWallet();
    } else {
      connectWallet();
    }
  });

  // Mint agent buttons
  const mintBtn = document.getElementById('mintAgentBtn');
  const mintBtn2 = document.getElementById('mintAgentBtn2');
  mintBtn.addEventListener('click', openMintModal);
  mintBtn2.addEventListener('click', handleMint);

  // Close modal
  const closeBtn = document.getElementById('closeModalBtn');
  const cancelBtn = document.getElementById('cancelMintBtn');
  closeBtn.addEventListener('click', closeMintModal);
  cancelBtn.addEventListener('click', closeMintModal);

  // Agent name input
  const nameInput = document.getElementById('agentNameInput');
  nameInput.addEventListener('input', (e) => {
    const charCount = document.getElementById('charCount');
    charCount.textContent = `${e.target.value.length}/32`;
  });

  // Toggle contract details
  const toggleBtn = document.getElementById('toggleContractDetails');
  const details = document.getElementById('contractDetails');
  toggleBtn.addEventListener('click', () => {
    const isHidden = details.style.display === 'none';
    details.style.display = isHidden ? 'block' : 'none';
    toggleBtn.querySelector('.toggle-icon').textContent = isHidden ? '▼' : '▶';
  });

  // Sidebar buttons
  const sidebarButtons = document.querySelectorAll('.sidebar-button[data-panel]');
  sidebarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      setActivePanel(panel);
    });
  });

  // Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn.addEventListener('click', () => {
    alert('Settings panel - Coming soon!');
  });

  // Close modal on overlay click
  const modalOverlay = document.getElementById('mintModal');
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeMintModal();
    }
  });
}

// Wallet functions
function connectWallet() {
  if (gameState.isConnected) {
    console.log('Wallet already connected');
    return;
  }
  
  // Mock connection - instant!
  gameState.isConnected = true;
  gameState.wallet = '0x' + Array(40).fill(0).map(() => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  
  console.log('✅ Wallet connected:', gameState.wallet);
  
  // Update UI
  updateUI();
  
  // Show subtle notification instead of blocking alert
  showNotification('✅ Wallet Connected!');
}

function showNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #00ff88, #00cc66);
    color: #000;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.4);
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function disconnectWallet() {
  gameState.isConnected = false;
  gameState.wallet = null;
  gameState.balance = { eth: 0, tokens: 0 };
  updateUI();
}

// Mint functions
function openMintModal() {
  if (!gameState.isConnected) {
    showError('Connect a wallet first.');
    return;
  }
  
  document.getElementById('mintModal').style.display = 'flex';
  document.getElementById('agentPreviewNumber').textContent = `#${gameState.mintedCount + 1}`;
  document.getElementById('agentNameInput').value = '';
  document.getElementById('charCount').textContent = '0/32';
}

function closeMintModal() {
  document.getElementById('mintModal').style.display = 'none';
  hideError();
}

function handleMint() {
  if (gameState.isMinting || !gameState.isConnected) return;

  const nameInput = document.getElementById('agentNameInput');
  const agentName = nameInput.value || `Agent #${gameState.mintedCount + 1}`;
  const cost = gameState.freeMintsRemaining > 0 ? 0 : GAME_CONFIG.MINT_COST_ETH;

  if (gameState.balance.eth < cost) {
    showError('Insufficient ETH balance');
    return;
  }

  gameState.isMinting = true;
  document.getElementById('mintAgentBtn2').innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
    Minting...
  `;

  // Simulate minting
  setTimeout(() => {
    const newAgent = {
      id: gameState.agents.length + 1,
      name: agentName,
      stats: generateAgentStats(),
      mintedAt: Date.now(),
      level: 1,
      position: { x: GAME_CONFIG.MINING_CENTER, y: GAME_CONFIG.MINING_CENTER },
    };

    gameState.agents.push(newAgent);
    gameState.selectedAgent = newAgent.id;
    gameState.mintedCount++;
    gameState.freeMintsRemaining = Math.max(0, gameState.freeMintsRemaining - 1);
    gameState.isMinting = false;

    if (cost === 0) {
      gameState.balance.tokens -= GAME_CONFIG.PAID_MINT_BURN;
    }

    updateUI();
    closeMintModal();
    drawMinimap();
  }, 2000);
}

// UI functions
function setActivePanel(panel) {
  gameState.activePanel = panel;
  document.querySelectorAll('.sidebar-button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.panel === panel) {
      btn.classList.add('active');
    }
  });
}

function updateUI() {
  // Update wallet button
  const connectBtn = document.getElementById('connectWalletBtn');
  const connectBtnText = document.getElementById('connectBtnText');
  
  if (gameState.isConnected) {
    connectBtn.classList.add('connected');
    connectBtnText.textContent = gameState.wallet.slice(0, 6) + '...' + gameState.wallet.slice(-4);
    document.getElementById('walletInfo').style.display = 'flex';
  } else {
    connectBtn.classList.remove('connected');
    connectBtnText.textContent = 'Connect Wallet';
    document.getElementById('walletInfo').style.display = 'none';
  }

  // Update balances
  document.getElementById('ethBalance').textContent = gameState.balance.eth.toFixed(4) + ' ETH';
  document.getElementById('tokenBalance').textContent = gameState.balance.tokens.toLocaleString() + ' TOKENS';
  document.getElementById('balanceDisplay').textContent = gameState.balance.eth.toFixed(4) + ' ETH';
  
  // Update mining rate indicator
  const miningRateEl = document.getElementById('miningRate');
  if (gameState.selectedAgent) {
    const agent = gameState.agents.find(a => a.id === gameState.selectedAgent);
    if (agent) {
      const dx = agent.position.x - GAME_CONFIG.MINING_CENTER;
      const dy = agent.position.y - GAME_CONFIG.MINING_CENTER;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance >= GAME_CONFIG.MINING_INNER_RADIUS && distance <= GAME_CONFIG.MINING_OUTER_RADIUS) {
        miningRateEl.textContent = `+${gameState.miningRate.toFixed(2)}/s ⛏️`;
        miningRateEl.style.color = 'var(--accent-green)';
      } else {
        miningRateEl.textContent = 'Not in mining area';
        miningRateEl.style.color = 'var(--text-muted)';
      }
    }
  } else {
    miningRateEl.textContent = 'Select agent';
    miningRateEl.style.color = 'var(--text-muted)';
  }

  // Update mint cost
  const cost = gameState.freeMintsRemaining > 0 ? 0 : GAME_CONFIG.MINT_COST_ETH;
  const mintCost = document.getElementById('mintCost');
  mintCost.textContent = cost + ' ETH';
  mintCost.className = 'cost-value ' + (cost > 0 ? 'text-accent' : 'text-green');

  // Update free mint info
  document.getElementById('freeMintCount').textContent = `${gameState.FREE_MINTS - gameState.freeMintsRemaining}/${GAME_CONFIG.FREE_MINTS}`;
  const progress = ((GAME_CONFIG.FREE_MINTS - gameState.freeMintsRemaining) / GAME_CONFIG.FREE_MINTS) * 100;
  document.getElementById('freeMintProgress').style.width = progress + '%';
  document.getElementById('freeMintInfo').textContent = `${gameState.freeMintsRemaining} free mints remaining before ERC20 token burn applies.`;

  // Update agent list
  updateAgentList();
  
  // Update combat log
  updateCombatLog();
}

function updateAgentList() {
  const agentList = document.getElementById('agentList');
  
  if (gameState.agents.length === 0) {
    agentList.innerHTML = `
      <div class="no-agents">
        <p>No agents yet</p>
        <button class="btn btn-primary" id="mintAgentBtn">Mint Agent</button>
      </div>
    `;
    // Rebind the button
    document.getElementById('mintAgentBtn').addEventListener('click', openMintModal);
    return;
  }

  agentList.innerHTML = gameState.agents.map(agent => `
    <div class="agent-item ${gameState.selectedAgent === agent.id ? 'selected' : ''}" data-agent-id="${agent.id}">
      <div class="agent-avatar">#${agent.id}</div>
      <div class="agent-info">
        <div class="agent-name">${agent.name}</div>
        <div class="agent-level">Level ${agent.level}</div>
        <div class="agent-stats-preview">
          <span class="stat-badge hp">❤️ ${agent.stats.hp}</span>
          <span class="stat-badge atk">⚔️ ${agent.stats.atk}</span>
          <span class="stat-badge spd">💨 ${agent.stats.spd}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  agentList.querySelectorAll('.agent-item').forEach(item => {
    item.addEventListener('click', () => {
      gameState.selectedAgent = parseInt(item.dataset.agentId);
      updateAgentList();
      drawMinimap();
    });
  });

  // Add mint button
  agentList.innerHTML += `
    <button class="btn btn-secondary" style="width: 100%; margin-top: 12px;" id="mintAgentBtn2">
      + Mint New Agent
    </button>
  `;
  document.getElementById('mintAgentBtn2').addEventListener('click', openMintModal);
}

// Update combat log display
function updateCombatLog() {
  const combatLogDiv = document.getElementById('combatLog');
  if (!combatLogDiv) return;
  
  if (gameState.combatLog.length === 0) {
    combatLogDiv.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">No combat events yet</p>';
    return;
  }
  
  combatLogDiv.innerHTML = gameState.combatLog.slice(0, 10).map(log => {
    if (log.type === 'attack') {
      return `<div style="font-size: 11px; color: #ff8888;">⚔️ ${log.attacker} hit ${log.target} for ${log.damage} dmg</div>`;
    } else if (log.type === 'kill') {
      return `<div style="font-size: 11px; color: #ff4444;">💀 ${log.message}</div>`;
    }
    return `<div style="font-size: 11px;">${log.message}</div>`;
  }).join('');
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  errorText.textContent = message;
  errorDiv.style.display = 'flex';
}

function hideError() {
  document.getElementById('errorMessage').style.display = 'none';
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', initGame);
