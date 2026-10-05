import { Audio } from './core/Audio.js';
import { loadSave } from './core/Save.js';
import { Game } from './core/Game.js';
import { Screens } from './ui/Screens.js';

const save = loadSave();
const audio = new Audio();
audio.volume = save.settings.volume;
audio.musicVolume = save.settings.music;

const screens = new Screens(save, audio);
const game = new Game(save, audio, screens);
screens.attach(game);

// handy for debugging from the console
window.__inkfall = { game, screens, save };
