const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
async function check() {
  const doc = await db.collection('comercios').doc('cc-bodega-mayorista').get();
  const catalog = doc.data().whatsappCatalog || [];
  console.log(JSON.stringify(catalog.slice(0, 2), null, 2));
  process.exit(0);
}
check();
