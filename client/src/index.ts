import { SocketClient } from './socket-client.js';
import { Game } from './game.js';

// Initialize UI elements
const usernameScreen = document.getElementById('username-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username-input') as HTMLInputElement;
const joinButton = document.getElementById('join-button');
const canvas = document.getElementById('playing-field') as HTMLCanvasElement;

if (!usernameScreen || !gameScreen || !usernameInput || !joinButton || !canvas) {
  throw new Error('Required DOM elements not found');
}

// Initialize socket client with URL from environment variable
const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
const socketClient = new SocketClient(serverUrl);

// Initialize game
let game: Game | null = null;

// Handle join button click
joinButton.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (!username) {
    alert('Please enter a username');
    return;
  }
  
  // Limit username length (matches server validation)
  const sanitizedUsername = username.slice(0, 20);

  // Use connection event instead of polling
  if (socketClient.isConnected()) {
    initializeGame(sanitizedUsername);
  } else {
    // Wait for connection
    const unsubscribe = socketClient.on('connect', () => {
      unsubscribe();
      initializeGame(sanitizedUsername);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (!socketClient.isConnected()) {
        unsubscribe();
        alert('Failed to connect to server. Please refresh and try again.');
      }
    }, 5000);
  }
});

function initializeGame(username: string): void {
  // Hide username screen, show game screen
  usernameScreen!.classList.add('hidden');
  gameScreen!.classList.remove('hidden');

  // Initialize game BEFORE joining so handlers are ready
  game = new Game(canvas, socketClient);
  
  // Set current player ID
  const playerId = socketClient.getSocketId();
  game.setCurrentPlayer(playerId);

  // Get random starting position (top-down view)
  const startPosition = {
    x: Math.random() * 400 - 200,
    y: Math.random() * 400 - 200,
  };
  
  // Now join game - handlers are ready to receive GAME_STATE
  socketClient.join(username, startPosition);
}

// Handle Enter key in username input
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinButton.click();
  }
});

