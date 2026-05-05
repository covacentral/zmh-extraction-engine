export async function processImageToWebP(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 1080;
                const rawSize = Math.min(img.width, img.height);
                const finalSize = Math.min(rawSize, MAX_SIZE);
                
                canvas.width = finalSize;
                canvas.height = finalSize;
                
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject("Canvas context not available");
                
                const offsetX = (img.width - rawSize) / 2;
                const offsetY = (img.height - rawSize) / 2;
                
                // Draw and scale down in one operation
                ctx.drawImage(img, offsetX, offsetY, rawSize, rawSize, 0, 0, finalSize, finalSize);
                
                // Export to WebP with 0.8 quality
                const webpBase64 = canvas.toDataURL('image/webp', 0.8);
                resolve(webpBase64);
            };
            img.onerror = (e) => reject("Image load error: " + e);
        };
        reader.onerror = (e) => reject("FileReader error: " + e);
    });
}
