// 🟦 AQUAI Web3 Integration (Base Mainnet)

// Web3 variables
let provider = null;
let signer = null;
let agentContract = null;
let tokenContract = null;
let gameContract = null;

// Contract ABIs
const AGENT_ABI = [
  "function mintAgent(string name, string uri) external payable returns (uint256)",
  "function getAgent(uint256 tokenId) external view returns (tuple(uint256 hp, uint256 atk, uint256 rng, uint256 spd, uint256 regen, uint256 level, uint256 xp, uint256 mintedAt, bool exists))",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function freeMintsRemaining() external view returns (uint256)",
  "function getRemainingSupply() external view returns (uint256)",
  "event AgentMinted(address indexed owner, uint256 indexed tokenId, string name, tuple(uint256 hp, uint256 atk, uint256 rng, uint256 spd, uint256 regen, uint256 level, uint256 xp, uint256 mintedAt, bool exists) stats)"
];

const TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function mineTokens(address miner, uint256 duration) external returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event TokensMined(address indexed miner, uint256 amount)"
];

const GAME_ABI = [
  "function updatePosition(uint256 tokenId, uint256 x, uint256 y) external",
  "function mineTokens(uint256 tokenId) external returns (uint256)",
  "function attack(uint256 attackerTokenId, uint256 targetTokenId) external returns (bool)",
  "function isInMiningRing(uint256 x, uint256 y) external view returns (bool)",
  "event AgentPositionUpdated(uint256 indexed tokenId, uint256 x, uint256 y)",
  "event CombatOccurred(uint256 indexed attackerTokenId, uint256 indexed targetTokenId, uint256 damage, bool killed)",
  "event TokensMined(address indexed player, uint256 amount)"
];

/**
 * Safely get token balance (returns 0 if not available)
 */
async function safeGetTokenBalance() {
  if (!tokenContract || !gameState.wallet) {
    return 0;
  }
  
  const tokenAddress = CONTRACTS.base.AquaiToken;
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    return 0;
  }
  
  try {
    const balance = await tokenContract.balanceOf(gameState.wallet);
    return parseFloat(ethers.formatUnits(balance, 18));
  } catch (error) {
    console.warn('⚠️ Could not get token balance:', error.message);
    return 0;
  }
}

/**
 * Connect MetaMask wallet
 */
async function connectWalletReal() {
  if (gameState.isConnected) {
    console.log('Wallet already connected');
    return;
  }
  
  try {
    // Check if MetaMask is installed
    if (typeof window.ethereum === 'undefined') {
      alert('🦊 MetaMask not installed!\n\nPlease install MetaMask to connect your wallet.\n\nRedirecting to metamask.io...');
      window.open('https://metamask.io/download', '_blank');
      return;
    }
    
    console.log('🦊 Connecting to MetaMask...');
    
    // Create ethers provider
    provider = new ethers.BrowserProvider(window.ethereum);
    
    // Request account access
    const accounts = await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    
    gameState.wallet = accounts[0];
    gameState.isConnected = true;
    
    console.log('✅ Wallet connected:', gameState.wallet);
    
    // Load contracts
    await loadContracts();
    
    // Get ETH balance
    const balance = await provider.getBalance(signer.getAddress());
    gameState.balance.eth = parseFloat(ethers.formatEther(balance));
    
    // Get token balance using safe function
    gameState.balance.tokens = await safeGetTokenBalance();
    
    // Update UI
    updateUI();
    
    // Show notification
    showNotification('✅ Wallet Connected!');
    
    // Check if user has NFTs
    await checkUserNFTs();
    
  } catch (error) {
    console.error('❌ Connection error:', error);
    if (error.code === 4001) {
      alert('You rejected the connection request.');
    } else {
      alert('Failed to connect wallet: ' + error.message);
    }
  }
}

/**
 * Load smart contracts
 */
