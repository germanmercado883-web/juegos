import { Game } from './core/Game.js';
import { MenuUI, loadSettings } from './ui/Menu.js';

const settings = loadSettings();
const ui = new MenuUI(settings);
const game = new Game(document.getElementById('game'), settings, ui);

// menu music starts on the first tap/click (browsers need a gesture)
const startMenuMusic = () => {
  if (game.state !== 'menu') return;
  game.audio.init();
  game.audio.startMusic();
};
window.addEventListener('pointerdown', startMenuMusic);

let busy = false;
async function play() {
  if (busy) return;
  busy = true;
  game.audio.init(); // needs the click gesture
  if (game.touch && !document.fullscreenElement) {
    // best effort: some browsers / embedded views refuse fullscreen
    try {
      document.documentElement
        .requestFullscreen?.({ navigationUI: 'hide' })
        ?.then(() => screen.orientation?.lock?.('landscape'))
        ?.catch(() => {});
    } catch {
      /* ignore */
    }
  }
  game.audio.stopMusic();
  ui.showLoading();
  try {
    await game.load((p, label) => ui.setProgress(p, label));
    ui.hideAll();
    game.start();
  } catch (err) {
    console.error(err);
    ui.setProgress(0, `ERROR: ${err.message}`);
  } finally {
    busy = false;
  }
}

ui.on('play', play);
ui.on('again', play);
ui.on('resume', () => game.resume());
ui.on('quit', () => {
  game.quitToMenu();
  ui.show('menu');
  game.audio.startMusic();
});
ui.on('settingsChanged', () => game.applySettings());

// handy for debugging from the console
window.__duskvale = game;
