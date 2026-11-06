'use strict';
const { standard_32: tokens } = require('../shell/shared/titlebar_contract.json');
function primaryWindowOptions(platform) {
  if (platform === 'darwin') return {
    titleBarStyle: 'hidden',
    // Move the native group only. Never change native bezel size or paint HTML controls.
    // Position uses reference geometry; native SDK26.5 vs target27.0 remains an open QA gate.
    trafficLightPosition: { x: tokens.traffic_center_x[0] - tokens.observed_bezel_diameter / 2, y: Math.round(tokens.center_y - tokens.observed_bezel_diameter / 2) }
  };
  if (platform === 'win32') return { titleBarStyle: 'hidden', titleBarOverlay: { height: tokens.height, color: '#141821', symbolColor: '#f8fafc' }, autoHideMenuBar: true };
  return { autoHideMenuBar: true };
}
module.exports = { primaryWindowOptions };
