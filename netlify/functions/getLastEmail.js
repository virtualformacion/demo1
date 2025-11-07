// netlify/functions/readMail.js
require("dotenv").config();
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");

// Genera un delay aleatorio entre 1s y 10s (tu código original usaba 1-10s)
function delayRandom() {
  const delayTime = Math.floor(Math.random() * (10000 - 1000 + 1)) + 1000;
  return new Promise(res => setTimeout(res, delayTime));
}

const IMAP_CONFIG = {
  imap: {
    user: process.env.GMAIL_USER,
    password: process.env.GMAIL_APP_PASSWORD, // App Password
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    authTimeout: 3000
  },
  onerror: (err) => console.error("IMAP ERROR:", err)
};

// Asuntos y enlaces que usas en tu lógica
const disneySubjects = [
  "amazon.com: Sign-in attempt",
  "amazon.com: Intento de inicio de sesión",
  "Your one-time passcode for Disney+",
  "Netflix: Tu código de inicio de sesión",
  "Tu código de acceso único para Disney+"
];

const netflixSubjects = [
  "Importante: Cómo actualizar tu Hogar con Netflix",
  "Importante: Cómo cambiar tu Hogar con Netflix",
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
  // Buscar preferidos primero
  for (let pref of validLinks) {
    const found = matches.find(m => m.includes(pref));
    if (found) return found.replace(/\]$/, "");
  }
  // Fallback: devolver el primer match
  return matches[0].replace(/\]$/, "");
}

exports.handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const emailToCheck = (body.email || "").toLowerCase();
    if (!emailToCheck) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el campo 'email' en el body" }) };
    }

    // Conectar a IMAP
    const connection = await imaps.connect(IMAP_CONFIG);
    await connection.openBox("INBOX");

    // Pausa aleatoria antes de buscar (como tenías)
    await delayRandom();

    // Buscar mensajes recientes (últimos 50) para revisar por asunto
    // Usamos 'ALL' y luego filtramos por fecha/timestamp en JS
    const searchCriteria = ["ALL"];
    const fetchOptions = { bodies: [""], struct: true, markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);

    if (!messages || messages.length === 0) {
      await connection.end();
      return { statusCode: 404, body: JSON.stringify({ message: "No hay mensajes en la bandeja" }) };
    }

    // Ordenar mensajes por fecha descendente (los más recientes primero)
    messages.sort((a, b) => {
      const da = a.attributes && a.attributes.date ? new Date(a.attributes.date) : new Date();
      const db = b.attributes && b.attributes.date ? new Date(b.attributes.date) : new Date();
      return db - da;
    });

    const now = Date.now();

    // Recorremos hasta un límite (ej. 30 mensajes) para no exceder tiempo
    const limit = Math.min(messages.length, 30);

    for (let i = 0; i < limit; i++) {
      const msg = messages[i];
      // msg.parts[0].body contiene el raw; usamos mailparser para parsear el correo
      const raw = msg.parts && msg.parts.length ? msg.parts[0].body : null;
      // Si imap-simple ya trae streaming body, también funciona con simpleParser
      const parsed = await simpleParser(raw || "");

      const toHeader = (parsed.to && parsed.to.value && parsed.to.value.length) ? parsed.to.value.map(v => v.address).join(", ") : (parsed.headers.get("to") || "");
      const subject = parsed.subject || "";
      const dateHeader = parsed.date || (msg.attributes && msg.attributes.date) || new Date();
      const timestamp = new Date(dateHeader).getTime();

      console.log("-> Revisando mensaje:", { subject, toHeader, date: dateHeader });

      // Comprobaciones comunes
      const isToTarget = toHeader && toHeader.toLowerCase().includes(emailToCheck);
      const isRecent = (now - timestamp) <= 10 * 60 * 1000; // 10 minutos

      // ------------- Disney+ -------------
      if (isToTarget && isRecent && disneySubjects.some(s => subject.includes(s))) {
        // Obtenemos el cuerpo HTML si existe, si no el texto
        const bodyHtml = parsed.html || parsed.text || parsed.textAsHtml || "";
        await connection.end();
        return {
          statusCode: 200,
          body: JSON.stringify({ alert: "Código de Disney+ encontrado", body: bodyHtml })
        };
      }

      // ------------- Netflix -------------
      if (isToTarget && isRecent && netflixSubjects.some(s => subject.includes(s))) {
        const textBody = parsed.text || parsed.html || "";
        const link = extractLinkFromText(textBody, netflixPreferredLinks);
        if (link) {
          await connection.end();
          return {
            statusCode: 200,
            body: JSON.stringify({ link: link.replace(/\]$/, "") })
          };
        }
      }
    }

    await connection.end();
    return { statusCode: 404, body: JSON.stringify({ message: "No se encontró un resultado para tu cuenta, vuelve a intentar nuevamente" }) };
  } catch (error) {
    console.error("ERROR FUNCION:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || String(error) }) };
  }
};
