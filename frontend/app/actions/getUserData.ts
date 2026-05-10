'use server';

import { db } from '../../lib/firebaseAdmin';

export async function getVipClient(comercio: string, vipId: string) {
    if (!db || !comercio || !vipId) return null;
    try {
        const clientDoc = await db.collection('comercios').doc(comercio).collection('clientes').doc(vipId).get();
        if (clientDoc.exists) {
            return JSON.parse(JSON.stringify({ id: clientDoc.id, ...clientDoc.data() }));
        }
    } catch(e) {
        console.error("Error fetching VIP:", e);
    }
    return null;
}

export async function getAsesor(comercio: string, asesorId: string) {
    if (!db || !comercio || !asesorId) return null;
    try {
        const asesorDoc = await db.collection('comercios').doc(comercio).collection('asesores').doc(asesorId).get();
        if (asesorDoc.exists) {
            return JSON.parse(JSON.stringify({ id: asesorDoc.id, ...asesorDoc.data() }));
        }
    } catch(e) {
        console.error("Error fetching Asesor:", e);
    }
    return null;
}
