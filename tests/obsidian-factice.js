// Charge main.js hors d'Obsidian, pour éprouver les méthodes statiques.
// Le greffon demande le module « obsidian » à son chargement : on intercepte
// cette demande et on rend un objet dont chaque propriété est une classe vide.
// Cela suffit aux « extends » et aux quelques constantes lues au chargement.
const Module = require('module');

const classes = {};
const factice = new Proxy({}, {
  get(_, nom) {
    if (nom === 'Platform') return { isMacOS: true, isDesktopApp: true };
    if (nom === 'setIcon') return () => {};
    if (!classes[nom]) classes[nom] = class { constructor() {} };
    return classes[nom];
  },
});

const charger = Module._load;
Module._load = function (demande) {
  return demande === 'obsidian' ? factice : charger.apply(this, arguments);
};

module.exports = require('../main.js');
