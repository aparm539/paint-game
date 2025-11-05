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

  // Wait for connection first
  const checkConnection = setInterval(() => {
    if (socketClient.isConnected()) {
      clearInterval(checkConnection);
      
      console.log('Connected to server, socket ID:', socketClient.getSocketId());
      
      // Hide username screen, show game screen
      usernameScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');

      // Initialize game BEFORE joining so handlers are ready
      game = new Game(canvas, socketClient);
      
      // Set current player ID
      const playerId = socketClient.getSocketId();
      console.log('Setting current player ID:', playerId);
      game.setCurrentPlayer(playerId);

      // Get random starting position (top-down view)
      const startPosition = {
        x: Math.random() * 400 - 200,
        y: Math.random() * 400 - 200,
      };

      console.log('Joining game with username:', username, 'at position:', startPosition);
      
      // Now join game - handlers are ready to receive GAME_STATE
      socketClient.join(username, startPosition);
    }
  }, 100);

  // Timeout after 5 seconds
  setTimeout(() => {
    clearInterval(checkConnection);
    if (!socketClient.isConnected()) {
      alert('Failed to connect to server. Please refresh and try again.');
    }
  }, 5000);
});

// Handle Enter key in username input
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinButton.click();
  }
});

