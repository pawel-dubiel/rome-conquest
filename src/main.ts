import './style.css';
import { Game } from './core/Game';
import { StrategyScene } from './scenes/StrategyScene';

// Create app container if it doesn't exist
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  // Clear any existing content
  app.innerHTML = '';
}

const game = new Game('app');

// Switch to StrategyScene
game.sceneMgr.switchScene(new StrategyScene());