async function loadContracts() {
  try {
    agentContract = new ethers.Contract(
      CONTRACTS.base.AquaiAgent,
      AGENT_ABI,
      signer
    );
    
    // Only load token contract if address is set (not zero address)
    const tokenAddress = CONTRACTS.base.AquaiToken;
    if (tokenAddress && tokenAddress !== "0x0000000000000000000000000000000000000000" && tokenAddress !== ethers.ZeroAddress) {
      try {
        tokenContract = new ethers.Contract(
          tokenAddress,
          TOKEN_ABI,
          signer
        );
        console.log('✅ Token contract loaded:', tokenAddress);
      } catch (error) {
        console.warn('⚠️ Failed to load token contract:', error.message);
        tokenContract = null;
      }
    } else {
      console.log('ℹ️ Token contract not set (deploy via Clanker first)');
      tokenContract = null;
    }
    
    gameContract = new ethers.Contract(
      CONTRACTS.base.AquaiGame,
      GAME_ABI,
      signer
    );
    
    console.log('✅ Contracts loaded!');
    console.log('  Agent:', CONTRACTS.base.AquaiAgent);
    console.log('  Token:', tokenContract ? CONTRACTS.base.AquaiToken : 'Not set');
    console.log('  Game:', CONTRACTS.base.AquaiGame);
    
    // Listen for events
    setupContractListeners();
    
    // Get free mints remaining
    if (agentContract) {
      const freeMints = await agentContract.freeMintsRemaining();
      gameState.freeMintsRemaining = Number(freeMints);
      console.log('🎁 Free mints remaining:', gameState.freeMintsRemaining);
    }
    
  } catch (error) {
    console.error('❌ Failed to load contracts:', error);
  }
}

/**
 * Setup contract event listeners
 */
function setupContractListeners() {
  if (agentContract) {
    agentContract.on("AgentMinted", (owner, tokenId, name, stats, event) => {
      console.log('🎉 Agent minted:', tokenId.toString(), name);
      if (owner.toLowerCase() === gameState.wallet.toLowerCase()) {
        showNotification(`🎉 Minted Agent #${tokenId.toString()}!`);
        // Refresh user NFTs
        checkUserNFTs();
      }
    });
  }
  
  if (tokenContract) {
    tokenContract.on("TokensMined", (miner, amount, event) => {
      console.log('⛏️ Tokens mined:', miner, ethers.formatUnits(amount, 18));
      if (miner.toLowerCase() === gameState.wallet.toLowerCase()) {
        showNotification(`⛏️ Mined ${ethers.formatUnits(amount, 18)} tokens!`);
      }
    });
  }
}

/**
 * Check user's NFTs
 */
async function checkUserNFTs() {
  if (!agentContract || !gameState.wallet) return;
  
  try {
    const balance = await agentContract.balanceOf(gameState.wallet);
    const nftCount = Number(balance);
    
    console.log('🎨 User has', nftCount, 'NFT(s)');
    
    if (nftCount > 0) {
      // Get each NFT
      for (let i = 0; i < nftCount; i++) {
        // Need to track minted tokens or use events
        // For now, just show count
      }
    }
  } catch (error) {
    console.error('❌ Failed to check NFTs:', error);
  }
}

/**
 * Real mint function (on-chain)
 */
