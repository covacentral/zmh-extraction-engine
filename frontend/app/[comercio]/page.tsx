import { notFound } from 'next/navigation';
import ClientPage from './ClientPage';
import admin from 'firebase-admin';

// Initialize Firebase once
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.warn("WARNING: FIREBASE_SERVICE_ACCOUNT venv is missing on Vercel Backend")
    }
  } catch (e) {
    console.error("Firebase Auth Error: Missing or invalid FIREBASE_SERVICE_ACCOUNT");
  }
}

const RENDER_API = 'https://zmh-extraction-engine.onrender.com';

// Cache re-validation interval (ISR). Refreshes data automatically from Firestore every 30 seconds
export const revalidate = 30; 

export default async function ComercioServerPage({ params }: { params: { comercio: string } }) {
  try {
    const db = admin.firestore?.();
    if (!db) {
      return <div>DB Missing</div>;
    }

    const doc = await db.collection('comercios').doc(params.comercio).get();
    
    if (!doc.exists) {
      notFound();
    }

    const data = doc.data();

    // Prevent maps from throwing map is not a function
    let safeButtons = data?.buttons;
    if (!Array.isArray(safeButtons)) {
        safeButtons = [];
    }

    // Scrape precise channel names and images on the server to spare the client
    const enhancedButtons = await Promise.all(safeButtons.map(async (btn: any) => {
      let scrapedName = null;
      let scrapedImage = null;
      if (btn.url && btn.url.includes('whatsapp.com/channel/')) {
        try {
          const resp = await fetch(btn.url, { next: { revalidate: 3600 } });
          const html = await resp.text();
          const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i);
          const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
          if (titleMatch) scrapedName = titleMatch[1]
              .replace('Canal do WhatsApp', '')
              .replace('WhatsApp Channel', '')
              .replace(' – canal do WhatsApp', '')
              .trim();
          if (imageMatch) scrapedImage = imageMatch[1];
        } catch(e) { console.error("Scrape Error:", e) }
      }
      return { ...btn, scrapedName, scrapedImage };
    }));

    const safeData = { ...data, buttons: enhancedButtons };

    return <ClientPage data={safeData} themeHex={data?.themeHex || '#4F46E5'} RENDER_API={RENDER_API} />;
  } catch (error: any) {
    return (
      <div className="p-10 text-white text-center flex flex-col items-center justify-center min-h-screen bg-black">
         <h1 className="text-3xl font-bold mb-4 text-red-500">Error 500 Capturado 🛑</h1>
         <pre className="text-left bg-zinc-900 p-4 rounded text-red-400 text-sm overflow-auto max-w-[80vw]">
             {error?.message || error?.toString()}
         </pre>
      </div>
    );
  }
}
