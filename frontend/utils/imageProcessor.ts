export async function processImageToWebP(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Calculate 1:1 crop
                const size = Math.min(img.width, img.height);
                canvas.width = size;
                canvas.height = size;
                
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject("Canvas context not available");
                
                const offsetX = (img.width - size) / 2;
                const offsetY = (img.height - size) / 2;
                
                ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);
                
                // Export to WebP with 0.8 quality
                const webpBase64 = canvas.toDataURL('image/webp', 0.8);
                resolve(webpBase64);
            };
            img.onerror = (e) => reject("Image load error: " + e);
        };
        reader.onerror = (e) => reject("FileReader error: " + e);
    });
}
