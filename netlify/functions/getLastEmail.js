require("dotenv").config();
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");

// Delay aleatorio entre 1s y 7s
function delayRandom() {
  const delayTime = Math.floor(Math.random() * (7000 - 1000 + 1)) + 1000;
  return new Promise(res => setTimeout(res, delayTime));
}

const IMAP_CONFIG = {
  imap: {
    user: process.env.GMAIL_USER,
    password: process.env.GMAIL_APP_PASSWORD,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }, // 💡 Solución al error SSL
    authTimeout: 10000
  }
};

const disneySubjects = [
  "amazon.com: Sign-in attempt",
  "Your one-time passcode for Disney+",
  "Tu código de acceso único para Disney+"
];

const netflixSubjects = [
  "Tu código de acceso temporal de Netflix",
  "Completa tu solicitud de cambio de contraseña",
  "Completa tu solicitud de restablecimiento de contraseña"
];

const netflixPreferredLinks = [
  "https://www.netflix.com/account/travel/verify?nftoken=",
  "https://www.netflix.com/account/update-primary-location?nftoken=",
  "https://www.netflix.com/password?g="
];

function extractLinkFromText(text, validLinks) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s\)\]]+)/g;
  const matches = text.match(urlRegex);
  if (!matches) return null;

  for (let pref of validLinks) {
    const found = matches.find(m => m.includes(pref));
    if (found) return found.replace(/\]$/, "");
  }

  return matches[0].replace(/\]$/, "");
}

exports.handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const emailToCheck = (body.email || "").toLowerCase();
    if (!emailToCheck) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el campo 'email'" }) };
    }

    const connection = await imaps.connect(IMAP_CONFIG);
    await connection.openBox("INBOX");
    await delayRandom();

    const messages = await connection.search(["ALL"], { bodies: [""], struct: true, markSeen: false });
    if (!messages || messages.length === 0) {
      await connection.end();
      return { statusCode: 404, body: JSON.stringify({ message: "No hay mensajes en la bandeja" }) };
    }

    messages.sort((a, b) => {
      const da = a.attributes && a.attributes.date ? new Date(a.attributes.date) : new Date();
      const db = b.attributes && b.attributes.date ? new Date(b.attributes.date) : new Date();
      return db - da;
    });

    const now = Date.now();
    const limit = Math.min(messages.length, 30);

    for (let i = 0; i < limit; i++) {
      const msg = messages[i];
      const raw = msg.parts && msg.parts.length ? msg.parts[0].body : null;
      const parsed = await simpleParser(raw || "");

      const toHeader = parsed.to?.value?.map(v => v.address).join(",") || parsed.headers.get("to") || "";
      const subject = parsed.subject || "";
      const timestamp = new Date(parsed.date || msg.attributes?.date || new Date()).getTime();
      const isToTarget = toHeader.toLowerCase().includes(emailToCheck);
      const isRecent = (now - timestamp) <= 10 * 60 * 1000;

      // Disney+
      if (isToTarget && isRecent && disneySubjects.some(s => subject.includes(s))) {
        const bodyHtml = parsed.html || parsed.text || "";
        await connection.end();
        return { statusCode: 200, body: JSON.stringify({ alert: "Código Disney+ encontrado", body: bodyHtml }) };
      }

      // Netflix
      if (isToTarget && isRecent && netflixSubjects.some(s => subject.includes(s))) {
        const textBody = parsed.text || parsed.html || "";
        const link = extractLinkFromText(textBody, netflixPreferredLinks);
        if (link) {
          await connection.end();
          return { statusCode: 200, body: JSON.stringify({ link: link }) };
        }
      }
    }

    await connection.end();
    return { statusCode: 404, body: JSON.stringify({ message: "No se encontró un resultado para tu cuenta" }) };
  } catch (error) {
    console.error("ERROR FUNCION:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || String(error) }) };
  }
};
