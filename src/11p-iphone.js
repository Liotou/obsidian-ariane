// ── avecIphone ────────────────────────────────────────────────────────────
// Domaine : le temps d'écran de l'iPhone, lu sur le Mac.
// Avec « Partager entre les appareils » (Temps d'écran), l'iPhone envoie au
// Mac, surtout la nuit, chaque passage d'une application au premier plan :
// flux Biome « App.InFocus », dossier remote/<appareil>. Ariane lit ces
// fichiers (format SEGB d'Apple, non documenté, contenu protobuf) et en fait
// des segments d'activité, rangés par les mêmes règles que ceux
// d'ActivityWatch, sur la même ligne des créneaux hors Obsidian. Le Mac est
// prioritaire : le téléphone utilisé pendant que le Mac l'est ne compte pas
// deux fois, il est noté comme une interruption du créneau du Mac.
// Il faut à Obsidian l'« Accès complet au disque ».
const avecIphone = (Base) => class extends Base {
  //#region Ariane · iPhone (statique)
  // ── format SEGB et protobuf : fonctions pures ───────────────────────────

  // Les enregistrements d'un fichier SEGB (version 2) : en-tête de 32 octets
  // (« SEGB », nombre d'enregistrements, date), les enregistrements à la
  // suite, et en fin de fichier une table de 16 octets par enregistrement,
  // lue à rebours : fin (relative au début des données), état (1 : valide),
  // date. Chaque enregistrement commence sur 8 octets et porte 8 octets
  // d'en-tête (somme de contrôle, longueur) avant son message protobuf.
  // Rend [{ a, z }] (bornes du message dans `o`), ou null si ce n'est pas un
  // fichier SEGB lisible.
  static lireSEGB(o) {
    const b = o instanceof Uint8Array ? o : new Uint8Array(o || []);
    if (b.length < 48 || b[0] !== 0x53 || b[1] !== 0x45 || b[2] !== 0x47 || b[3] !== 0x42) return null;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const n = v.getUint32(4, true);
    if (!n || 32 + 16 * n > b.length) return null;
    const out = [];
    let fin = 0;
    for (let i = 0; i < n; i++) {
      const t = b.length - 16 * (i + 1);
      const z = v.getUint32(t, true);
      const etat = v.getUint32(t + 4, true);
      const a = Math.ceil(fin / 8) * 8;
      if (z < a + 8 || 32 + z > t) break;
      fin = z;
      if (etat !== 1) continue;
      out.push({ a: 32 + a + 8, z: 32 + z });
    }
    return out;
  }

  // Les champs d'un message protobuf b[a, z[ : Map(numéro → [valeurs]).
  // varint en nombre, 64 bits en double, longueur en octets. S'arrête sur un
  // octet nul (remplissage) ou une incohérence, en gardant ce qui précède.
  static champsProtobuf(b, a, z) {
    const champs = new Map();
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let i = a;
    const varint = () => {
      let r = 0;
      let m = 1;
      for (let k = 0; k < 10; k++) {
        if (i >= z) throw new Error('varint');
        const c = b[i++];
        r += (c & 0x7f) * m;
        m *= 128;
        if (!(c & 0x80)) return r;
      }
      throw new Error('varint');
    };
    const poser = (n, x) => { if (!champs.has(n)) champs.set(n, []); champs.get(n).push(x); };
    try {
      while (i < z) {
        if (b[i] === 0) break;
        const cle = varint();
        const n = Math.floor(cle / 8);
        const t = cle % 8;
        if (!n) break;
        if (t === 0) poser(n, varint());
        else if (t === 1) { if (i + 8 > z) break; poser(n, v.getFloat64(i, true)); i += 8; }
        else if (t === 2) { const l = varint(); if (i + l > z) break; poser(n, b.subarray(i, i + l)); i += l; }
        else if (t === 5) { if (i + 4 > z) break; poser(n, v.getFloat32(i, true)); i += 4; }
        else break;
      }
    } catch (e) { /* message tronqué : on garde le début */ }
    return champs;
  }

  // Les passages au premier plan d'un fichier « App.InFocus » : [{ t (ms),
  // bundle, ouvre }]. Champ 6 : l'application ; 4 : la date (secondes
  // depuis 2001) ; 3 : 1 à l'ouverture, 0 (ou absent) à la fermeture.
  static evenementsInFocus(o) {
    const b = o instanceof Uint8Array ? o : new Uint8Array(o || []);
    const recs = Ariane.lireSEGB(b);
    if (!recs) return null;
    const dec = new TextDecoder('utf-8');
    const out = [];
    for (const r of recs) {
      const c = Ariane.champsProtobuf(b, r.a, r.z);
      const app = c.get(6);
      const t = c.get(4);
      if (!app || !t || !(app[0] instanceof Uint8Array) || typeof t[0] !== 'number') continue;
      const s = t[0];
      if (!(s > 6e8 && s < 1.2e9)) continue;
      out.push({ t: Math.round((s + 978307200) * 1000), bundle: dec.decode(app[0]), ouvre: (c.get(3) || [0])[0] === 1 });
    }
    return out.sort((x, y) => x.t - y.t);
  }

  // Ce qui n'est pas une application : écran d'accueil, verrouillage, centre
  // de contrôle, recherche, gestes du système. Leur ouverture clôt
  // l'application en cours.
  static estSystemeIphone(bundle) {
    return /^(com\.apple\.(springboard|SpringBoard|SleepLockScreen|control-center|Spotlight|CarPlayApp|lockscreen|ScreenshotServicesService|siri)|com\.apple\.springboard\b)/i.test(String(bundle || ''))
      || /\.(transitionReason|backlight)\./i.test(String(bundle || ''));
  }

  // Les plages d'usage des applications : [{ bundle, deb, fin }] en ms.
  // Une application court de son ouverture à sa fermeture, ou à l'ouverture
  // d'autre chose ; au plus `maxMin` minutes sans nouvel événement (écran
  // éteint sans fermeture notée). Les éléments du système sont écartés, et
  // les plages de moins de `minSec` secondes.
  static plagesIphone(evts, opts) {
    const o = Object.assign({ maxMin: 30, minSec: 5 }, opts || {});
    const out = [];
    let cour = null;
    const clore = (t) => {
      if (!cour) return;
      const fin = Math.min(t, cour.deb + o.maxMin * 60000);
      if (fin - cour.deb >= o.minSec * 1000 && !Ariane.estSystemeIphone(cour.bundle)) out.push({ bundle: cour.bundle, deb: cour.deb, fin });
      cour = null;
    };
    for (const e of (evts || [])) {
      if (e.ouvre) {
        if (cour && cour.bundle === e.bundle) continue;
        clore(e.t);
        cour = { bundle: e.bundle, deb: e.t };
      } else if (cour && cour.bundle === e.bundle) {
        clore(e.t);
      }
    }
    if (cour) clore(cour.deb + o.maxMin * 60000);
    return out;
  }

  // Le nom lisible d'une application de l'iPhone d'après son identifiant.
  static nomAppIphone(bundle) {
    const b = String(bundle || '');
    const connus = {
      'com.apple.mobilemail': 'Mail', 'com.apple.MobileSMS': 'Messages', 'com.apple.mobilesafari': 'Safari',
      'com.apple.mobilecal': 'Calendrier', 'com.apple.Maps': 'Plans', 'com.apple.camera': 'Appareil photo',
      'com.apple.mobileslideshow': 'Photos', 'com.apple.Music': 'Musique', 'com.apple.InCallService': 'Téléphone',
      'com.apple.mobilephone': 'Téléphone', 'com.apple.Preferences': 'Réglages', 'com.apple.PassbookUIService': 'Cartes',
      'com.apple.Passbook': 'Cartes', 'com.apple.reminders': 'Rappels', 'com.apple.mobilenotes': 'Notes',
      'com.apple.Health': 'Santé', 'com.apple.weather': 'Météo', 'com.apple.podcasts': 'Podcasts', 'com.apple.news': 'News',
      'com.apple.AppStore': 'App Store', 'com.apple.facetime': 'FaceTime', 'com.apple.DocumentsApp': 'Fichiers',
      'com.apple.shortcuts': 'Raccourcis', 'com.apple.MobileAddressBook': 'Contacts', 'com.apple.mobiletimer': 'Horloge',
      'com.apple.calculator': 'Calculette', 'com.apple.VoiceMemos': 'Dictaphone', 'com.apple.tv': 'TV', 'com.apple.Fitness': 'Forme',
      'com.apple.findmy': 'Localiser', 'com.apple.Translate': 'Traduire', 'com.apple.journal': 'Journal', 'com.apple.Home': 'Maison',
      'com.google.ios.youtube': 'YouTube', 'com.burbn.instagram': 'Instagram', 'com.linkedin.LinkedIn': 'LinkedIn',
      'com.reddit.Reddit': 'Reddit', 'net.whatsapp.WhatsApp': 'WhatsApp', 'com.automattic.beeper': 'Beeper',
      'ai.perplexity.app': 'Perplexity', 'fr.leboncoin.Leboncoin': 'Leboncoin', 'lt.manodrabuziai.fr': 'Vinted',
      'com.google.Maps': 'Google Maps', 'com.spotify.client': 'Spotify', 'com.atebits.Tweetie2': 'X',
      'com.facebook.Facebook': 'Facebook', 'com.facebook.Messenger': 'Messenger', 'com.toyopagroup.picaboo': 'Snapchat',
      'com.zhiliaoapp.musically': 'TikTok', 'ph.telegra.Telegraph': 'Telegram', 'org.whispersystems.signal': 'Signal',
      'com.microsoft.Office.Outlook': 'Outlook', 'com.microsoft.skype.teams': 'Teams', 'com.anthropic.claude': 'Claude',
      'com.openai.chat': 'ChatGPT', 'com.netflix.Netflix': 'Netflix', 'com.deezer.Deezer': 'Deezer',
      'com.google.Gmail': 'Gmail', 'com.google.chrome.ios': 'Chrome', 'md.obsidian': 'Obsidian', 'org.zotero.ios': 'Zotero',
    };
    if (connus[b]) return connus[b];
    let d = b.split('.').filter((x) => !/^(com|fr|org|net|io|app|ios|iphone|mobile|ai|co|lt|de|uk)$/i.test(x)).pop() || b;
    d = d.replace(/^mobile(?=[a-z])/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
    return d.charAt(0).toUpperCase() + d.slice(1);
  }

  // Les plages de l'iPhone d'une journée [d0, d1[ en segments d'activité,
  // le Mac d'abord : la part d'une plage qui recouvre un segment du Mac
  // n'en est pas un, mais une interruption. Rend { segs, interruptions }.
  static segmentsIphone(plages, segsMac, d0, d1) {
    const occupe = Ariane.fusionnerIntervalles((segsMac || []).map((s) => [s.deb, s.fin]));
    const segs = [];
    const interruptions = [];
    for (const p of (plages || [])) {
      const a = Math.max(p.deb, d0);
      const z = Math.min(p.fin, d1);
      if (!(z > a)) continue;
      const app = Ariane.nomAppIphone(p.bundle) + ' (iPhone)';
      for (const [x, y] of Ariane.couperParIntervallesInverses(a, z, occupe)) {
        if (y > x) segs.push({ deb: x, fin: y, app, titre: '', url: '', appareil: 'iphone' });
      }
      for (const [x, y] of Ariane.couperParIntervalles(a, z, occupe)) {
        if (y - x >= 10000) interruptions.push({ deb: x, fin: y, app: Ariane.nomAppIphone(p.bundle) });
      }
    }
    return { segs, interruptions };
  }

  // Les interruptions de l'iPhone pendant un créneau du Mac, par
  // application : [{ app, min }] (une minute au moins en tout).
  static interruptionsDuBloc(interruptions, debMs, finMs) {
    const parApp = new Map();
    for (const x of (interruptions || [])) {
      const ms = Math.min(x.fin, finMs) - Math.max(x.deb, debMs);
      if (ms > 0) parApp.set(x.app, (parApp.get(x.app) || 0) + ms);
    }
    return [...parApp].map(([app, ms]) => ({ app, min: Math.round(ms / 60000) }))
      .filter((x) => x.min >= 1).sort((a, b) => b.min - a.min);
  }

  //#endregion Ariane · iPhone (statique)

  //#region Ariane · iPhone (lecture)
  // ── lecture des fichiers sur le Mac ─────────────────────────────────────

  iphoneActif() {
    return !!(this.settings.iphoneActif && obsidian.Platform.isMacOS && obsidian.Platform.isDesktopApp);
  }

  _dossierInFocus() {
    return require('path').join(require('os').homedir(), 'Library/Biome/streams/restricted/App.InFocus');
  }

  // L'appareil iOS : celui des appareils distants dont le fichier le plus
  // récent parle d'applications d'iPhone (Messages, Mail, écran d'accueil).
  _appareilIphone(fs, path, base) {
    const regle = String(this.settings.iphoneAppareil || '').trim();
    if (regle) return regle;
    if (this._iphoneAppareil) return this._iphoneAppareil;
    let meilleur = null;
    for (const d of fs.readdirSync(path.join(base, 'remote'))) {
      const dir = path.join(base, 'remote', d);
      let fichiers = [];
      try { fichiers = fs.readdirSync(dir).filter((f) => /^\d+$/.test(f)).map((f) => path.join(dir, f)); } catch (e) { continue; }
      if (!fichiers.length) continue;
      const recent = fichiers.reduce((x, y) => (fs.statSync(x).mtimeMs >= fs.statSync(y).mtimeMs ? x : y));
      const ev = Ariane.evenementsInFocus(fs.readFileSync(recent)) || [];
      const ios = ev.filter((e) => /^com\.apple\.(mobile|MobileSMS|springboard|SpringBoard|InCallService)/.test(e.bundle)).length;
      if (ios && (!meilleur || ios > meilleur.ios)) meilleur = { d, ios };
    }
    this._iphoneAppareil = meilleur ? meilleur.d : '';
    return this._iphoneAppareil;
  }

  // Toutes les plages lues, gardées par fichier (taille, date) : seul un
  // fichier changé est relu.
  plagesIphoneLues() {
    if (!this.iphoneActif()) return [];
    const fs = require('fs');
    const path = require('path');
    const base = this._dossierInFocus();
    const cache = this._iphoneFichiers || (this._iphoneFichiers = new Map());
    try {
      const appareil = this._appareilIphone(fs, path, base);
      if (!appareil) return [];
      const dir = path.join(base, 'remote', appareil);
      const evts = [];
      const vus = new Set();
      for (const f of fs.readdirSync(dir).filter((x) => /^\d+$/.test(x))) {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        const sig = st.size + ':' + st.mtimeMs;
        vus.add(p);
        let c = cache.get(p);
        if (!c || c.sig !== sig) {
          c = { sig, evts: Ariane.evenementsInFocus(fs.readFileSync(p)) || [] };
          cache.set(p, c);
        }
        evts.push(...c.evts);
      }
      for (const k of [...cache.keys()]) if (!vus.has(k)) cache.delete(k);
      const sig = [...cache.values()].map((c) => c.sig).join('|');
      if (this._iphonePlages && this._iphonePlages.sig === sig) return this._iphonePlages.plages;
      evts.sort((x, y) => x.t - y.t);
      const plages = Ariane.plagesIphone(evts);
      this._iphonePlages = { sig, plages };
      this._iphoneErreur = '';
      return plages;
    } catch (e) {
      const acces = e && (e.code === 'EPERM' || e.code === 'EACCES');
      const msg = acces ? 'acces' : ((e && e.message) || String(e));
      if (this._iphoneErreur !== msg) {
        this._iphoneErreur = msg;
        new obsidian.Notice(acces
          ? tr("Temps d'écran de l'iPhone : Obsidian n'a pas le droit de lire ces données. Donnez-lui l'« Accès complet au disque » (Réglages système, Confidentialité et sécurité), puis relancez Obsidian.")
          : tr("Temps d'écran de l'iPhone illisible : ") + msg, 12000);
      }
      return [];
    }
  }

  // Les segments de l'iPhone d'un jour, et ses interruptions, à joindre à
  // ceux du Mac.
  iphoneDuJour(jour, segsMac) {
    const d0 = new Date(jour + 'T00:00:00').getTime();
    const d1 = new Date(Ariane.decalerJour(jour, 1) + 'T00:00:00').getTime();
    const plages = this.plagesIphoneLues().filter((p) => p.fin > d0 && p.deb < d1);
    return Ariane.segmentsIphone(plages, segsMac, d0, d1);
  }

  // Ce qu'un créneau doit à l'iPhone, dans une carte ou une fiche : une
  // étiquette (pictogramme de téléphone et minutes) dans `tete`, et la ligne
  // des interruptions dans `corps`. Rien si le créneau ne lui doit rien.
  marquesIphone(tete, corps, b, cls) {
    const c = cls || {};
    if (b.iphoneMin) {
      const et = tete.createSpan({ cls: (c.etiquette || 'zfa-act-meta') + ' zfa-iphone-et',
        attr: { 'aria-label': tr('Dont temps sur l’iPhone') } });
      obsidian.setIcon(et.createSpan({ cls: 'zfa-iphone-ic' }), 'smartphone');
      et.createSpan({ text: dureeLisible(b.iphoneMin) });
    }
    if (b.interruptions && b.interruptions.length && !c.sansInterruptions) {
      const l = corps.createDiv({ cls: (c.ligne || 'zfa-act-survol-resume') + ' zfa-iphone-inter' });
      obsidian.setIcon(l.createSpan({ cls: 'zfa-iphone-ic' }), 'smartphone');
      l.createSpan({ text: tr('Interrompu par l’iPhone : ') + b.interruptions.map((x) => x.app + ' (' + dureeLisible(x.min) + ')').join(', ') });
    }
  }

  //#endregion Ariane · iPhone (lecture)
};