async function mintAgentReal(agentName) {
  if (!agentContract || !gameState.isConnected) {
    throw new Error('Wallet not connected');
  }
  
  try {
    const name = agentName || `Agent #${gameState.mintedCount + 1}`;
    const uri = "ipfs://QmAQUAINFTMetadata"; // Will update with real IPFS later
    
    // Check if free mint or paid
    const cost = gameState.freeMintsRemaining > 0 ? 0n : ethers.parseEther("0.0002");
    
    console.log('🎨 Minting agent...', { name, cost: ethers.formatEther(cost) + ' ETH' });
    
    // Call mint function
    const tx = await agentContract.mintAgent(name, uri, {
      value: cost
    });
    
    console.log('⏳ Waiting for confirmation...', tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    console.log('✅ Mint successful!', receipt);
    
    // Find AgentMinted event
    const mintEvent = receipt.logs.find(log => {
      try {
        const parsed = agentContract.interface.parseLog(log);
        return parsed && parsed.name === 'AgentMinted';
      } catch {
        return false;
      }
    });
    
    if (mintEvent) {
      const parsed = agentContract.interface.parseLog(mintEvent);
      const tokenId = parsed.args.tokenId.toString();
      const stats = parsed.args.stats;
      
      console.log('🎉 Agent minted!', { tokenId, stats });
      
      // Update game state
      gameState.mintedCount++;
      if (gameState.freeMintsRemaining > 0) {
        gameState.freeMintsRemaining--;
      }
      
      // Add agent to game
      const newAgent = {
        id: parseInt(tokenId),
        name: name,
        tokenId: tokenId,
        owner: gameState.wallet,
        level: 1,
        stats: {
          hp: Number(stats.hp),
          atk: Number(stats.atk),
          rng: Number(stats.rng),
          spd: Number(stats.spd),
          regen: Number(stats.regen)
        },
        position: { x: GAME_CONFIG.MINING_CENTER, y: GAME_CONFIG.MINING_CENTER }
      };
      
      gameState.agents.push(newAgent);
      gameState.selectedAgent = newAgent.id;
      
      return newAgent;
    }
    
  } catch (error) {
    console.error('❌ Mint failed:', error);
    throw error;
  }
}

/**
 * Real mine function (on-chain)
 */
async function mineTokensReal(tokenId) {
  if (!gameContract || !gameState.isConnected) {
    throw new Error('Wallet not connected');
  }
  
  try {
    console.log('⛏️ Mining tokens...');
    
    const tx = await gameContract.mineTokens(tokenId);
    const receipt = await tx.wait();
    
    console.log('✅ Mining successful!', receipt);
    
    // Parse event
    const mineEvent = receipt.logs.find(log => {
      try {
        const parsed = gameContract.interface.parseLog(log);
        return parsed && parsed.name === 'TokensMined';
      } catch {
        return false;
      }
    });
    
    if (mineEvent) {
      const parsed = gameContract.interface.parseLog(mineEvent);
      const amount = parseFloat(ethers.formatUnits(parsed.args.amount, 18));
      console.log('⛏️ Mined', amount, 'tokens');
      gameState.balance.tokens += amount;
      return amount;
    }
    
  } catch (error) {
    console.error('❌ Mining failed:', error);
    throw error;
  }
}

/**
 * Real attack function (on-chain)
 */
async function attackReal(attackerTokenId, targetTokenId) {
  if (!gameContract || !gameState.isConnected) {
    throw new Error('Wallet not connected');
  }
  
  try {
    console.log('⚔️ Attacking...', { attackerTokenId, targetTokenId });
    
    const tx = await gameContract.attack(attackerTokenId, targetTokenId);
    const receipt = await tx.wait();
    
    console.log('✅ Attack successful!', receipt);
    
    // Parse event
    const combatEvent = receipt.logs.find(log => {
      try {
        const parsed = gameContract.interface.parseLog(log);
        return parsed && parsed.name === 'CombatOccurred';
      } catch {
        return false;
      }
    });
    
    if (combatEvent) {
      const parsed = gameContract.interface.parseLog(combatEvent);
      const damage = Number(parsed.args.damage);
      const killed = parsed.args.killed;
      console.log('⚔️ Dealt', damage, 'damage', killed ? '(KILLED!)' : '');
      return { damage, killed };
    }
    
  } catch (error) {
    console.error('❌ Attack failed:', error);
    throw error;
  }
}

/**
 * Update position on-chain
 */
async function updatePositionReal(tokenId, x, y) {
  if (!gameContract || !gameState.isConnected) {
    return; // Don't throw, just skip (position update is frequent)
  }
  
  try {
    const tx = await gameContract.updatePosition(tokenId, x, y);
    await tx.wait();
    console.log('📍 Position updated:', { x, y });
  } catch (error) {
    // Silently fail (gas optimization)
  }
}

/**
 * Disconnect wallet
 */
function disconnectWalletReal() {
  gameState.isConnected = false;
  gameState.wallet = null;
  gameState.balance = { eth: 0, tokens: 0 };
  provider = null;
  signer = null;
  agentContract = null;
  tokenContract = null;
  gameContract = null;
  updateUI();
  console.log('🔌 Wallet disconnected');
}
