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
  const db = admin.firestore?.();
  if (!db) {
    return (
      <div className="p-10 text-white text-center flex flex-col items-center justify-center min-h-screen bg-black">
        <h1 className="text-3xl font-bold mb-4 text-red-500">Error Crítico 🛑</h1>
        <p>No se pudo conectar a Firebase Firestore. </p>
        <p className="text-zinc-500 mt-2">Asegúrate de agregar la variable de entorno <code className="bg-zinc-800 p-1 rounded">FIREBASE_SERVICE_ACCOUNT</code> en Vercel.</p>
      </div>
    );
  }

  const doc = await db.collection('comercios').doc(params.comercio).get();
  
  if (!doc.exists) {
    notFound(); // Triggers standard 404 page if "tudominio.com/algo-inventado"
  }

  const data = doc.data();

  return <ClientPage data={data} themeHex={data?.themeHex || '#4F46E5'} RENDER_API={RENDER_API} />;
}
