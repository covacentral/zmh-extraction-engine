const { default: makeWASocket } = require('@whiskeysockets/baileys');
console.log(Object.keys(makeWASocket({}).constructor.prototype || {}).filter(k => k.toLowerCase().includes('catalog')));
