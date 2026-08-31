/**
 * Smart Extractor for WhatsApp Channel (Newsletter) Posts
 * Parses post captions and media to generate structured catalog products.
 */

function parsePrice(text, type = 'normal') {
  if (!text) return 0;

  // Specific regex for retail (detal) vs wholesale (mayorista)
  let regex;
  if (type === 'wholesale') {
    regex = /(?:mayorista|por\s*mayor|p\.?\s*mayor|mayor|x\s*mayor|mayoreo)[:;]?\s*\$?\s*([\d\.,’'k]+)/i;
  } else {
    regex = /(?:detal|precio\s*detal|p\.?\s*detal|unidad|precio|c\/u)[:;]?\s*\$?\s*([\d\.,’'k]+)/i;
  }

  const match = text.match(regex);
  if (match && match[1]) {
    return cleanPriceValue(match[1]);
  }

  // If normal price wasn't found with specific label, check generic price patterns
  if (type === 'normal') {
    const genericMatch = text.match(/\$\s*([\d\.,’'k]+)/i);
    if (genericMatch && genericMatch[1]) {
      return cleanPriceValue(genericMatch[1]);
    }
  }

  return 0;
}

function cleanPriceValue(val) {
  let cleaned = val.trim().toLowerCase();
  let isK = cleaned.endsWith('k');
  if (isK) cleaned = cleaned.slice(0, -1);

  // Remove dots, commas, apostrophes
  cleaned = cleaned.replace(/[^\d]/g, '');
  let num = parseInt(cleaned, 10);
  if (isNaN(num)) return 0;

  if (isK) num = num * 1000;
  // If price is written in thousands shorthand (e.g., 45 -> 45000)
  if (num > 0 && num < 1000) num = num * 1000;

  return num;
}

function extractRef(text) {
  if (!text) return '';
  const match = text.match(/(?:ref|referencia|c[oó]digo|cod):\s*([a-zA-Z0-9_\-\.]+)/i);
  return match && match[1] ? match[1].trim() : '';
}

function extractBrand(text) {
  if (!text) return '';
  const match = text.match(/(?:marca|brand):\s*([a-zA-Z0-9_\-\s]+?)(?=\n|$|,|\.)/i);
  return match && match[1] ? match[1].trim() : '';
}

function extractCategories(text) {
  if (!text) return [];
  const hashtags = text.match(/#[a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]+/g) || [];
  return hashtags.map(h => h.replace('#', '').trim());
}

function cleanTitle(rawFirstLine) {
  if (!rawFirstLine) return 'Producto de Canal';
  // Remove markdown symbols like * _ ~ and leading/trailing emojis
  let title = rawFirstLine
    .replace(/[\*\_~]/g, '')
    .replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}✨🔥🌟⭐🚨📦🛍️😍🩷💜🤩🏠💅☕️🍩]+/gu, '')
    .replace(/[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}✨🔥🌟⭐🚨📦🛍️😍🩷💜🤩🏠💅☕️🍩]+$/gu, '')
    .trim();

  if (title.length > 80) title = title.slice(0, 80).trim();
  return title || 'Producto de Canal';
}

function extractBestTitle(caption) {
  if (!caption) return 'Producto de Canal';
  const lines = caption.split('\n').map(l => l.trim()).filter(Boolean);
  const ignorePatterns = /^(?:familia\s*mayorista|buenos\s*d[ií]as|feliz\s*d[ií]a|hola|atenci[oó]n|nuevo\s*ingreso|promoci[oó]n|oferta\s*del\s*d[ií]a|llegando\s*de\s*todo|reenviado)/i;
  for (const line of lines) {
    const cleaned = cleanTitle(line);
    if (cleaned && !ignorePatterns.test(cleaned) && !cleaned.toLowerCase().startsWith('detal') && !cleaned.toLowerCase().startsWith('mayor') && !cleaned.startsWith('$') && cleaned.length > 2) {
      return cleaned;
    }
  }
  return cleanTitle(lines[0]) || 'Producto de Canal';
}

/**
 * Extract structured product from a WhatsApp Newsletter message object or node
 */
function extractProductFromMessage(msgObj, channelName = 'Canal Oficial') {
  if (!msgObj) return null;

  let caption = '';
  let imageUrl = '';
  let postId = msgObj.key?.id || msgObj.id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let timestamp = msgObj.messageTimestamp 
    ? (typeof msgObj.messageTimestamp === 'number' ? msgObj.messageTimestamp * 1000 : Number(msgObj.messageTimestamp) * 1000)
    : Date.now();

  // 1. Check if it's a standard WAMessage with protobuf message property
  const msg = msgObj.message || msgObj;
  if (msg) {
    caption = 
      msg.imageMessage?.caption || 
      msg.videoMessage?.caption || 
      msg.extendedTextMessage?.text || 
      msg.conversation || 
      msg.text || 
      '';

    imageUrl = msg.imageMessage?.url || msg.imageUrl || '';
    if (!imageUrl && msg.imageMessage?.directPath) {
      imageUrl = `https://mmg.whatsapp.net${msg.imageMessage.directPath}`;
    }
  }

  // 2. If it's a direct XML BinaryNode structure
  if (!caption && msgObj.attrs) {
    postId = msgObj.attrs.id || msgObj.attrs.server_id || postId;
    if (msgObj.attrs.t) timestamp = Number(msgObj.attrs.t) * 1000;
  }

  if (!caption && msgObj.content && Array.isArray(msgObj.content)) {
    for (const child of msgObj.content) {
      if (child && typeof child === 'object') {
        if (child.tag === 'image' || child.tag === 'video') {
          if (child.attrs?.caption) caption = child.attrs.caption;
          if (child.attrs?.url) imageUrl = child.attrs.url;
        } else if (child.tag === 'text' || child.tag === 'caption' || child.tag === 'body') {
          if (typeof child.content === 'string') caption = child.content;
          else if (child.attrs?.text) caption = child.attrs.text;
        }
      }
    }
  }

  if (!caption && !imageUrl) return null;

  const name = extractBestTitle(caption);

  // Prices (in pesos colombianos)
  const normalPriceAmount = parsePrice(caption, 'normal');
  const wholesalePriceAmount = parsePrice(caption, 'wholesale') || normalPriceAmount;

  // Divide by 1000 for standard format used in PIMS (e.g. 50.000 -> 50)
  const normalPrice = normalPriceAmount / 1000 || 0;
  const wholesalePrice = wholesalePriceAmount / 1000 || normalPrice;

  const reference = extractRef(caption);
  const brand = extractBrand(caption);
  const categories = extractCategories(caption);
  const primaryCategory = categories.length > 0 ? categories[0] : (channelName || 'General');

  return {
    id: `post_${postId}`,
    name,
    description: caption,
    normalPrice,
    wholesalePrice,
    price: normalPriceAmount,
    priceAmount1000: normalPriceAmount,
    reference,
    brand,
    category: primaryCategory,
    area: channelName || 'Catálogo',
    sectionName: channelName || 'Catálogo',
    imageUrl: imageUrl || '',
    imageUrls: imageUrl || '',
    source: 'whatsapp_channel',
    channelPostId: postId,
    createdAt: timestamp,
    updatedAt: timestamp,
    active: true,
    status: 'active',
    stock: 999
  };
}

module.exports = {
  parsePrice,
  extractRef,
  extractBrand,
  extractCategories,
  cleanTitle,
  extractProductFromMessage
};
